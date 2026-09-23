<?php
// api/workers.php

require_once __DIR__ . '/../controllers/WorkerController.php';

$controller = new WorkerController();
$action = $_GET['action'] ?? 'search';

switch ($action) {
    case 'search':
        $controller->search();
        break;
    case 'profile':
        $workerId = (int)($_GET['id'] ?? 0);
        $controller->getProfile($workerId);
        break;
    case 'update':
        $controller->updateProfile();
        break;
    case 'add-service':
    case 'create-service':
        $controller->addService();
        break;
    case 'my-services':
    case 'services':
        $controller->myServices();
        break;
    case 'delete-service':
        $controller->deleteService();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown worker action: $action"]);
}
