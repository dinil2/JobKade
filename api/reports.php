<?php
// api/reports.php

require_once __DIR__ . '/../controllers/ReportController.php';

$controller = new ReportController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'create' : 'list');

switch ($action) {
    case 'create':
        $controller->create();
        break;

    case 'list':
    case 'all':
        $controller->list();
        break;

    case 'counts':
    case 'stats':
        $controller->counts();
        break;

    case 'dismiss':
        $controller->dismiss();
        break;

    case 'resolve':
        $controller->resolve();
        break;

    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown report action: $action"]);
}
