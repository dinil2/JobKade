<?php
// test_verification_manual_cases.php

require_once __DIR__ . "/config/Database.php";
require_once __DIR__ . "/config/JWT.php";
require_once __DIR__ . "/services/AuthService.php";
require_once __DIR__ . "/services/JobService.php";
require_once __DIR__ . "/repositories/WorkerRepository.php";

echo "========================================================\n";
echo " Verifying Manual Test Cases with Three Tokens\n";
echo "========================================================\n\n";

$db = Database::getConnection();
$authService = new AuthService();
$workerRepo = new WorkerRepository();
$jobService = new JobService();

// Clean up previous test users
$db->exec("DELETE FROM users WHERE email LIKE 'manual_test_%@example.com'");

// 1. Setup an Unverified Worker (verify_status = 'pending')
$unverifiedWorkerRes = $authService->register([
    "full_name" => "Pending Worker Manual Test",
    "email" => "manual_test_pending@example.com",
    "password" => "password123",
    "phone" => "0771234567",
    "role" => "worker",
    "nic" => "199123456789",
    "service" => "electrical",
    "location" => "Colombo"
]);
$pendingWorkerId = (int)$unverifiedWorkerRes['user']['worker_id'];
$workerRepo->updateVerificationStatus($pendingWorkerId, 'pending');
$pendingToken = $unverifiedWorkerRes['token'];

// 2. Setup a Verified Worker (verify_status = 'verified')
$verifiedWorkerRes = $authService->register([
    "full_name" => "Verified Worker Manual Test",
    "email" => "manual_test_verified@example.com",
    "password" => "password123",
    "phone" => "0771234568",
    "role" => "worker",
    "nic" => "199123456790",
    "service" => "plumbing",
    "location" => "Colombo"
]);
$verifiedWorkerId = (int)$verifiedWorkerRes['user']['worker_id'];
$workerRepo->updateVerificationStatus($verifiedWorkerId, 'verified');
$verifiedToken = $verifiedWorkerRes['token'];

// 3. Customer Token & Logged-out Guest
$customerLoginRes = $authService->login("customer@gmail.com", "customer@123");
$customerToken = $customerLoginRes['token'];
$guestToken = null;

// Ensure at least one open job exists for details testing
$openJobs = $jobService->getOpenJobs();
if (empty($openJobs)) {
    $createdJob = $jobService->postJob((int)$customerLoginRes['user']['id'], [
        'category_id' => 1,
        'title'       => 'Test Leak Repair',
        'description' => 'Pipe repair in kitchen required immediately.',
        'address'     => 'Colombo 05',
        'latitude'    => 6.9271,
        'longitude'   => 79.8612
    ]);
    $jobId = (int)$createdJob['job_id'];
} else {
    $jobId = (int)$openJobs[0]['id'];
}

function runApi(string $action, ?string $token, array $get = [], array $post = []): array {
    $phpBin = PHP_BINARY;
    $runner = __DIR__ . '/test_api_runner.php';
    $cmd = sprintf(
        '"%s" "%s" %s %s %s %s',
        $phpBin,
        $runner,
        escapeshellarg($action),
        escapeshellarg($token ?? ''),
        base64_encode(json_encode($get)),
        base64_encode(json_encode($post))
    );
    $raw = shell_exec($cmd) ?: '';
    $parts = explode('__HTTP_STATUS__:', $raw);
    $status = isset($parts[1]) ? (int)trim($parts[1]) : 200;
    $data = json_decode(trim($parts[0] ?? ''), true);
    return ['status' => $status, 'data' => $data];
}

echo "--- CASE (A): Unverified Worker (verify_status = 'pending') ---\n";
// (a.1) GET api/jobs.php?action=list -> 403
$resA1 = runApi('list', $pendingToken);
echo "  GET ?action=list -> HTTP " . $resA1['status'] . " : " . ($resA1['data']['message'] ?? '') . "\n";
if ($resA1['status'] !== 403) exit(1);

// (a.2) GET api/jobs.php?action=details&id=X -> 403
$resA2 = runApi('details', $pendingToken, ['id' => $jobId]);
echo "  GET ?action=details&id={$jobId} -> HTTP " . $resA2['status'] . " : " . ($resA2['data']['message'] ?? '') . "\n";
if ($resA2['status'] !== 403) exit(1);

// (a.3) POST api/jobs.php?action=apply -> 403
$resA3 = runApi('apply', $pendingToken, [], ['job_id' => $jobId, 'quoted_price' => 3000]);
echo "  POST ?action=apply -> HTTP " . $resA3['status'] . " : " . ($resA3['data']['message'] ?? '') . "\n";
if ($resA3['status'] !== 403) exit(1);

echo "\n--- CASE (B): Verified Worker (verify_status = 'verified') ---\n";
// (b.1) GET api/jobs.php?action=list -> 200 with job list
$resB1 = runApi('list', $verifiedToken);
echo "  GET ?action=list -> HTTP " . $resB1['status'] . " (Jobs count: " . count($resB1['data']['jobs'] ?? []) . ")\n";
if ($resB1['status'] !== 200 || !isset($resB1['data']['jobs'])) exit(1);

// (b.2) GET api/jobs.php?action=details&id=X -> 200
$resB2 = runApi('details', $verifiedToken, ['id' => $jobId]);
echo "  GET ?action=details&id={$jobId} -> HTTP " . $resB2['status'] . " (Job: " . ($resB2['data']['job']['title'] ?? 'found') . ")\n";
if ($resB2['status'] !== 200) exit(1);

echo "\n--- CASE (C): Customer Login and Logged-Out Guest ---\n";
// (c.1) Customer Login -> 200
$resC1 = runApi('list', $customerToken);
echo "  Customer GET ?action=list -> HTTP " . $resC1['status'] . " (Jobs count: " . count($resC1['data']['jobs'] ?? []) . ")\n";
if ($resC1['status'] !== 200) exit(1);

// (c.2) Logged-out Guest -> 200
$resC2 = runApi('list', $guestToken);
echo "  Guest GET ?action=list -> HTTP " . $resC2['status'] . " (Jobs count: " . count($resC2['data']['jobs'] ?? []) . ")\n";
if ($resC2['status'] !== 200) exit(1);

// Clean up
$db->exec("DELETE FROM users WHERE email LIKE 'manual_test_%@example.com'");

echo "\n========================================================\n";
echo " ALL MANUAL TEST CASES PASSED PERFECTLY!\n";
echo "========================================================\n";
