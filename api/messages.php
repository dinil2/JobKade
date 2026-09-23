<?php
// api/messages.php
// REST API Endpoint Router for In-App Messaging

require_once __DIR__ . '/../controllers/MessageController.php';

$controller = new MessageController();

// Resolve action from GET param, PATH_INFO, or REQUEST_URI
$action = $_GET['action'] ?? null;

if (!$action && !empty($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}

if (!$action && !empty($_SERVER['REQUEST_URI'])) {
    $uriPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (preg_match('#/messages(?:\.php)?/([a-zA-Z0-9_-]+)#', $uriPath, $matches)) {
        $action = $matches[1];
    }
}

if (!$action) {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = ($method === 'POST') ? 'send' : 'conversation';
}

switch ($action) {
    case 'send':
        $controller->send();
        break;

    case 'conversation':
    case 'thread':
        $controller->conversation();
        break;

    case 'read':
        $controller->read();
        break;

    case 'conversations':
        $controller->conversations();
        break;

    case 'contact_info':
        $controller->contactInfo();
        break;

    default:
        sendJsonResponse(400, [
            'status'  => 'error',
            'message' => "Unknown messages action: '{$action}'. Valid actions are: send, conversation, read, conversations, contact_info."
        ]);
}
