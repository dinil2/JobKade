<?php
// controllers/SubscriptionController.php

require_once __DIR__ . '/../services/PaymentService.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class SubscriptionController {
    private PaymentService $payService;

    public function __construct() {
        $this->payService = new PaymentService();
    }

    public function getPlans(): void {
        $plans = $this->payService->getPlans();
        sendJsonResponse(200, ['status' => 'success', 'plans' => $plans]);
    }

    public function pay(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can subscribe to membership plans.']);
        }

        $data = getRequestData();
        $planId = (int)($data['plan_id'] ?? 1);
        $method = $data['payment_method'] ?? 'IPG Visa/Mastercard (Online)';

        try {
            $res = $this->payService->processPayment((int)$user['worker_id'], $planId, $method);

            // Insert notification for the worker
            try {
                $workerUserId = (int)($user['user_id'] ?? $user['id'] ?? 0);
                if ($workerUserId <= 0) {
                    $pdo = Database::getConnection();
                    $wStmt = $pdo->prepare("SELECT user_id FROM worker_profiles WHERE id = :wid LIMIT 1");
                    $wStmt->execute([':wid' => (int)$user['worker_id']]);
                    $workerUserId = (int)$wStmt->fetchColumn();
                }

                if ($workerUserId > 0) {
                    $planName = $res['plan_name'] ?? 'Membership';
                    $pdo = Database::getConnection();
                    $nStmt = $pdo->prepare("
                        INSERT INTO notifications (user_id, title, message, type, is_read)
                        VALUES (:uid, :title, :msg, 'subscription', 0)
                    ");
                    $nStmt->execute([
                        ':uid'   => $workerUserId,
                        ':title' => 'Subscription Activated',
                        ':msg'   => "Your {$planName} subscription has been activated successfully."
                    ]);
                }
            } catch (Throwable $ne) {
                error_log("Failed to insert subscription notification: " . $ne->getMessage());
            }

            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'Subscription payment processed successfully!',
                'receipt' => $res
            ]);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function receipt(): void {
        $receiptNo = $_GET['receipt_number'] ?? '';
        if (empty($receiptNo)) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Receipt number required.']);
        }

        $receipt = $this->payService->getReceipt($receiptNo);
        if (!$receipt) {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Receipt not found.']);
        }

        sendJsonResponse(200, ['status' => 'success', 'receipt' => $receipt]);
    }

    public function history(): void {
        $user = JWT::getAuthUser();
        if (!$user || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Worker authorization required.']);
        }

        $history = $this->payService->getWorkerPayments((int)$user['worker_id']);
        sendJsonResponse(200, ['status' => 'success', 'payments' => $history]);
    }
}
