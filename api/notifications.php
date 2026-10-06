<?php
// api/notifications.php
// REST API Endpoint Router for Notifications

require_once __DIR__ . '/../controllers/NotificationController.php';

$controller = new NotificationController();

// Resolve action from GET param, PATH_INFO, or REQUEST_URI
$action = $_GET['action'] ?? null;

if (!$action && !empty($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}

if (!$action && !empty($_SERVER['REQUEST_URI'])) {
    $uriPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (preg_match('#/notifications(?:\.php)?/([a-zA-Z0-9_-]+)#', $uriPath, $matches)) {
        $action = $matches[1];
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!$action) {
    $action = ($method === 'POST') ? 'read-all' : 'list';
}

switch (strtolower($action)) {
    case 'list':
    case 'all':
        $controller->list();
        break;

    case 'read-all':
    case 'read_all':
    case 'readall':
        $controller->readAll();
        break;

    default:
        sendJsonResponse(400, [
            'status'  => 'error',
            'message' => "Unknown notifications action: '{$action}'. Valid actions are: list, read-all."
        ]);
}
