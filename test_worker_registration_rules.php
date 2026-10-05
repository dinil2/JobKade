<?php
// test_worker_registration_rules.php
// Comprehensive automated test suite for Worker Registration Rules & Verification Gates

require_once __DIR__ . "/config/Database.php";
require_once __DIR__ . "/config/JWT.php";
require_once __DIR__ . "/services/AuthService.php";
require_once __DIR__ . "/services/KycService.php";
require_once __DIR__ . "/services/AdminService.php";
require_once __DIR__ . "/services/JobService.php";
require_once __DIR__ . "/repositories/UserRepository.php";
require_once __DIR__ . "/repositories/WorkerRepository.php";
require_once __DIR__ . "/repositories/KycRepository.php";

echo "==================================================\n";
echo " Running Job Kade Worker Registration & Verification Rules Tests\n";
echo "==================================================\n\n";

$authService = new AuthService();
$kycService = new KycService();
$adminService = new AdminService();
$userRepo = new UserRepository();
$workerRepo = new WorkerRepository();
$kycRepo = new KycRepository();
$db = Database::getConnection();

function assertTest(bool $condition, string $label): void {
    if ($condition) {
        echo " [PASS] " . $label . "\n";
    } else {
        echo " [FAIL] " . $label . "\n";
        exit(1);
    }
}

// Clean up any previous test worker accounts
$db->exec("DELETE FROM users WHERE email LIKE 'test.worker%@example.com'");

// --- Test 1: Worker registration without NIC number fails ---
echo "--- [Test 1: Worker Registration without NIC number fails] ---\n";
$threwNicNumError = false;
try {
    $authService->register([
        "full_name" => "Test Worker No NIC Num",
        "email" => "test.worker1@example.com",
        "password" => "secret123",
        "phone" => "0771122334",
        "role" => "worker",
        "nic" => "", // Missing mandatory NIC
        "service" => "electrical"
    ]);
} catch (InvalidArgumentException $e) {
    $threwNicNumError = true;
    echo "  Caught expected error: " . $e->getMessage() . "\n";
}
assertTest($threwNicNumError, "Worker registration without NIC number was correctly rejected");

// --- Test 2: Worker can register without documents (Status: unverified) ---
echo "\n--- [Test 2: Worker Registration without documents succeeds (unverified)] ---\n";
$res2 = $authService->register([
    "full_name" => "Test Worker Unverified",
    "email" => "test.worker2@example.com",
    "password" => "secret123",
    "phone" => "0771122335",
    "role" => "worker",
    "nic" => "199512345679",
    "service" => "plumbing",
    "location" => "Colombo"
]);
assertTest($res2["status"] === "success", "Worker registered successfully without immediate document uploads");
$workerId2 = (int)$res2["user"]["worker_id"];
$profile2 = $workerRepo->getProfileById($workerId2);
assertTest($profile2["verify_status"] === "unverified", "Initial status is 'unverified'");
assertTest((int)$profile2["is_verified"] === 0, "Initial is_verified is 0");
assertTest(!$workerRepo->isVerified($workerId2), "WorkerRepository::isVerified returns false for unverified worker");

// --- Test 3: Worker registration with documents succeeds (Status: pending) ---
echo "\n--- [Test 3: Worker Registration with KYC documents succeeds (pending)] ---\n";
$res3 = $authService->register([
    "full_name" => "Test Worker Pending",
    "email" => "test.worker3@example.com",
    "password" => "secret123",
    "phone" => "0771122336",
    "role" => "worker",
    "nic" => "199512345680",
    "nic_document" => "uploads/kyc/test_nic_worker3.pdf",
    "police_report" => "uploads/kyc/test_police_worker3.pdf",
    "service" => "ac-repair",
    "location" => "Colombo 03"
]);

assertTest($res3["status"] === "success", "Worker registered successfully with documents");
$workerId3 = (int)$res3["user"]["worker_id"];
$docs3 = $kycRepo->getDocumentsByWorkerId($workerId3);
assertTest(count($docs3) === 2, "KYC documents recorded in database");
$profile3 = $workerRepo->getProfileById($workerId3);
assertTest($profile3["verify_status"] === "pending", "Worker verification status is 'pending'");
assertTest((int)$profile3["is_verified"] === 0, "Worker is_verified is 0");
assertTest(!$workerRepo->isVerified($workerId3), "WorkerRepository::isVerified returns false for pending worker");

// --- Test 4: Unverified/Pending worker verification gates on JobController ---
echo "\n--- [Test 4: Verification Gates for Unverified/Pending Worker] ---\n";

