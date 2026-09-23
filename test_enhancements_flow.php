<?php
/**
 * Test Suite: Enhancements Verification Flow
 * Tests Worker Custom Services, User Profile Updates, Password Changes, and Wallet Payout/Top-up Requests.
 */

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/repositories/UserRepository.php';
require_once __DIR__ . '/repositories/WorkerRepository.php';
require_once __DIR__ . '/repositories/WorkerServiceRepository.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/WorkerService.php';
require_once __DIR__ . '/services/WalletService.php';

$pdo = Database::getConnection();
$passed = 0;
$failed = 0;

function assertCondition($name, $cond, $msg = '') {
    global $passed, $failed;
    if ($cond) {
        echo "[PASS] $name\n";
        $passed++;
    } else {
        echo "[FAIL] $name: $msg\n";
        $failed++;
    }
}

echo "==================================================\n";
echo "--- TESTING ENHANCEMENTS ARCHITECTURE & FLOWS ---\n";
echo "==================================================\n";

$authService = new AuthService();
$workerService = new WorkerService();
$walletService = new WalletService();

// 1. Test User Registration & Profile Update
$testEmail = 'enhancement_user_' . time() . '@test.com';
$regRes = $authService->register([
    'full_name' => 'Initial Name',
    'email' => $testEmail,
    'phone' => '0779998888',
    'password' => 'Password123!',
    'role' => 'worker',
    'nic' => '199012345678',
    'service' => 'electrical',
    'nic_document' => 'uploads/kyc/test_nic.jpg',
    'police_report' => 'uploads/kyc/test_police.pdf'
]);

assertCondition("User registration succeeds", $regRes['status'] === 'success', $regRes['message'] ?? '');
$userId = $regRes['user']['id'];

// Test Profile Update
$updateRes = $authService->updateProfile($userId, [
    'full_name' => 'Updated Worker Name',
    'phone' => '0771112222',
    'address' => 'Colombo 07, Western Province',
    'notification_prefs' => json_encode(['job_alerts' => true, 'sms_notifs' => false])
]);
assertCondition("Profile update succeeds", $updateRes['status'] === 'success', $updateRes['message'] ?? '');

$userRepo = new UserRepository();
$userProfile = $userRepo->findById($userId);
assertCondition("Profile reflects updated name", $userProfile['full_name'] === 'Updated Worker Name');
assertCondition("Profile reflects updated phone", $userProfile['phone'] === '0771112222');
assertCondition("Profile reflects updated address", $userProfile['address'] === 'Colombo 07, Western Province');
assertCondition("Profile reflects notification preferences", !empty($userProfile['notification_prefs']));

// 2. Test Password Change
// Wrong current password
$wrongPassFailed = false;
try {
    $authService->changePassword($userId, 'WrongPass123!', 'NewSecretPass123!');
} catch (Exception $e) {
    $wrongPassFailed = true;
}
assertCondition("Wrong current password is rejected", $wrongPassFailed);

// Short new password
$shortPassFailed = false;
try {
    $authService->changePassword($userId, 'Password123!', '123');
} catch (Exception $e) {
    $shortPassFailed = true;
}
assertCondition("Short new password is rejected", $shortPassFailed);

// Valid password change
$validPassRes = $authService->changePassword($userId, 'Password123!', 'NewSecretPass123!');
assertCondition("Valid password change succeeds", $validPassRes['status'] === 'success');

// Verify login with new password
$newLoginRes = $authService->login($testEmail, 'NewSecretPass123!');
assertCondition("Login succeeds with new password", $newLoginRes['status'] === 'success');

// Verify old password fails
$oldLoginFailed = false;
try {
    $authService->login($testEmail, 'Password123!');
} catch (Exception $e) {
    $oldLoginFailed = true;
}
assertCondition("Login fails with old password", $oldLoginFailed);

// 3. Test Worker Custom Services
// Add service 1
$srvRes1 = $workerService->addCustomService($userId, [
    'title' => 'Emergency AC Leak Repair',
    'category_id' => 1,
    'description' => 'Fast 1-hour response AC refrigerant leak repair & gas charging.',
    'price' => 3500.00,
    'pricing_type' => 'fixed',
    'location' => 'Colombo and Gampaha'
]);
assertCondition("Worker adds custom service 1", $srvRes1['status'] === 'success');
$serviceId1 = $srvRes1['service_id'];

// Add service 2
$srvRes2 = $workerService->addCustomService($userId, [
    'title' => 'Full House Electrical Wiring Inspection',
    'category_id' => 1,
    'description' => 'Detailed multi-point circuit analysis with test report.',
    'price' => 1200.00,
    'pricing_type' => 'hourly',
    'location' => 'Western Province'
]);
assertCondition("Worker adds custom service 2", $srvRes2['status'] === 'success');
$serviceId2 = $srvRes2['service_id'];

// Get worker's services
$myServicesRes = $workerService->getMyServices($userId);
assertCondition("Worker retrieves services list", $myServicesRes['status'] === 'success' && count($myServicesRes['services']) >= 2);

// Delete service 1
$delRes = $workerService->deleteCustomService($serviceId1, $userId);
assertCondition("Worker deletes service 1", $delRes === true);

$afterDelRes = $workerService->getMyServices($userId);
$remainingIds = array_column($afterDelRes['services'], 'id');
assertCondition("Deleted service is no longer in list", !in_array($serviceId1, $remainingIds));
assertCondition("Remaining service exists", in_array($serviceId2, $remainingIds));

// 4. Test Wallet Top-up & Payout Requests
// Top up wallet
$topUpRes = $walletService->topUp($userId, 5000.00);
assertCondition("Wallet top-up of Rs. 5,000 succeeds", $topUpRes['status'] === 'success');
assertCondition("Wallet balance updated to >= 5,000", $topUpRes['wallet_balance'] >= 5000.00);

// Request payout with valid details
$payoutRes = $walletService->requestPayout($userId, [
    'amount' => 2000.00,
    'bank_name' => 'Commercial Bank of Ceylon',
    'account_number' => '8001234567',
    'account_name' => 'Updated Worker Name',
    'branch_name' => 'Kollupitiya'
]);
assertCondition("Payout request for Rs. 2,000 succeeds", $payoutRes['status'] === 'success');
assertCondition("Balance deducted by Rs. 2,000", $payoutRes['wallet_balance'] == ($topUpRes['wallet_balance'] - 2000.00));

// Request payout exceeding balance
$excessiveFailed = false;
try {
    $walletService->requestPayout($userId, [
        'amount' => 100000.00,
        'bank_name' => 'Commercial Bank of Ceylon',
        'account_number' => '8001234567',
        'account_name' => 'Updated Worker Name'
    ]);
} catch (Exception $e) {
    $excessiveFailed = true;
}
assertCondition("Excessive payout request is rejected", $excessiveFailed);

// Minimum payout validation
$tooSmallFailed = false;
try {
    $walletService->requestPayout($userId, [
        'amount' => 500.00,
        'bank_name' => 'Commercial Bank of Ceylon',
        'account_number' => '8001234567',
        'account_name' => 'Updated Worker Name'
    ]);
} catch (Exception $e) {
    $tooSmallFailed = true;
}
assertCondition("Payout below minimum (Rs. 1,000) is rejected", $tooSmallFailed);

echo "\n==================================================\n";
echo "SUMMARY: Passed: $passed | Failed: $failed\n";
echo "==================================================\n";

if ($failed > 0) {
    exit(1);
}
exit(0);
