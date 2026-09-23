<?php
// repositories/WalletRepository.php

require_once __DIR__ . "/../config/Database.php";

class WalletRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Get worker wallet balance and summary metrics.
     */
    public function getWallet(int $workerId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                wp.id AS worker_id,
                wp.user_id,
                wp.wallet_balance,
                wp.total_earnings,
                wp.total_commission_paid,
                wp.has_job_access,
                ws.status AS subscription_status,
                sp.name AS subscription_plan_name
            FROM worker_profiles wp
            LEFT JOIN (
                SELECT worker_id, plan_id, status 
                FROM worker_subscriptions 
                WHERE status = 'active' AND end_date >= CURDATE()
                ORDER BY id DESC LIMIT 1
            ) ws ON wp.id = ws.worker_id
            LEFT JOIN subscription_plans sp ON ws.plan_id = sp.id
            WHERE wp.id = :wid OR wp.user_id = :uid
            LIMIT 1
        ");
        $stmt->execute([":wid" => $workerId, ":uid" => $workerId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Check if a worker has an active subscription.
     */
    public function hasActiveSubscription(int $workerId): bool {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) 
            FROM worker_subscriptions ws
            JOIN worker_profiles wp ON ws.worker_id = wp.id
            WHERE (wp.id = :wid OR wp.user_id = :uid) 
              AND ws.status = 'active' 
              AND ws.end_date >= CURDATE()
        ");
        $stmt->execute([":wid" => $workerId, ":uid" => $workerId]);
        return ((int)$stmt->fetchColumn()) > 0;
    }

    /**
     * Check if worker has job viewing access (either one-time payment or active subscription).
     */
    public function hasJobAccess(int $workerId): bool {
        $stmt = $this->db->prepare("SELECT has_job_access, id FROM worker_profiles WHERE id = :wid OR user_id = :uid LIMIT 1");
        $stmt->execute([":wid" => $workerId, ":uid" => $workerId]);
        $row = $stmt->fetch();
        if (!$row) return false;
        if ((int)$row["has_job_access"] === 1) {
            return true;
        }
        return $this->hasActiveSubscription((int)$row["id"]);
    }

    /**
     * Set job access flag for a worker.
     */
    public function setJobAccess(int $workerId, bool $access = true): bool {
        $stmt = $this->db->prepare("
            UPDATE worker_profiles 
            SET has_job_access = :access 
            WHERE id = :wid OR user_id = :uid
        ");
        return $stmt->execute([
            ":access" => $access ? 1 : 0,
            ":wid"    => $workerId,
            ":uid"    => $workerId
        ]);
    }

    /**
     * Record a transaction and atomically update the worker wallet balance.
     */
    public function applyTransaction(
        int $workerId,
        float $deltaAmount,
        string $type,
        string $description,
        ?int $jobId = null,
        ?int $invoiceId = null,
        string $paymentMethod = "system",
        float $grossJobEarnings = 0.00,
        float $commissionPaid = 0.00
    ): array {
        $this->db->beginTransaction();
        try {
            // Lock worker profile row
            $lockStmt = $this->db->prepare("
                SELECT id, wallet_balance, total_earnings, total_commission_paid 
                FROM worker_profiles 
                WHERE id = :wid OR user_id = :uid
                FOR UPDATE
            ");
            $lockStmt->execute([":wid" => $workerId, ":uid" => $workerId]);
            $current = $lockStmt->fetch();

            if (!$current) {
                throw new InvalidArgumentException("Worker profile #{$workerId} not found.");
            }

            $profileId = (int)$current["id"];
            $currentBalance = (float)$current["wallet_balance"];
            $newBalance = $currentBalance + $deltaAmount;

            $newEarnings = (float)$current["total_earnings"] + $grossJobEarnings;
            $newCommission = (float)$current["total_commission_paid"] + $commissionPaid;

            // Update worker profile
            $upStmt = $this->db->prepare("
                UPDATE worker_profiles
                SET 
                    wallet_balance = :new_balance,
                    total_earnings = :new_earnings,
                    total_commission_paid = :new_commission
                WHERE id = :profile_id
            ");
            $upStmt->execute([
                ":new_balance"    => $newBalance,
                ":new_earnings"   => $newEarnings,
                ":new_commission" => $newCommission,
                ":profile_id"     => $profileId
            ]);

            // Generate unique transaction reference
            $txRef = "WTX-" . date("Ymd") . "-" . strtoupper(bin2hex(random_bytes(4)));

            $cleanMethod = strtolower(trim((string)$paymentMethod));
            if (!in_array($cleanMethod, ['online', 'cash', 'system'], true)) {
                $cleanMethod = 'system';
            }

            // Record transaction in ledger
            $txStmt = $this->db->prepare("
                INSERT INTO wallet_transactions 
                (worker_id, job_id, invoice_id, type, amount, balance_after, payment_method, description, transaction_ref, created_at)
                VALUES 
                (:worker_id, :job_id, :invoice_id, :type, :amount, :balance_after, :payment_method, :description, :tx_ref, NOW())
            ");
            $txStmt->execute([
                ":worker_id"      => $profileId,
                ":job_id"         => $jobId,
                ":invoice_id"     => $invoiceId,
                ":type"           => $type,
                ":amount"         => $deltaAmount,
                ":balance_after"  => $newBalance,
                ":payment_method" => $cleanMethod,
                ":description"    => $description,
                ":tx_ref"         => $txRef
            ]);
            $txId = (int)$this->db->lastInsertId();

            $this->db->commit();

            return [
                "transaction_id"  => $txId,
                "transaction_ref" => $txRef,
                "worker_id"       => $profileId,
                "delta_amount"    => $deltaAmount,
                "balance_after"   => $newBalance,
                "type"            => $type,
                "description"     => $description
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Get transaction history for a worker.
     */
    public function getTransactions(int $workerId, int $limit = 50): array {
        $stmt = $this->db->prepare("
            SELECT 
                wt.*,
                jr.title AS job_title,
                ji.job_amount,
                ji.commission_rate
            FROM wallet_transactions wt
            JOIN worker_profiles wp ON wt.worker_id = wp.id
            LEFT JOIN job_requests jr ON wt.job_id = jr.id
            LEFT JOIN job_invoices ji ON wt.invoice_id = ji.id
            WHERE wp.id = :wid OR wp.user_id = :uid
            ORDER BY wt.created_at DESC, wt.id DESC
            LIMIT :limit
        ");
        $stmt->bindValue(":wid", $workerId, PDO::PARAM_INT);
        $stmt->bindValue(":uid", $workerId, PDO::PARAM_INT);
        $stmt->bindValue(":limit", $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}