function runJobApiSubprocess(string $action, ?string $token = null, array $getParams = [], array $postData = []): array {
    $phpBin = PHP_BINARY;
    $runner = __DIR__ . '/test_api_runner.php';
    $cmd = sprintf(
        '"%s" "%s" %s %s %s %s',
        $phpBin,
        $runner,
        escapeshellarg($action),
        escapeshellarg($token ?? ''),
        base64_encode(json_encode($getParams)),
        base64_encode(json_encode($postData))
    );

    $rawOutput = shell_exec($cmd) ?: '';
    $parts = explode('__HTTP_STATUS__:', $rawOutput);
    $body = trim($parts[0] ?? '');
    $status = isset($parts[1]) ? (int)trim($parts[1]) : 200;
    $data = json_decode($body, true);

    return [
        'status' => $status,
        'data'   => $data,
        'body'   => $body
    ];
}

$jobService = new JobService();
$openJobs = $jobService->getOpenJobs();
if (empty($openJobs)) {
    $jobRes = $jobService->postJob(2, [
        'category_id' => 1,
        'title'       => 'Test Electrical Repair',
        'description' => 'Fix main circuit breaker in living room',
        'address'     => 'Colombo 07',
        'latitude'    => 6.9271,
        'longitude'   => 79.8612
    ]);
    $testJobId = (int)$jobRes['job_id'];
} else {
    $testJobId = (int)$openJobs[0]['id'];
}

$unverifiedToken = $res2["token"];
$pendingToken = $res3["token"];

// Test listOpen for unverified worker -> 403
$listResUnverified = runJobApiSubprocess('list', $unverifiedToken);
assertTest($listResUnverified['status'] === 403, "Unverified worker listOpen returns HTTP 403");
assertTest(str_contains($listResUnverified['data']['message'] ?? '', 'verified by an administrator'), "403 message explains verification requirement");

// Test details for unverified worker -> 403
$detailsResUnverified = runJobApiSubprocess('details', $unverifiedToken, ['id' => $testJobId]);
assertTest($detailsResUnverified['status'] === 403, "Unverified worker details returns HTTP 403");
assertTest(str_contains($detailsResUnverified['data']['message'] ?? '', 'verified by an administrator'), "403 message returned for details");

// Test apply for unverified worker -> 403
$applyResUnverified = runJobApiSubprocess('apply', $unverifiedToken, [], ['job_id' => $testJobId, 'quoted_price' => 2500]);
assertTest($applyResUnverified['status'] === 403, "Unverified worker apply returns HTTP 403");
assertTest(($applyResUnverified['data']['message'] ?? '') === 'Only verified workers can apply for jobs.', "403 message is 'Only verified workers can apply for jobs.'");

// Test listOpen for pending worker -> 403
$listResPending = runJobApiSubprocess('list', $pendingToken);
assertTest($listResPending['status'] === 403, "Pending worker listOpen returns HTTP 403");

// --- Test 5: Admin moderation approves worker ---
echo "\n--- [Test 5: Admin Moderation Approves Worker] ---\n";
$workerRepo->updateVerificationStatus($workerId3, 'verified');
$profile3Updated = $workerRepo->getProfileById($workerId3);
assertTest($profile3Updated["verify_status"] === "verified", "Worker verify_status is now 'verified'");
assertTest((int)$profile3Updated["is_verified"] === 1, "Worker is_verified is now 1");
assertTest($workerRepo->isVerified($workerId3), "WorkerRepository::isVerified returns true for verified worker (profile ID)");
assertTest($workerRepo->isVerified((int)$profile3Updated["user_id"]), "WorkerRepository::isVerified returns true for verified worker (user ID)");

// --- Test 6: Verified worker gets 200 on list, 200 on details ---
echo "\n--- [Test 6: Verified Worker Access] ---\n";
$listResVerified = runJobApiSubprocess('list', $pendingToken);
assertTest($listResVerified['status'] === 200, "Verified worker listOpen returns HTTP 200");
assertTest(($listResVerified['data']['status'] ?? '') === 'success', "Verified worker received jobs payload");

$detailsResVerified = runJobApiSubprocess('details', $pendingToken, ['id' => $testJobId]);
assertTest($detailsResVerified['status'] === 200, "Verified worker details returns HTTP 200");

// --- Test 7: Customer and guest can view open jobs as before ---
echo "\n--- [Test 7: Guest and Customer Access Unchanged] ---\n";
// Guest (no token)
$listResGuest = runJobApiSubprocess('list', null);
assertTest($listResGuest['status'] === 200, "Guest listOpen returns HTTP 200");

// Customer
$customerToken = JWT::encode([
    'user_id' => 2,
    'email'   => 'customer@example.com',
    'role'    => 'customer',
    'name'    => 'Customer Test'
]);
$listResCustomer = runJobApiSubprocess('list', $customerToken);
assertTest($listResCustomer['status'] === 200, "Customer listOpen returns HTTP 200");

// Clean up test data
$db->exec("DELETE FROM users WHERE email LIKE 'test.worker%@example.com'");

echo "\n==================================================\n";
echo " ALL WORKER REGISTRATION & VERIFICATION TESTS PASSED! (100%)\n";
echo "==================================================\n";
