<?php
// services/WalletService.php

require_once __DIR__ . "/../config/Database.php";
require_once __DIR__ . "/../repositories/WalletRepository.php";
require_once __DIR__ . "/../repositories/WorkerRepository.php";
require_once __DIR__ . "/../repositories/InvoiceRepository.php";

class WalletService {
    private WalletRepository $walletRepo;
    private WorkerRepository $workerRepo;
    private InvoiceRepository $invoiceRepo;

    public const STANDARD_COMMISSION_RATE = 0.10; // 10%
    public const SUBSCRIBED_COMMISSION_RATE = 0.05; // 5% (50% discount for subscribed workers)
    public const ONE_TIME_ACCESS_FEE = 1500.00; // LKR 1,500 for lifetime job viewing pass

    public function __construct(
        ?WalletRepository $walletRepo = null,
        ?WorkerRepository $workerRepo = null,
        ?InvoiceRepository $invoiceRepo = null
    ) {
        $this->walletRepo = $walletRepo ?? new WalletRepository();
        $this->workerRepo = $workerRepo ?? new WorkerRepository();
        $this->invoiceRepo = $invoiceRepo ?? new InvoiceRepository();
    }

    /**
     * Get commission rate for a worker (5% if subscribed, 10% if standard).
     */
    public function getCommissionRate(int $workerId): float {
        return $this->walletRepo->hasActiveSubscription($workerId)
            ? self::SUBSCRIBED_COMMISSION_RATE
            : self::STANDARD_COMMISSION_RATE;
    }

    /**
     * Compute fee breakdown for a specific job amount.
     */
    public function calculateBreakdown(int $workerId, float $jobAmount): array {
        if ($jobAmount <= 0) {
            throw new InvalidArgumentException("Job amount must be greater than zero.");
        }

        $isSubscribed = $this->walletRepo->hasActiveSubscription($workerId);
        $rate = $isSubscribed ? self::SUBSCRIBED_COMMISSION_RATE : self::STANDARD_COMMISSION_RATE;
        $commissionAmount = round($jobAmount * $rate, 2);
        $workerNetAmount = round($jobAmount - $commissionAmount, 2);

        return [
            "job_amount"        => $jobAmount,
            "is_subscribed"     => $isSubscribed,
            "commission_rate"   => $rate,
            "commission_pct"    => ($rate * 100) . "%",
            "commission_amount" => $commissionAmount,
            "worker_net_amount" => $workerNetAmount
        ];
    }

