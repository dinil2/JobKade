<?php
// api/subscriptions.php

require_once __DIR__ . '/../controllers/SubscriptionController.php';

$controller = new SubscriptionController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'pay' : 'plans');

switch ($action) {
    case 'plans':
        $controller->getPlans();
        break;
    case 'pay':
        $controller->pay();
        break;
    case 'receipt':
        $controller->receipt();
        break;
    case 'history':
        $controller->history();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown subscription action: $action"]);
}
