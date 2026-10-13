<?php
// test_hourly_workflow.php
// Comprehensive automated test for the hourly timer job workflow in JobKade

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/WorkerService.php';
require_once __DIR__ . '/services/JobService.php';
require_once __DIR__ . '/services/InvoiceService.php';
require_once __DIR__ . '/repositories/WorkerRepository.php';
require_once __DIR__ . '/repositories/JobRepository.php';
require_once __DIR__ . '/repositories/InvoiceRepository.php';
require_once __DIR__ . '/repositories/WalletRepository.php';
require_once __DIR__ . '/repositories/CategoryRepository.php';

function assertTest($condition, $testName) {
    if ($condition) {
        echo "[PASS] $testName\n";
    } else {
        echo "[FAIL] $testName\n";
        exit(1);
    }
}

$db = Database::getConnection();
$workerService = new WorkerService();
$jobService = new JobService();
$invoiceService = new InvoiceService();
$workerRepo = new WorkerRepository();
$jobRepo = new JobRepository();
$walletRepo = new WalletRepository();

echo "=== STARTING HOURLY TIMER WORKFLOW TESTS ===\n\n";

// 1. Get seeded worker and customer
$workerUser = (new UserRepository())->findByEmail('sunil.electric@gmail.com');
assertTest(!empty($workerUser), "Seeded worker sunil.electric@gmail.com found");
$workerProfile = $workerRepo->getProfileByUserId($workerUser['id']);
assertTest(!empty($workerProfile), "Worker profile found for user ID {$workerUser['id']}");
$workerId = (int)$workerProfile['id'];

$custUser = (new UserRepository())->findByEmail('customer@gmail.com');
assertTest(!empty($custUser), "Seeded customer customer@gmail.com found");
$customerId = (int)$custUser['id'];

// Ensure worker is verified and has job access
$workerRepo->setVerified($workerId, true);
$walletRepo->setJobAccess($workerId, true);
assertTest($walletRepo->hasJobAccess($workerId), "Worker has job access");

// 2. Test Worker Profile Update with Hourly Rate & Travelling Fee
$updateData = [
    'hourly_rate' => 1500.00,
    'travelling_fee' => 350.00,
    'bio' => 'Professional certified electrician with 10 years experience.'
];
$workerService->updateProfile($workerId, $updateData);
$updatedProfile = $workerRepo->getProfileById($workerId);
assertTest((float)$updatedProfile['hourly_rate'] === 1500.00, "Worker hourly_rate updated to 1500.00 (got {$updatedProfile['hourly_rate']})");
assertTest((float)$updatedProfile['travelling_fee'] === 350.00, "Worker travelling_fee updated to 350.00 (got {$updatedProfile['travelling_fee']})");

// Negative validation check
try {
    $workerService->updateProfile($workerId, ['hourly_rate' => -50]);
    assertTest(false, "Should reject negative hourly rate");
} catch (InvalidArgumentException $e) {
    assertTest(true, "Negative hourly rate properly rejected with validation error");
}

// 3. Customer posts a new job request
$categories = (new CategoryRepository())->getAll();
$categoryId = !empty($categories) ? (int)$categories[0]['id'] : 1;

$postRes = $jobService->postJob($customerId, [
    'category_id' => $categoryId,
    'title'       => 'Test Urgent Wiring Repair',
    'description' => 'Circuit breaker is tripping repeatedly in main house panel.',
    'address'     => '123 Galle Road, Colombo 03',
    'district'    => 'Colombo',
    'latitude'    => 6.9034,
    'longitude'   => 79.8540
]);
$jobId = (int)$postRes['job_id'];
assertTest($jobId > 0, "Job created successfully with ID $jobId");

// 4. Test Customer Cancel Assignment before arrival
// First, assign worker
$takeRes1 = $jobService->takeJob($jobId, $workerId);
assertTest($takeRes1['status'] === 'success', "Worker took the job successfully");

$jobCheck = $jobRepo->getById($jobId);
assertTest((int)$jobCheck['worker_id'] === $workerId, "Job worker_id is assigned to worker");
assertTest($jobCheck['status'] === 'in_progress', "Job status is 'in_progress'");
assertTest((float)$jobCheck['worker_hourly_rate'] === 1500.00, "Customer view returns worker hourly rate 1500.00");

// Now customer cancels assignment before arrival
$cancelRes = $jobService->cancelAssignment($jobId, $customerId);
assertTest($cancelRes['status'] === 'success', "Customer cancelled assignment before arrival");

