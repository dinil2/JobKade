<?php
// controllers/KycController.php

require_once __DIR__ . '/../services/KycService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';
require_once __DIR__ . '/../config/Database.php';

class KycController {
    private KycService $kycService;
    private PDO $db;

    public function __construct() {
        $this->kycService = new KycService();
        $this->db = Database::getConnection();
    }

    /**
     * Resolve worker_profile ID from JWT user data.
     */
    private function resolveWorkerId(array $user): int {
        if (!empty($user['worker_id'])) {
            return (int)$user['worker_id'];
        }

        $stmt = $this->db->prepare("SELECT id FROM worker_profiles WHERE user_id = :uid LIMIT 1");
        $stmt->execute([':uid' => $user['user_id'] ?? $user['id']]);
        $workerId = $stmt->fetchColumn();

        if (!$workerId) {
            sendJsonResponse(404, [
                'status' => 'error',
                'message' => 'Worker profile not found. Please complete your registration.'
            ]);
        }

        return (int)$workerId;
    }

    /**
     * Handle KYC document upload (multipart/form-data or JSON).
     */
    public function upload(): void {
        $user = JWT::getAuthUser();
        if (!$user || ($user['role'] !== 'worker' && $user['role'] !== 'admin')) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Worker authentication required.']);
        }

        $workerId = $this->resolveWorkerId($user);

        // Check for file in $_FILES
        $file = null;
        if (!empty($_FILES['kyc_file'])) {
            $file = $_FILES['kyc_file'];
        } elseif (!empty($_FILES['document_file'])) {
            $file = $_FILES['document_file'];
        } elseif (!empty($_FILES['file'])) {
            $file = $_FILES['file'];
        }

        // Merge POST body or JSON body
        $data = !empty($_POST) ? $_POST : getRequestData();

        try {
            $result = $this->kycService->submitDocument($workerId, $data, $file);
            sendJsonResponse(201, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * Get submitted documents for the authenticated worker.
     */
    public function myDocuments(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Authentication required.']);
        }

        $workerId = $this->resolveWorkerId($user);
        $docs = $this->kycService->getWorkerDocuments($workerId);
        sendJsonResponse(200, [
            'status'    => 'success',
            'documents' => $docs,
            'count'     => count($docs)
        ]);
    }

    /**
     * Get the live verification badge & summary for authenticated worker.
     */
    public function status(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Authentication required.']);
        }

        $workerId = $this->resolveWorkerId($user);
        $statusInfo = $this->kycService->getWorkerStatus($workerId);
        sendJsonResponse(200, [
            'status' => 'success',
            'data'   => $statusInfo
        ]);
    }
}
