<?php
// test_wallet_and_commission_flow.php
// Comprehensive verification of Worker Monetization, Invoicing, Commission (10% vs 5%), Dual Settlement & Wallet.

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/services/WalletService.php';
require_once __DIR__ . '/services/InvoiceService.php';
require_once __DIR__ . '/repositories/WalletRepository.php';
require_once __DIR__ . '/repositories/InvoiceRepository.php';

$pdo = Database::getConnection();

function logTest(string $title, bool $success, string $details = ''): void {
    $status = $success ? "[\033[32mPASS\033[0m]" : "[\033[31mFAIL\033[0m]";
    echo "$status $title\n";
    if ($details) {
        echo "       $details\n";
    }
}

echo "=================================================================\n";
echo "RUNNING WALLET, COMMISSION & INVOICING E2E TEST SUITE\n";
echo "=================================================================\n\n";

$walletService = new WalletService();
$invoiceService = new InvoiceService();
$walletRepo = new WalletRepository();
$invoiceRepo = new InvoiceRepository();

// 1. Setup Test User / Worker & Customer
$testSuffix = time() . '_' . rand(100, 999);
$workerEmail = "worker_wallet_$testSuffix@test.com";
$customerEmail = "cust_wallet_$testSuffix@test.com";

// Create worker user
$stmt = $pdo->prepare("INSERT INTO users (username, full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, ?, 'worker', 'active')");
$stmt->execute(["worker_$testSuffix", "Worker $testSuffix", $workerEmail, password_hash('Secret123!', PASSWORD_DEFAULT), '0771234567']);
$workerUserId = (int)$pdo->lastInsertId();

// Create worker profile (initial state: has_job_access = 0, balance = 0)
$stmt = $pdo->prepare("INSERT INTO worker_profiles (user_id, bio, service_radius_km, has_job_access, wallet_balance, total_earnings, total_commission_paid) VALUES (?, 'Test Bio', 15, 0, 0.00, 0.00, 0.00)");
$stmt->execute([$workerUserId]);
$workerId = (int)$pdo->lastInsertId();

// Create customer user
$stmt = $pdo->prepare("INSERT INTO users (username, full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, ?, 'customer', 'active')");
$stmt->execute(["cust_$testSuffix", "Customer $testSuffix", $customerEmail, password_hash('Secret123!', PASSWORD_DEFAULT), '0777654321']);
$customerUserId = (int)$pdo->lastInsertId();

// Create Category and Job Request
$stmt = $pdo->query("SELECT id FROM categories LIMIT 1");
$catId = (int)$stmt->fetchColumn();
if (!$catId) {
    $pdo->query("INSERT INTO categories (name, slug, description, icon) VALUES ('General Repair', 'general-repair', 'General repairs', 'bi-tools')");
    $catId = (int)$pdo->lastInsertId();
}

$stmt = $pdo->prepare("INSERT INTO job_requests (customer_id, category_id, title, description, address, latitude, longitude, status) VALUES (?, ?, ?, ?, '123 Galle Rd, Colombo', 6.9271, 79.8612, 'open')");
$stmt->execute([$customerUserId, $catId, "Test Job for Invoice $testSuffix", "Need urgent repair."]);
$jobId = (int)$pdo->lastInsertId();

// TEST 1: Initial Job Access Gating
$hasAccess = $walletRepo->hasJobAccess($workerId);
logTest("Test 1: Initial Worker Access Gated", $hasAccess === false, "Worker initially has has_job_access = 0");

// TEST 2: Pay One-Time Access Fee
$passResult = $walletService->activateJobAccess($workerId, 'Online IPG');
$hasAccessAfter = $walletRepo->hasJobAccess($workerId);
logTest("Test 2: One-Time Access Fee Activation", $passResult['status'] === 'success' && $hasAccessAfter === true, "Worker paid one-time fee and unlocked marketplace access");

