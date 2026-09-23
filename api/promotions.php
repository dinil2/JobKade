<?php
// api/promotions.php

require_once __DIR__ . '/../controllers/PromotionController.php';

$controller = new PromotionController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'create' : 'active');

switch ($action) {
    case 'active':
        $controller->active();
        break;
    case 'create':
        $controller->create();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown promotions action: $action"]);
}
