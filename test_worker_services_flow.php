<?php
// test_worker_services_flow.php
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/repositories/UserRepository.php';
require_once __DIR__ . '/repositories/WorkerRepository.php';
require_once __DIR__ . '/repositories/JobRepository.php';
require_once __DIR__ . '/repositories/InvoiceRepository.php';
require_once __DIR__ . '/repositories/WalletRepository.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/JobService.php';
require_once __DIR__ . '/controllers/WorkerController.php';

function assertCondition(bool $cond, string $msg): void {
    if (!$cond) {
        echo "[FAIL] $msg\n";
        exit(1);
    }
    echo "[PASS] $msg\n";
}

echo "=== TESTING WORKER SERVICES FLOW ===\n\n";

$authService = new AuthService();
$userRepo = new UserRepository();
$workerRepo = new WorkerRepository();
$jobService = new JobService();
$jobRepo = new JobRepository();
$invoiceRepo = new InvoiceRepository();
$walletRepo = new WalletRepository();
$pdo = Database::getConnection();

// --- Test 1: Worker Registration Validation ---
echo "--- 1. Testing Registration Validation ---\n";

// A. Block if no services provided
$testEmailFail1 = 'test_no_srv_' . time() . '@example.com';
try {
    $authService->register([
        'full_name' => 'No Service Worker',
        'email'     => $testEmailFail1,
        'password'  => 'password123',
        'role'      => 'worker',
        'phone'     => '+94771000001',
        'nic'       => '199512345678',
        'district'  => 'Colombo',
        'cover_all_cities' => 1,
        'services'  => []
    ]);
    assertCondition(false, "Registration should fail if no services provided");
} catch (InvalidArgumentException $e) {
    assertCondition(true, "Registration properly blocked with 0 services: '{$e->getMessage()}'");
}

// B. Block if rate <= 0
$testEmailFail2 = 'test_zero_rate_' . time() . '@example.com';
try {
    $authService->register([
        'full_name' => 'Zero Rate Worker',
        'email'     => $testEmailFail2,
        'password'  => 'password123',
        'role'      => 'worker',
        'phone'     => '+94771000002',
        'nic'       => '199512345679',
        'district'  => 'Colombo',
        'cover_all_cities' => 1,
        'services'  => [
            ['category_id' => 1, 'title' => 'Electrical Services', 'hourly_rate' => 0]
        ]
    ]);
    assertCondition(false, "Registration should fail if hourly rate is 0");
} catch (InvalidArgumentException $e) {
    assertCondition(true, "Registration properly blocked with rate <= 0: '{$e->getMessage()}'");
}

// C. Block if more than 2 services provided
$testEmailFail3 = 'test_three_srv_' . time() . '@example.com';
try {
    $authService->register([
        'full_name' => 'Three Services Worker',
        'email'     => $testEmailFail3,
        'password'  => 'password123',
        'role'      => 'worker',
        'phone'     => '+94771000003',
        'nic'       => '199512345680',
        'district'  => 'Colombo',
        'cover_all_cities' => 1,
        'services'  => [
            ['category_id' => 1, 'title' => 'Service 1', 'hourly_rate' => 1000],
            ['category_id' => 2, 'title' => 'Service 2', 'hourly_rate' => 1200],
            ['category_id' => 3, 'title' => 'Service 3', 'hourly_rate' => 1400]
        ]
    ]);
    assertCondition(false, "Registration should fail if > 2 services provided");
} catch (InvalidArgumentException $e) {
    assertCondition(true, "Registration properly blocked with > 2 services: '{$e->getMessage()}'");
}

// D. Successful Registration with 2 services (Plumbing @ 1800, AC Repair @ 2400)
$workerEmail = 'twoservice.worker.' . time() . '@test.com';
$regResult = $authService->register([
    'full_name' => 'Two Service Pro',
    'email'     => $workerEmail,
    'password'  => 'password123',
    'role'      => 'worker',
    'phone'     => '+94771999999',
    'nic'       => '199012345678',
    'district'  => 'Colombo',
    'cover_all_cities' => 1,
    'services'  => [
        ['category_id' => 2, 'title' => 'Master Plumbing & Pipe Fitting', 'hourly_rate' => 1800.00],
        ['category_id' => 3, 'title' => 'Inverter AC Service & Gas Filling', 'hourly_rate' => 2400.00]
    ]
]);