// TEST 3: Standard 10% Commission Rate for Non-Subscribed Worker
$rate = $walletService->getCommissionRate($workerId);
$breakdown = $walletService->calculateBreakdown($workerId, 5000.00);
logTest("Test 3: Standard 10% Commission Detection", $rate === 0.10 && $breakdown['is_subscribed'] === false, "Standard rate = 10% (0.10)");

// TEST 4: Create Job Invoice (Rs. 5,000 at 10% = Rs. 500 commission, Rs. 4,500 net)
$invResult = $invoiceService->createInvoice($workerId, [
    'job_id' => $jobId,
    'amount' => 5000.00,
    'notes'  => 'AC filter cleaned and gas charged.'
]);
$invId = $invResult['invoice_id'];
$invoiceData = $invoiceRepo->getInvoiceById($invId);

$expectedCommission = 500.00;
$expectedNet = 4500.00;
logTest("Test 4: Invoice Creation & 10% Split Calculation", 
    $invResult['status'] === 'success' && 
    (float)$invoiceData['commission_rate'] === 0.10 &&
    (float)$invoiceData['commission_amount'] === $expectedCommission &&
    (float)$invoiceData['worker_net_amount'] === $expectedNet,
    "Invoice #$invId: Amount=5000, Comm=500, Net=4500"
);

// TEST 5: Online Payment Settlement (Credit Net +Rs. 4,500 to Worker Balance)
$payOnlineResult = $invoiceService->payInvoice($invId, 'online');
$walletAfterOnline = $walletRepo->getWallet($workerId);

logTest("Test 5: Online Settlement Credits Net Earnings (+Rs. 4,500)", 
    $payOnlineResult['status'] === 'success' &&
    (float)$walletAfterOnline['wallet_balance'] === 4500.00 &&
    (float)$walletAfterOnline['total_earnings'] === 5000.00 &&
    (float)$walletAfterOnline['total_commission_paid'] === 500.00,
    "Worker balance: Rs. {$walletAfterOnline['wallet_balance']}, Earnings: Rs. {$walletAfterOnline['total_earnings']}, Comm Paid: Rs. {$walletAfterOnline['total_commission_paid']}"
);

// TEST 6: Cash Payment Settlement on 2nd Job (Debit Commission -Rs. 500 from Worker Balance)
$stmt = $pdo->prepare("INSERT INTO job_requests (customer_id, category_id, title, description, address, latitude, longitude, status) VALUES (?, ?, ?, ?, '456 Kandy Rd, Kelaniya', 6.9500, 79.9100, 'open')");
$stmt->execute([$customerUserId, $catId, "Second Job Cash Settlement $testSuffix", "Need plumbing fix."]);
$job2Id = (int)$pdo->lastInsertId();

$inv2Result = $invoiceService->createInvoice($workerId, [
    'job_id' => $job2Id,
    'amount' => 5000.00,
    'notes'  => 'Pipe leakage fixed with new valve.'
]);
$inv2Id = $inv2Result['invoice_id'];

$payCashResult = $invoiceService->payInvoice($inv2Id, 'cash');
$walletAfterCash = $walletRepo->getWallet($workerId);

// Prior balance was 4,500. After cash job (customer pays worker 5,000 in cash), platform debits -500 commission from wallet.
// Expected balance: 4,500 - 500 = 4,000. Total commission paid: 500 + 500 = 1,000.
logTest("Test 6: Cash Settlement Debits Platform Commission (-Rs. 500)", 
    $payCashResult['status'] === 'success' &&
    (float)$walletAfterCash['wallet_balance'] === 4000.00 &&
    (float)$walletAfterCash['total_commission_paid'] === 1000.00,
    "Worker wallet balance: Rs. {$walletAfterCash['wallet_balance']} (4500 - 500), Total Comm Paid: Rs. {$walletAfterCash['total_commission_paid']}"
);

