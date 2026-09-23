<?php
// test_worker_registration_rules.php
// Comprehensive automated test suite for Worker Registration Rules & KYC Integrity

require_once __DIR__ . "/config/Database.php";
require_once __DIR__ . "/services/AuthService.php";
require_once __DIR__ . "/services/KycService.php";
require_once __DIR__ . "/services/AdminService.php";
require_once __DIR__ . "/repositories/UserRepository.php";
require_once __DIR__ . "/repositories/WorkerRepository.php";
require_once __DIR__ . "/repositories/KycRepository.php";

echo "==================================================\n";
echo " Running Job Kade Worker Registration & KYC Rules Tests\n";
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

// --- Test 1: Worker registration without NIC document fails ---
echo "--- [Test 1: Worker Registration without NIC Document (KYC MUST)] ---\n";
$threwNicError = false;
try {
    $authService->register([
        "full_name" => "Test Worker No NIC",
        "email" => "test.worker1@example.com",
        "password" => "secret123",
        "phone" => "0771122334",
        "role" => "worker",
        "nic" => "199512345678",
        "service" => "electrical",
        "police_report" => "uploads/kyc/test_police.pdf"
        // Missing nic_document
    ]);
} catch (InvalidArgumentException $e) {
    $threwNicError = true;
    echo "  Caught expected error: " . $e->getMessage() . "\n";
}
assertTest($threwNicError, "Worker registration without NIC document was correctly rejected (KYC MUST)");

// --- Test 2: Worker registration without Police Report fails ---
echo "\n--- [Test 2: Worker Registration without Police Report (Police MUST)] ---\n";
$threwPoliceError = false;
try {
    $authService->register([
        "full_name" => "Test Worker No Police",
        "email" => "test.worker2@example.com",
        "password" => "secret123",
        "phone" => "0771122335",
        "role" => "worker",
        "nic" => "199512345679",
        "nic_document" => "uploads/kyc/test_nic.pdf",
        "service" => "plumbing"
        // Missing police_report
    ]);
} catch (InvalidArgumentException $e) {
    $threwPoliceError = true;
    echo "  Caught expected error: " . $e->getMessage() . "\n";
}
assertTest($threwPoliceError, "Worker registration without Police Report was correctly rejected (Police Report MUST)");

// --- Test 3: Worker registration with NIC + Police Report, WITHOUT Qualification (Optional) succeeds ---
echo "\n--- [Test 3: Worker Registration with NIC + Police Report & NO Qualification (Optional)] ---\n";
$res3 = $authService->register([
    "full_name" => "Test Worker Valid No Qual",
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

assertTest($res3["status"] === "success", "Worker registered successfully with mandatory documents");
assertTest(!empty($res3["token"]), "JWT Token issued for new worker");
$workerId3 = (int)$res3["user"]["worker_id"];
assertTest($workerId3 > 0, "Worker profile created with ID: {$workerId3}");

// Verify KYC documents created
$docs3 = $kycRepo->getDocumentsByWorkerId($workerId3);
assertTest(count($docs3) === 2, "Exactly 2 mandatory KYC documents created (NIC + Police Report)");

$docTypes3 = array_column($docs3, "document_type");
assertTest(in_array("nic", $docTypes3), "NIC document is registered in KYC table");
assertTest(in_array("police_report", $docTypes3), "Police Report is registered in KYC table");

// Verify worker profile status is pending
$profile3 = $workerRepo->getProfileById($workerId3);
assertTest($profile3["verify_status"] === "pending", "Worker verification status is pending");
assertTest((int)$profile3["is_verified"] === 0, "Worker is_verified is 0 (Unverified until approved)");

// --- Test 4: Worker registration with NIC + Police Report + Trade Qualification (Optional provided) succeeds ---
echo "\n--- [Test 4: Worker Registration with NIC + Police Report + Qualification] ---\n";
$res4 = $authService->register([
    "full_name" => "Test Worker With Qual",
    "email" => "test.worker4@example.com",
    "password" => "secret123",
    "phone" => "0771122337",
    "role" => "worker",
    "nic" => "199512345681",
    "nic_document" => "uploads/kyc/test_nic_worker4.pdf",
    "police_report" => "uploads/kyc/test_police_worker4.pdf",
    "qualification_document" => "uploads/kyc/test_nvq_worker4.pdf",
    "service" => "carpentry",
    "location" => "Nugegoda"
]);

assertTest($res4["status"] === "success", "Worker registered successfully with all documents");
$workerId4 = (int)$res4["user"]["worker_id"];
$docs4 = $kycRepo->getDocumentsByWorkerId($workerId4);
assertTest(count($docs4) === 3, "All 3 documents recorded in KYC table (NIC, Police Report, Trade Certificate)");

$docTypes4 = array_column($docs4, "document_type");
assertTest(in_array("nic", $docTypes4), "NIC document present");
assertTest(in_array("police_report", $docTypes4), "Police report present");
assertTest(in_array("trade_certificate", $docTypes4), "Trade certificate / Qualification present");

// --- Test 5: Admin moderation on Police Report ---
echo "\n--- [Test 5: Admin Moderation on Police Report] ---\n";
$policeDoc = null;
foreach ($docs4 as $d) {
    if ($d["document_type"] === "police_report") {
        $policeDoc = $d;
        break;
    }
}
assertTest($policeDoc !== null, "Found Police Report document in queue");
$adminRes = $adminService->verifyKyc((int)$policeDoc["id"], "approved", "Police report verified clear.", 1);
assertTest($adminRes["status"] === "success", "Admin approved Police Report successfully");

// Clean up test data
$db->exec("DELETE FROM users WHERE email LIKE 'test.worker%@example.com'");

echo "\n==================================================\n";
echo " ALL WORKER REGISTRATION & KYC TESTS PASSED! (100%)\n";
echo "==================================================\n";

