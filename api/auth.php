<?php
// api/auth.php

require_once __DIR__ . '/../controllers/AuthController.php';

$controller = new AuthController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'login' : 'me');

switch ($action) {
    case 'register':
        $controller->register();
        break;
    case 'login':
        $controller->login();
        break;
    case 'me':
        $controller->me();
        break;
    case 'update-profile':
    case 'update':
        $controller->updateProfile();
        break;
    case 'change-password':
    case 'password':
        $controller->changePassword();
        break;
    case 'upload-photo':
    case 'upload-profile-picture':
    case 'profile-picture':
        $controller->uploadProfilePhoto();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown auth action: $action"]);
}