assertCondition(!empty($regResult['user']), "Worker registered successfully");
$newUserId = (int)$regResult['user']['id'];
$workerProfile = $workerRepo->getProfileByUserId($newUserId);
assertCondition(!empty($workerProfile), "Worker profile created in database");
$newWorkerId = (int)$workerProfile['id'];

// Enable job access for test worker
$walletRepo->setJobAccess($newWorkerId, true);

// Verify profile hourly_rate matches Service 1 (1800.00)
assertCondition((float)$workerProfile['hourly_rate'] === 1800.00, "Worker profile hourly_rate initialized to Service 1 rate (1800.00)");

// Verify worker_services table records
$sStmt = $pdo->prepare("SELECT * FROM worker_services WHERE worker_id = :wid ORDER BY id ASC");
$sStmt->execute([':wid' => $newWorkerId]);
$savedServices = $sStmt->fetchAll(PDO::FETCH_ASSOC);

assertCondition(count($savedServices) === 2, "Exactly 2 services saved in worker_services table");
assertCondition((int)$savedServices[0]['category_id'] === 2, "Service 1 category is Plumbing (2)");
assertCondition($savedServices[0]['pricing_type'] === 'hourly', "Service 1 pricing_type is 'hourly'");
assertCondition((float)$savedServices[0]['price'] === 1800.00, "Service 1 hourly rate stored in price column as 1800.00");

assertCondition((int)$savedServices[1]['category_id'] === 3, "Service 2 category is AC Repair (3)");
assertCondition($savedServices[1]['pricing_type'] === 'hourly', "Service 2 pricing_type is 'hourly'");
assertCondition((float)$savedServices[1]['price'] === 2400.00, "Service 2 hourly rate stored in price column as 2400.00");

// --- Test 2: Worker Service Management Disabled ---
echo "\n--- 2. Testing Blocked Service Management ---\n";
// Add service should be blocked
$addCmd = 'C:\wamp64\bin\php\php8.2.29\php.exe -r "require \'controllers/WorkerController.php\'; (new WorkerController())->addService();"';
$addOut = shell_exec($addCmd);
$addResp = json_decode($addOut, true);
assertCondition($addResp['status'] === 'error' && strpos($addResp['message'], 'cannot be added after registration') !== false, "Worker addService action blocked with 403 error message");

// Delete service should be blocked
$delCmd = 'C:\wamp64\bin\php\php8.2.29\php.exe -r "require \'controllers/WorkerController.php\'; (new WorkerController())->deleteService();"';
$delOut = shell_exec($delCmd);
$delResp = json_decode($delOut, true);
assertCondition($delResp['status'] === 'error' && strpos($delResp['message'], 'cannot be deleted after registration') !== false, "Worker deleteService action blocked with 403 error message");

// --- Test 3: Per-Service Pricing in Timer Flow ---
echo "\n--- 3. Testing Per-Service Pricing in Timer Flow ---\n";

// Find customer
$customer = $userRepo->findByEmail('customer@gmail.com');
$customerId = (int)$customer['id'];

// Case A: Job in Category 2 (Plumbing) -> Worker rate should be 1800.00
$plumbingJobRes = $jobService->postJob($customerId, [
    'category_id' => 2,
    'title'       => 'Kitchen Sink Drain Leak',
    'description' => 'Leaking under the sink, needs immediate pipe seal.',
    'address'     => '45 Marine Drive, Colombo 03',
    'district'    => 'Colombo',
    'city'        => 'Colombo 03',
    'latitude'    => 6.9034,
    'longitude'   => 79.8540
]);
$plumbingJobId = (int)$plumbingJobRes['job_id'];

// Check rate visibility before completion
$pJobCheck = $jobRepo->getById($plumbingJobId);
// Take job
$jobService->takeJob($plumbingJobId, $newWorkerId);
$pJobAssigned = $jobRepo->getById($plumbingJobId);
assertCondition((float)$pJobAssigned['worker_hourly_rate'] === 1800.00, "Customer view returns Plumbing service rate of 1800.00 for Plumbing job");

// Confirm arrival & complete
$jobService->confirmArrival($plumbingJobId, $customerId);
$completePlumbing = $jobService->completeHourlyJob($plumbingJobId, $newWorkerId);

