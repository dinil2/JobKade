<?php
// api/admin.php

require_once __DIR__ . '/../controllers/AdminController.php';

$controller = new AdminController();

// Support query param ?action=..., PATH_INFO, or defaults
$action = $_GET['action'] ?? null;
if (!$action && !empty($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}
if (!$action) {
    $action = 'stats';
}

switch ($action) {
    case 'stats':
        $controller->stats();
        break;

    case 'analytics':
        $controller->analytics();
        break;

    // KYC Moderation Actions
    case 'kyc/pending':
    case 'kyc-pending':
    case 'kyc-queue':
        $controller->kycPending();
        break;

    case 'kyc/list':
    case 'kyc-list':
        $controller->kycList();
        break;

    case 'kyc/counts':
    case 'kyc-counts':
        $controller->kycCounts();
        break;

    case 'kyc/verify':
    case 'kyc-verify':
    case 'review-kyc':
        $controller->kycVerify();
        break;

    case 'kyc/packet':
    case 'kyc-packet':
        $controller->kycWorkerPacket();
        break;

    // User Management
    case 'users':
        $controller->users();
        break;
    case 'toggle-user':
        $controller->toggleUserStatus();
        break;

    // Financial & Subscriptions
    case 'payments':
        $controller->allPayments();
        break;

    // Promotions Moderation
    case 'promos':
        $controller->pendingPromotions();
        break;
    case 'review-promo':
        $controller->reviewPromotion();
        break;

    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown admin action: $action"]);
}
