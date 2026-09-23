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

    public function active(): void {
        $promos = $this->promoRepo->getActivePromotions();
        sendJsonResponse(200, ['status' => 'success', 'promotions' => $promos]);
    }

    public function create(): void {
        $user = JWT::getAuthUser();
        if (!$user || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can create promotions.']);
        }

        $data = getRequestData();
        $title = trim($data['title'] ?? '');
        $description = trim($data['description'] ?? '');
        $discount = (int)($data['discount_percent'] ?? 10);
        $validUntil = $data['valid_until'] ?? date('Y-m-d', strtotime('+30 days'));

        if (empty($title) || empty($description)) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Title and description are required.']);
        }

        $id = $this->promoRepo->createPromotion((int)$user['worker_id'], $title, $description, $discount, $validUntil);
        sendJsonResponse(201, [
            'status' => 'success',
            'message' => 'Promotion submitted for admin approval!',
            'promotion_id' => $id
        ]);
    }
}