assertCondition((float)$completePlumbing['hourly_rate'] === 1800.00, "Done calculation used matching Plumbing service rate (1800.00)");
$invPlumbing = $invoiceRepo->getInvoiceByJobId($plumbingJobId);
assertCondition(!empty($invPlumbing), "Invoice created for Plumbing job");
assertCondition(strpos($invPlumbing['notes'], 'Rs. 1,800/hr') !== false && strpos($invPlumbing['notes'], 'Plumb') !== false, "Invoice notes contain rate and category name: '{$invPlumbing['notes']}'");

// Case B: Job in Category 3 (AC Repair) -> Worker rate should be 2400.00
$acJobRes = $jobService->postJob($customerId, [
    'category_id' => 3,
    'title'       => 'Bedroom AC Not Cooling',
    'description' => 'AC blowing warm air, needs gas refill.',
    'address'     => '45 Marine Drive, Colombo 03',
    'district'    => 'Colombo',
    'city'        => 'Colombo 03',
    'latitude'    => 6.9034,
    'longitude'   => 79.8540
]);
$acJobId = (int)$acJobRes['job_id'];

// Worker takes AC job
$jobService->takeJob($acJobId, $newWorkerId);
$acJobAssigned = $jobRepo->getById($acJobId);
assertCondition((float)$acJobAssigned['worker_hourly_rate'] === 2400.00, "Customer view returns AC Repair service rate of 2400.00 for AC job");

// Confirm arrival & complete
$jobService->confirmArrival($acJobId, $customerId);
$completeAc = $jobService->completeHourlyJob($acJobId, $newWorkerId);

assertCondition((float)$completeAc['hourly_rate'] === 2400.00, "Done calculation used matching AC Repair service rate (2400.00)");
$invAc = $invoiceRepo->getInvoiceByJobId($acJobId);
assertCondition(strpos($invAc['notes'], 'Rs. 2,400/hr') !== false && (strpos($invAc['notes'], 'AC') !== false || strpos($invAc['notes'], 'Technician') !== false), "Invoice notes contain rate and category name: '{$invAc['notes']}'");

// Case C: Job in Category 4 (Painting) -> Worker has no Painting service, should fallback to profile hourly_rate (1800.00)
$paintJobRes = $jobService->postJob($customerId, [
    'category_id' => 4,
    'title'       => 'Balcony Wall Painting',
    'description' => 'Touch up paint on exterior balcony.',
    'address'     => '45 Marine Drive, Colombo 03',
    'district'    => 'Colombo',
    'city'        => 'Colombo 03',
    'latitude'    => 6.9034,
    'longitude'   => 79.8540
]);
$paintJobId = (int)$paintJobRes['job_id'];

$jobService->takeJob($paintJobId, $newWorkerId);
$paintJobAssigned = $jobRepo->getById($paintJobId);
assertCondition((float)$paintJobAssigned['worker_hourly_rate'] === 1800.00, "Fallback rate matches profile hourly_rate (1800.00)");

$jobService->confirmArrival($paintJobId, $customerId);
$completePaint = $jobService->completeHourlyJob($paintJobId, $newWorkerId);
assertCondition((float)$completePaint['hourly_rate'] === 1800.00, "Fallback hourly rate applied in Done calculation");
$invPaint = $invoiceRepo->getInvoiceByJobId($paintJobId);
assertCondition(strpos($invPaint['notes'], 'Rs. 1,800/hr') !== false && strpos($invPaint['notes'], 'Paint') !== false, "Invoice notes show applied rate with Painting category: '{$invPaint['notes']}'");

// --- Cleanup test data ---
$pdo->prepare("DELETE FROM job_invoices WHERE job_id IN (?, ?, ?)")->execute([$plumbingJobId, $acJobId, $paintJobId]);
$pdo->prepare("DELETE FROM job_requests WHERE id IN (?, ?, ?)")->execute([$plumbingJobId, $acJobId, $paintJobId]);
$pdo->prepare("DELETE FROM worker_services WHERE worker_id = ?")->execute([$newWorkerId]);
$pdo->prepare("DELETE FROM worker_categories WHERE worker_id = ?")->execute([$newWorkerId]);
$pdo->prepare("DELETE FROM worker_coverage WHERE worker_id = ?")->execute([$newWorkerId]);
$pdo->prepare("DELETE FROM worker_profiles WHERE id = ?")->execute([$newWorkerId]);
$pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$newUserId]);

echo "\n=== ALL WORKER SERVICES & HOURLY PRICING TESTS PASSED SUCCESSFULLY! ===\n";
