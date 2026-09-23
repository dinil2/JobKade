<?php
// api/kyc.php

require_once __DIR__ . '/../controllers/KycController.php';

$controller = new KycController();

// Support query parameter ?action=..., PATH_INFO, or RESTful defaults
$action = $_GET['action'] ?? null;
if (!$action && !empty($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}
if (!$action) {
    $action = ($_SERVER['REQUEST_METHOD'] === 'POST') ? 'upload' : 'status';
}

switch ($action) {
    case 'upload':
        $controller->upload();
        break;
    case 'status':
        $controller->status();
        break;
    case 'my-docs':
    case 'documents':
        $controller->myDocuments();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown KYC action: $action"]);
}
