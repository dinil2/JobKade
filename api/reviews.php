<?php
// api/reviews.php

require_once __DIR__ . '/../controllers/ReviewController.php';

$controller = new ReviewController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'create' : 'worker');

switch ($action) {
    case 'create':
        $controller->create();
        break;
    case 'worker':
        $controller->workerReviews();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown review action: $action"]);
}
