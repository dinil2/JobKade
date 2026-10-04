<?php
// controllers/AdminController.php

require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../repositories/KycRepository.php';
require_once __DIR__ . '/../repositories/JobRepository.php';
require_once __DIR__ . '/../repositories/SubscriptionRepository.php';
require_once __DIR__ . '/../repositories/PromotionRepository.php';
require_once __DIR__ . '/../services/AdminService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class AdminController {
    private UserRepository $userRepo;
    private KycRepository $kycRepo;
    private JobRepository $jobRepo;
    private SubscriptionRepository $subRepo;
    private PromotionRepository $promoRepo;
    private AdminService $adminService;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->kycRepo = new KycRepository();
        $this->jobRepo = new JobRepository();
        $this->subRepo = new SubscriptionRepository();
        $this->promoRepo = new PromotionRepository();
        $this->adminService = new AdminService();
    }

    private function requireAdmin(): array {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'admin') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Administrator privileges required.']);
        }
        return $user;
    }

    public function stats(): void {
        $this->requireAdmin();
        $db = Database::getConnection();

        $totalUsers = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $totalWorkers = (int)$db->query("SELECT COUNT(*) FROM worker_profiles")->fetchColumn();
        $verifiedWorkers = (int)$db->query("SELECT COUNT(*) FROM worker_profiles WHERE is_verified = 1")->fetchColumn();
        $totalJobs = (int)$db->query("SELECT COUNT(*) FROM job_requests")->fetchColumn();
        $pendingKyc = (int)$db->query("SELECT COUNT(*) FROM kyc_documents WHERE status = 'pending'")->fetchColumn();
        $totalRevenue = (float)$db->query("SELECT COALESCE(SUM(amount), 0) FROM subscription_payments WHERE status = 'completed'")->fetchColumn();

        sendJsonResponse(200, [
            'status' => 'success',
            'stats'  => [
                'total_users'      => $totalUsers,
                'total_workers'    => $totalWorkers,
                'verified_workers' => $verifiedWorkers,
                'total_jobs'       => $totalJobs,
                'pending_kyc'      => $pendingKyc,
                'total_revenue_lkr'=> $totalRevenue
            ]
        ]);
    }

    /**
     * Endpoint: GET /api/admin/kyc/pending or ?action=kyc-pending
     */
    public function kycPending(): void {
        $this->requireAdmin();
        $pending = $this->adminService->getPendingKycList();
        sendJsonResponse(200, [
            'status'      => 'success',
            'pending_kyc' => $pending,
            'count'       => count($pending)
        ]);
    }

    /**
     * Backward-compatible alias for kycPending.
     */
    public function kycQueue(): void {
        $this->kycPending();
    }

    /**
     * Endpoint: GET /api/admin/kyc/list?status=...
     */
    public function kycList(): void {
        $this->requireAdmin();
        $status = $_GET['status'] ?? 'pending';
        $list = $this->adminService->getKycByStatus($status);
        sendJsonResponse(200, [
            'status'    => 'success',
            'documents' => $list,
            'count'     => count($list)
        ]);
    }

    /**
     * Endpoint: POST /api/admin/kyc/verify or ?action=kyc-verify
     */
    public function kycVerify(): void {
        $admin = $this->requireAdmin();
        $data = getRequestData();

        $kycId = (int)($data['kyc_id'] ?? $data['document_id'] ?? 0);
        $workerId = (int)($data['worker_id'] ?? 0);
        $verifyPacket = !empty($data['verify_packet']) || ($kycId <= 0 && $workerId > 0);
        $status = $data['status'] ?? 'approved';
        $notes = $data['notes'] ?? $data['admin_notes'] ?? $data['rejection_reason'] ?? null;

        try {
            if ($verifyPacket && $workerId > 0) {
                $result = $this->adminService->verifyWorkerPacket($workerId, $status, $notes, (int)$admin['user_id']);
            } else {
                $result = $this->adminService->verifyKyc($kycId, $status, $notes, (int)$admin['user_id']);
            }
            sendJsonResponse(200, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * Endpoint: GET /api/admin/kyc/packet?worker_id=...
     */
    public function kycWorkerPacket(): void {
        $this->requireAdmin();
        $workerId = (int)($_GET['worker_id'] ?? 0);
        if ($workerId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid worker_id required.']);
        }

        $docs = $this->kycRepo->getDocumentsByWorkerId($workerId);
        $profile = $this->workerRepo->getProfileById($workerId);
        sendJsonResponse(200, [
            'status'    => 'success',
            'worker_id' => $workerId,
            'profile'   => $profile,
            'documents' => $docs,
            'count'     => count($docs)
        ]);
    }

    /**
     * Backward-compatible alias for kycVerify.
     */
    public function reviewKyc(): void {
        $this->kycVerify();
    }

    public function users(): void {
        $this->requireAdmin();
        $users = $this->userRepo->getAllUsers();
        sendJsonResponse(200, ['status' => 'success', 'users' => $users]);
    }

    public function toggleUserStatus(): void {
        $this->requireAdmin();
        $data = getRequestData();
        $userId = (int)($data['user_id'] ?? 0);
        $status = $data['status'] ?? 'active';

        $this->userRepo->updateStatus($userId, $status);
        sendJsonResponse(200, ['status' => 'success', 'message' => "User status updated to {$status}."]);
    }

    public function allPayments(): void {
        $this->requireAdmin();
        $payments = $this->subRepo->getAllPayments();
        sendJsonResponse(200, ['status' => 'success', 'payments' => $payments]);
    }

    public function pendingPromotions(): void {
        $this->requireAdmin();
        $promos = $this->promoRepo->getAllPending();
        sendJsonResponse(200, ['status' => 'success', 'pending_promotions' => $promos]);
    }

    public function reviewPromotion(): void {
        $this->requireAdmin();
        $data = getRequestData();
        $promoId = (int)($data['promotion_id'] ?? 0);
        $status = $data['status'] ?? 'approved';

        $this->promoRepo->moderate($promoId, $status);
        sendJsonResponse(200, ['status' => 'success', 'message' => "Promotion status updated to {$status}."]);
    }
}