    /**
     * Process settlement for a paid invoice according to payment method.
     * Online -> + (Net Earnings credited after platform retains commission)
     * Cash   -> - (Platform Commission debited from worker wallet)
     */
    public function settleInvoice(int $invoiceId, string $paymentMethod): array {
        $pdo = Database::getConnection();
        $ownsTx = false;
        if (!$pdo->inTransaction()) {
            $pdo->beginTransaction();
            $ownsTx = true;
        }

        try {
            $stmt = $pdo->prepare("SELECT * FROM job_invoices WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $invoiceId]);
            $invoice = $stmt->fetch();

            if (!$invoice) {
                throw new InvalidArgumentException("Invoice #{$invoiceId} not found.");
            }

            if ($invoice["payment_status"] === "paid") {
                throw new InvalidArgumentException("Invoice #{$invoiceId} is already paid and settled.");
            }

            $workerId = (int)$invoice["worker_id"];
            $jobId = (int)$invoice["job_id"];
            $jobAmount = (float)$invoice["job_amount"];
            $commissionAmount = (float)$invoice["commission_amount"];
            $workerNetAmount = (float)$invoice["worker_net_amount"];
            $cleanMethod = strtolower(trim($paymentMethod));

            if (!in_array($cleanMethod, ["online", "cash"], true)) {
                $cleanMethod = strtolower($invoice["payment_method"]);
            }

            // Mark invoice as paid conditionally
            $updated = $this->invoiceRepo->markAsPaid($invoiceId, $cleanMethod);
            if (!$updated) {
                throw new InvalidArgumentException("Invoice #{$invoiceId} is already paid and settled.");
            }

            if ($cleanMethod === "online") {
                // Customer paid online. Platform keeps commission, credits net amount to worker.
                $txResult = $this->walletRepo->applyTransaction(
                    $workerId,
                    $workerNetAmount, // Positive delta (Credit)
                    "online_credit",
                    "Online Payment for Job #{$jobId} (Total: LKR " . number_format($jobAmount, 2) . ", Commission: LKR " . number_format($commissionAmount, 2) . ")",
                    $jobId,
                    $invoiceId,
                    "online",
                    $jobAmount,
                    $commissionAmount
                );
            } else {
                // Customer paid cash in hand. Worker has full amount. Platform debits commission fee.
                $txResult = $this->walletRepo->applyTransaction(
                    $workerId,
                    -$commissionAmount, // Negative delta (Debit)
                    "cash_commission_debit",
                    "Platform Commission Deduction for Cash Job #{$jobId} (Collected: LKR " . number_format($jobAmount, 2) . ")",
                    $jobId,
                    $invoiceId,
                    "cash",
                    $jobAmount,
                    $commissionAmount
                );
            }

            if ($ownsTx) {
                $pdo->commit();
            }

            return [
                "status"          => "success",
                "message"         => "Invoice #{$invoiceId} successfully settled via " . strtoupper($cleanMethod) . " payment.",
                "invoice_id"      => $invoiceId,
                "payment_method"  => $cleanMethod,
                "job_amount"      => $jobAmount,
                "commission_paid" => $commissionAmount,
                "wallet_impact"   => $txResult["delta_amount"],
                "wallet_balance"  => $txResult["balance_after"],
                "transaction_ref" => $txResult["transaction_ref"]
            ];
        } catch (Exception $e) {
            if ($ownsTx && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Activate worker one-time job viewing access pass.
     */
    public function activateJobAccess(int $workerId, string $paymentMethod = "online"): array {
        $this->walletRepo->setJobAccess($workerId, true);

        // Record activation transaction
        $tx = $this->walletRepo->applyTransaction(
            $workerId,
            0.00, // 0 delta on balance since it is paid via external IPG
            "access_fee",
            "One-Time Lifetime Job Access Pass Activation (LKR " . number_format(self::ONE_TIME_ACCESS_FEE, 2) . ")",
            null,
            null,
            $paymentMethod
        );

        return [
            "status"          => "success",
            "message"         => "One-time job access pass activated! You can now view all open jobs and customer contacts.",
            "has_job_access"  => true,
            "transaction_ref" => $tx["transaction_ref"]
        ];
    }

    /**
     * Get worker wallet balance, commission status, and recent transactions.
     */
    public function getWorkerWalletDetails(int $workerId): array {
        $wallet = $this->walletRepo->getWallet($workerId);
        if (!$wallet) {
            throw new InvalidArgumentException("Worker profile not found.");
        }

        $isSubscribed = $this->walletRepo->hasActiveSubscription($workerId);
        $hasAccess = $this->walletRepo->hasJobAccess($workerId);
        $rate = $isSubscribed ? self::SUBSCRIBED_COMMISSION_RATE : self::STANDARD_COMMISSION_RATE;
        $transactions = $this->walletRepo->getTransactions($workerId, 30);

        return [
            "worker_id"              => $workerId,
            "wallet_balance"         => (float)$wallet["wallet_balance"],
            "total_earnings"         => (float)$wallet["total_earnings"],
            "total_commission_paid"  => (float)$wallet["total_commission_paid"],
            "has_job_access"         => $hasAccess,
            "is_subscribed"          => $isSubscribed,
            "commission_rate"        => $rate,
            "commission_percentage"  => ($rate * 100) . "%",
            "subscription_plan_name" => $wallet["subscription_plan_name"] ?? ($isSubscribed ? "Active Plan" : "Standard (No Subscription)"),
            "transactions"           => $transactions
        ];
    }

    /**
     * Worker requests withdrawal of earned wallet balance to bank account.
     */
    public function requestPayout(int $workerId, array $data): array {
        $amount = (float)($data['amount'] ?? 0);
        if ($amount < 1000) {
            throw new InvalidArgumentException("Minimum withdrawal payout amount is Rs. 1,000.");
        }

        $bankName = trim(strip_tags((string)($data['bank_name'] ?? '')));
        $accountNumber = trim(strip_tags((string)($data['account_number'] ?? '')));
        $accountName = trim(strip_tags((string)($data['account_name'] ?? '')));
        $branch = trim(strip_tags((string)($data['branch'] ?? '')));

        if (empty($bankName) || empty($accountNumber) || empty($accountName)) {
            throw new InvalidArgumentException("Bank name, account number, and account holder name are mandatory.");
        }

        $wallet = $this->walletRepo->getWallet($workerId);
        if (!$wallet || (float)$wallet['wallet_balance'] < $amount) {
            $available = $wallet ? number_format((float)$wallet['wallet_balance'], 2) : '0.00';
            throw new InvalidArgumentException("Insufficient available balance. Your balance is Rs. $available.");
        }

        // Apply withdrawal deduction to wallet
        $tx = $this->walletRepo->applyTransaction(
            $workerId,
            -$amount,
            'withdrawal',
            "Bank Transfer Payout Request to $bankName ($accountNumber)",
            null,
            null,
            'system'
        );

        $profileId = (int)$wallet['worker_id'];

        // Record payout request
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO wallet_payout_requests 
            (worker_id, amount, bank_name, account_number, account_name, branch, status, transaction_ref, created_at)
            VALUES 
            (:worker_id, :amount, :bank_name, :account_number, :account_name, :branch, 'pending', :ref, NOW())
        ");
        $stmt->execute([
            ':worker_id'      => $profileId,
            ':amount'         => $amount,
            ':bank_name'      => $bankName,
            ':account_number' => $accountNumber,
            ':account_name'   => $accountName,
            ':branch'         => $branch,
            ':ref'            => $tx['transaction_ref']
        ]);
        $payoutId = (int)$pdo->lastInsertId();

        return [
            'status'          => 'success',
            'message'         => 'Payout request submitted successfully! Funds will be transferred within 1-2 business days.',
            'payout_id'       => $payoutId,
            'amount'          => $amount,
            'wallet_balance'  => $tx['balance_after'],
            'transaction_ref' => $tx['transaction_ref']
        ];
    }

    /**
     * Top-up worker wallet balance (e.g. to clear negative commission balance).
     */
    public function topUp(int $workerId, float $amount, string $method = 'online'): array {
        if ($amount < 100) {
            throw new InvalidArgumentException("Minimum top-up amount is Rs. 100.");
        }

        $tx = $this->walletRepo->applyTransaction(
            $workerId,
            $amount,
            'online_credit',
            "Wallet Balance Top-Up via " . strtoupper($method),
            null,
            null,
            $method
        );

        return [
            'status'          => 'success',
            'message'         => 'Wallet topped up successfully by Rs. ' . number_format($amount, 2),
            'wallet_balance'  => $tx['balance_after'],
            'transaction_ref' => $tx['transaction_ref']
        ];
    }
}