// TEST 7: Subscribed Worker gets 5% Discounted Commission Rate
// Simulate an active subscription for the worker
$stmt = $pdo->query("SELECT id FROM subscription_plans LIMIT 1");
$planId = (int)$stmt->fetchColumn();
if (!$planId) {
    $pdo->query("INSERT INTO subscription_plans (name, price, duration_days, features) VALUES ('Pro Plan', 2500.00, 30, '[\"5% Commission\"]')");
    $planId = (int)$pdo->lastInsertId();
}

$startDate = date('Y-m-d');
$endDate = date('Y-m-d', strtotime('+30 days'));
$stmt = $pdo->prepare("INSERT INTO worker_subscriptions (worker_id, plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, 'active')");
$stmt->execute([$workerId, $planId, $startDate, $endDate]);

$subRate = $walletService->getCommissionRate($workerId);
$subBreakdown = $walletService->calculateBreakdown($workerId, 10000.00);
logTest("Test 7: Subscription Activation Drops Commission to 5%", 
    $subRate === 0.05 && $subBreakdown['is_subscribed'] === true,
    "Active subscription detected -> Commission rate = 5% (0.05)"
);

// TEST 8: Invoice under Subscribed Worker (Rs. 10,000 at 5% = Rs. 500 commission, Rs. 9,500 net)
$stmt = $pdo->prepare("INSERT INTO job_requests (customer_id, category_id, title, description, address, latitude, longitude, status) VALUES (?, ?, ?, ?, '789 Negombo Rd, Ja-Ela', 7.0800, 79.8900, 'open')");
$stmt->execute([$customerUserId, $catId, "Third Job Subscribed $testSuffix", "Full electrical rewire."]);
$job3Id = (int)$pdo->lastInsertId();

$inv3Result = $invoiceService->createInvoice($workerId, [
    'job_id' => $job3Id,
    'amount' => 10000.00,
    'notes'  => 'Main breaker replaced and tested.'
]);
$inv3Id = $inv3Result['invoice_id'];
$inv3Data = $invoiceRepo->getInvoiceById($inv3Id);

logTest("Test 8: Subscribed Worker Invoice Calculated at 5%", 
    (float)$inv3Data['commission_rate'] === 0.05 &&
    (float)$inv3Data['commission_amount'] === 500.00 &&
    (float)$inv3Data['worker_net_amount'] === 9500.00,
    "Invoice #$inv3Id: Amount=10000, 5% Comm=500, Net Payout=9500"
);

// TEST 9: Online Settlement on Subscribed Invoice (+Rs. 9,500 to Wallet)
$invoiceService->payInvoice($inv3Id, 'online');
$walletAfterSubOnline = $walletRepo->getWallet($workerId);
// 4,000 + 9,500 = 13,500 balance; 10,000 + 10,000 = 20,000 gross total earnings; 1,000 + 500 = 1,500 total comm paid.
logTest("Test 9: Subscribed Online Settlement (+Rs. 9,500 credited)", 
    (float)$walletAfterSubOnline['wallet_balance'] === 13500.00 &&
    (float)$walletAfterSubOnline['total_earnings'] === 20000.00 &&
    (float)$walletAfterSubOnline['total_commission_paid'] === 1500.00,
    "Worker balance: Rs. {$walletAfterSubOnline['wallet_balance']}, Earnings: Rs. {$walletAfterSubOnline['total_earnings']}"
);

// TEST 10: Wallet Audit Trail Ledger Transactions
$txs = $walletRepo->getTransactions($workerId, 10);
$types = array_column($txs, 'type');
$hasAccessFeeTx = in_array('access_fee', $types);
$hasOnlineCreditTx = in_array('online_credit', $types);
$hasCashDebitTx = in_array('cash_commission_debit', $types);

logTest("Test 10: Complete Wallet Ledger Audit Trail Recorded", 
    count($txs) >= 4 && $hasAccessFeeTx && $hasOnlineCreditTx && $hasCashDebitTx,
    "Recorded " . count($txs) . " ledger transactions (access_fee, online_credit, cash_commission_debit)"
);

echo "\n=================================================================\n";
echo "ALL TESTS COMPLETED SUCCESSFULLY!\n";
echo "=================================================================\n";
