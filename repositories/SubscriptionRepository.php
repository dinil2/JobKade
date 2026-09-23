<?php
// repositories/SubscriptionRepository.php

require_once __DIR__ . '/../config/Database.php';

class SubscriptionRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getAllPlans(): array {
        $stmt = $this->db->query("SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price ASC");
        return $stmt->fetchAll();
    }

    public function getPlanById(int $planId): ?array {
        $stmt = $this->db->prepare("SELECT * FROM subscription_plans WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $planId]);
        return $stmt->fetch() ?: null;
    }

    public function getActiveSubscription(int $workerId): ?array {
        $stmt = $this->db->prepare("
            SELECT ws.*, sp.name AS plan_name, sp.features
            FROM worker_subscriptions ws
            JOIN subscription_plans sp ON ws.plan_id = sp.id
            WHERE ws.worker_id = :worker_id AND ws.status = 'active' AND ws.end_date >= CURDATE()
            ORDER BY ws.end_date DESC LIMIT 1
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetch() ?: null;
    }

    public function processPaymentAndSubscribe(int $workerId, int $planId, string $paymentMethod): array {
        $plan = $this->getPlanById($planId);
        if (!$plan) {
            throw new Exception("Invalid subscription plan.");
        }

        // Generate transaction ref and unique printable receipt number
        $txnRef = 'TXN-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
        $receiptNo = 'RCPT-' . date('Ym') . '-' . rand(1000, 9999);

        $this->db->beginTransaction();
        try {
            // 1. Record payment
            $stmtPay = $this->db->prepare("
                INSERT INTO subscription_payments (worker_id, plan_id, amount, payment_method, transaction_ref, receipt_number, status)
                VALUES (:worker_id, :plan_id, :amount, :payment_method, :txn, :rcpt, 'completed')
            ");
            $stmtPay->execute([
                ':worker_id'      => $workerId,
                ':plan_id'        => $planId,
                ':amount'         => $plan['price'],
                ':payment_method' => $paymentMethod,
                ':txn'            => $txnRef,
                ':rcpt'           => $receiptNo
            ]);
            $paymentId = (int)$this->db->lastInsertId();

            // 2. Set dates
            $startDate = date('Y-m-d');
            $endDate = date('Y-m-d', strtotime("+{$plan['duration_days']} days"));

            // 3. Deactivate prior subscriptions
            $this->db->prepare("UPDATE worker_subscriptions SET status = 'expired' WHERE worker_id = :w")->execute([':w' => $workerId]);

            // 4. Create new subscription
            $stmtSub = $this->db->prepare("
                INSERT INTO worker_subscriptions (worker_id, plan_id, start_date, end_date, status)
                VALUES (:w, :p, :start, :end, 'active')
            ");
            $stmtSub->execute([
                ':w'     => $workerId,
                ':p'     => $planId,
                ':start' => $startDate,
                ':end'   => $endDate
            ]);

            $this->db->commit();

            return [
                'payment_id'     => $paymentId,
                'receipt_number' => $receiptNo,
                'transaction_ref'=> $txnRef,
                'plan_name'      => $plan['name'],
                'amount'         => (float)$plan['price'],
                'start_date'     => $startDate,
                'end_date'       => $endDate,
                'status'         => 'completed'
            ];
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function getReceiptByNumber(string $receiptNumber): ?array {
        $stmt = $this->db->prepare("
            SELECT sp.*, spl.name AS plan_name, spl.duration_days, u.full_name AS worker_name, u.email AS worker_email, u.phone AS worker_phone
            FROM subscription_payments sp
            JOIN subscription_plans spl ON sp.plan_id = spl.id
            JOIN worker_profiles wp ON sp.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE sp.receipt_number = :rcpt LIMIT 1
        ");
        $stmt->execute([':rcpt' => $receiptNumber]);
        return $stmt->fetch() ?: null;
    }

    public function getWorkerPaymentHistory(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT sp.*, spl.name AS plan_name
            FROM subscription_payments sp
            JOIN subscription_plans spl ON sp.plan_id = spl.id
            WHERE sp.worker_id = :worker_id
            ORDER BY sp.created_at DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function getAllPayments(): array {
        $stmt = $this->db->query("
            SELECT sp.*, spl.name AS plan_name, u.full_name AS worker_name
            FROM subscription_payments sp
            JOIN subscription_plans spl ON sp.plan_id = spl.id
            JOIN worker_profiles wp ON sp.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            ORDER BY sp.created_at DESC
        ");
        return $stmt->fetchAll();
    }
}
