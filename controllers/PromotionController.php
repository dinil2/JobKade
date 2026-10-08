<?php
// controllers/PromotionController.php

require_once __DIR__ . '/../repositories/PromotionRepository.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class PromotionController {
    private PromotionRepository $promoRepo;

    public function __construct() {
        $this->promoRepo = new PromotionRepository();
    }

    private function requireWorker(): array {
        $user = JWT::getAuthUser();
        if (!$user || ($user['role'] ?? '') !== 'worker') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers are authorized to perform this action.']);
        }
        if (empty($user['worker_id'])) {
            require_once __DIR__ . '/../repositories/WorkerRepository.php';
            $wRepo = new WorkerRepository();
            $profile = $wRepo->getProfileByUserId((int)($user['user_id'] ?? $user['id']));
            if ($profile) {
                $user['worker_id'] = (int)$profile['id'];
            } else {
                sendJsonResponse(403, ['status' => 'error', 'message' => 'Worker profile not found.']);
            }
        }
        return $user;
    }

    private function requireAdmin(): array {
        $user = JWT::getAuthUser();
        if (!$user || ($user['role'] ?? '') !== 'admin') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Administrator privileges required.']);
        }
        return $user;
    }

    public function active(): void {
        $promos = $this->promoRepo->getActivePromotions();
        sendJsonResponse(200, ['status' => 'success', 'promotions' => $promos]);
    }

    public function create(): void {
        $user = $this->requireWorker();

        $data = getRequestData();
        $title = trim((string)($data['title'] ?? ''));
        $description = trim((string)($data['description'] ?? ''));
        $discount = (int)($data['discount_percent'] ?? $data['discount'] ?? 10);
        $validUntil = trim((string)($data['valid_until'] ?? ''));

        if (empty($title) || empty($description)) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Title and description are required.']);
        }

        if ($discount < 1 || $discount > 100) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Discount percentage must be between 1 and 100.']);
        }

        if (empty($validUntil)) {
            $validUntil = date('Y-m-d', strtotime('+30 days'));
        } else {
            $ts = strtotime($validUntil);
            if (!$ts || $validUntil < date('Y-m-d')) {
                sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid-until date must be a valid future date.']);
            }
        }

        $id = $this->promoRepo->createPromotion((int)$user['worker_id'], $title, $description, $discount, $validUntil);
        sendJsonResponse(201, [
            'status' => 'success',
            'message' => 'Promotion submitted for admin approval!',
            'promotion_id' => $id
        ]);
    }

    public function myPromotions(): void {
        $user = $this->requireWorker();
        $promos = $this->promoRepo->getByWorker((int)$user['worker_id']);
        sendJsonResponse(200, ['status' => 'success', 'promotions' => $promos]);
    }

    public function delete(): void {
        $user = $this->requireWorker();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendJsonResponse(405, ['status' => 'error', 'message' => 'Method not allowed. Use POST.']);
        }

        $data = getRequestData();
        $promoId = (int)($data['id'] ?? $data['promotion_id'] ?? $_GET['id'] ?? 0);
        if ($promoId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid promotion ID is required.']);
        }

        $deleted = $this->promoRepo->deleteByWorker($promoId, (int)$user['worker_id']);
        if ($deleted) {
            sendJsonResponse(200, ['status' => 'success', 'message' => 'Promotion deleted successfully.']);
        } else {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Promotion not found or you are not authorized to delete it.']);
        }
    }

    public function pending(): void {
        $this->requireAdmin();
        $promos = $this->promoRepo->getAllPending();
        sendJsonResponse(200, [
            'status' => 'success',
            'promotions' => $promos,
            'pending_promotions' => $promos
        ]);
    }

    public function moderate(): void {
        $this->requireAdmin();
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendJsonResponse(405, ['status' => 'error', 'message' => 'Method not allowed. Use POST.']);
        }

        $data = getRequestData();
        $promoId = (int)($data['id'] ?? $data['promotion_id'] ?? 0);
        $status = strtolower(trim((string)($data['status'] ?? '')));

        if ($promoId <= 0 || !in_array($status, ['approved', 'rejected'], true)) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid promotion ID and status (approved or rejected) are required.']);
        }

        $ok = $this->promoRepo->moderate($promoId, $status);
        if ($ok) {
            sendJsonResponse(200, [
                'status' => 'success',
                'message' => "Promotion status updated to {$status}."
            ]);
        } else {
            sendJsonResponse(500, ['status' => 'error', 'message' => 'Failed to update promotion status.']);
        }
    }
}