$jobCheckAfterCancel = $jobRepo->getById($jobId);
assertTest(empty($jobCheckAfterCancel['worker_id']), "Job worker_id cleared to NULL");
assertTest($jobCheckAfterCancel['status'] === 'open', "Job status reverted to 'open'");

// Job is back in available jobs!
$openJobs = $jobService->getOpenJobs();
$found = false;
foreach ($openJobs as $oj) {
    if ((int)$oj['id'] === $jobId) {
        $found = true;
        break;
    }
}
assertTest($found, "Job is back in Available Jobs tab listing");

// 5. Worker takes the job again (First-come-first-served)
$takeRes2 = $jobService->takeJob($jobId, $workerId);
assertTest($takeRes2['status'] === 'success', "Worker took the job again");

// Test concurrency / loser attempt: second worker attempts to take it
// Create or ensure a second worker with job access
$secondWorkerUser = (new UserRepository())->findByEmail('kamal.plumber@gmail.com');
if (!$secondWorkerUser) {
    $secondWorkerUser = (new UserRepository())->findByEmail('nimal.mason@gmail.com');
}
if ($secondWorkerUser) {
    $secondProfile = $workerRepo->getProfileByUserId($secondWorkerUser['id']);
    if ($secondProfile) {
        $secondWorkerId = (int)$secondProfile['id'];
        $walletRepo->setJobAccess($secondWorkerId, true);
    }
}
if (empty($secondWorkerId)) {
    $secondWorkerId = $workerId; // same worker with access attempting to take again
}

try {
    $jobService->takeJob($jobId, $secondWorkerId);
    assertTest(false, "Second worker should not be able to take already taken job");
} catch (Exception $e) {
    assertTest($e->getMessage() === 'This job was just taken.', "Second worker received expected error: '{$e->getMessage()}'");
}

// 6. Test Arrival confirmation
$arriveRes = $jobService->confirmArrival($jobId, $customerId);
assertTest($arriveRes['status'] === 'success', "Customer confirmed arrival: 'Worker is Here'");
assertTest(!empty($arriveRes['arrived_at']), "arrived_at timestamp recorded: {$arriveRes['arrived_at']}");

// Test customer cancel disabled after arrival
try {
    $jobService->cancelAssignment($jobId, $customerId);
    assertTest(false, "Customer cancellation should be disabled after arrival");
} catch (Exception $e) {
    assertTest(strpos($e->getMessage(), 'Cancellation is disabled after worker arrival') !== false, "Cancellation correctly blocked after arrival: '{$e->getMessage()}'");
}

// 7. Test Done & Automatic Price calculation
// Let's test elapsed minutes rounding:
// If elapsed is 10 minutes -> round UP to 15 -> minimum 60 minutes -> 1 hour.
// Price = (60/60) * 1500.00 + 350.00 = 1850.00
$completeRes = $jobService->completeHourlyJob($jobId, $workerId);
assertTest($completeRes['status'] === 'success', "Worker tapped Done: job completed successfully");
assertTest((float)$completeRes['hours_worked'] === 1.00, "Hours worked is 1.00 hr minimum (got {$completeRes['hours_worked']})");
assertTest((float)$completeRes['hourly_rate'] === 1500.00, "Hourly rate is 1500.00");
assertTest((float)$completeRes['travelling_fee'] === 350.00, "Travelling fee is 350.00");
assertTest((float)$completeRes['job_amount'] === 1850.00, "Total job amount is 1850.00 (got {$completeRes['job_amount']})");

// Verify Invoice in database
$invoice = $invoiceService->getJobInvoice($jobId);
assertTest(!empty($invoice), "Invoice record created in database");
assertTest((float)$invoice['job_amount'] === 1850.00, "Invoice amount matches 1850.00");
assertTest((float)$invoice['hours_worked'] === 1.00, "Invoice hours_worked stored correctly");
assertTest((float)$invoice['travelling_fee'] === 350.00, "Invoice travelling_fee stored correctly");

// Verify Job request completed status
$finalJob = $jobRepo->getById($jobId);
assertTest($finalJob['status'] === 'completed', "Job status is 'completed'");
assertTest(!empty($finalJob['completed_at']), "Job completed_at timestamp recorded: {$finalJob['completed_at']}");

echo "\n=== ALL 16 HOURLY TIMER WORKFLOW TESTS PASSED SUCCESSFULLY! ===\n";
