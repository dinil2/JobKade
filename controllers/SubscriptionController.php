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

            // Send subscription confirmation email via EmailService
            try {
                require_once __DIR__ . '/../services/EmailService.php';
                require_once __DIR__ . '/../repositories/UserRepository.php';
                $workerUserId = (int)($user['user_id'] ?? $user['id'] ?? 0);
                if ($workerUserId <= 0) {
                    $pdo = Database::getConnection();
                    $wStmt = $pdo->prepare("SELECT user_id FROM worker_profiles WHERE id = :wid LIMIT 1");
                    $wStmt->execute([':wid' => (int)$user['worker_id']]);
                    $workerUserId = (int)$wStmt->fetchColumn();
                }

                $wUser = ($workerUserId > 0) ? (new UserRepository())->findById($workerUserId) : null;
                $wEmail = !empty($wUser['email']) ? $wUser['email'] : ($user['email'] ?? '');
                $wName = !empty($wUser['full_name']) ? $wUser['full_name'] : ($user['name'] ?? 'Worker');

                if (!empty($wEmail)) {
                    $planName = htmlspecialchars($res['plan_name'] ?? 'Membership Plan');
                    $amount = isset($res['amount']) ? number_format((float)$res['amount'], 2) : '1,000.00';
                    $receiptNo = htmlspecialchars($res['receipt_number'] ?? ('SUB-' . time()));
                    $subject = "JobKade: Subscription Activated";
                    $htmlBody = "
                        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                            <h2 style=\"color: #0284c7; margin-top: 0;\">Subscription Activated!</h2>
                            <p>Hi " . htmlspecialchars($wName) . ",</p>
                            <p>Thank you for subscribing! Your <strong>{$planName}</strong> has been activated successfully.</p>
                            <div style=\"background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; margin: 16px 0;\">
                                <p style=\"margin: 4px 0;\"><strong>Receipt Number:</strong> {$receiptNo}</p>
                                <p style=\"margin: 4px 0;\"><strong>Plan:</strong> {$planName}</p>
                                <p style=\"margin: 4px 0;\"><strong>Amount Paid:</strong> Rs. {$amount}</p>
                                <p style=\"margin: 4px 0;\"><strong>Payment Method:</strong> " . htmlspecialchars($method) . "</p>
                            </div>
                            <p>Your job application quota and subscription perks are now active on your worker account.</p>
                            <div style=\"margin: 25px 0;\">
                                <a href=\"http://localhost:81/JobKade/worker/dashboard.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">Go to Dashboard</a>
                            </div>
                            <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                            <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                        </div>
                    ";
                    (new EmailService())->send($wEmail, $wName, $subject, $htmlBody);
                }
            } catch (Throwable $ne) {
                error_log("Failed to send subscription confirmation email: " . $ne->getMessage());
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
