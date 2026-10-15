<?php
// api/notifications.php
// REST API Endpoint for In-App Notifications

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../repositories/NotificationRepository.php';

// 1. Authenticate user
$authUser = JWT::getAuthUser();
if (!$authUser) {
    sendJsonResponse(401, [
        'status'  => 'error',
        'message' => 'Unauthorized. Authentication token required.'
    ]);
}

$userId = (int)($authUser['id'] ?? $authUser['user_id'] ?? 0);
if ($userId <= 0) {
    sendJsonResponse(401, [
        'status'  => 'error',
        'message' => 'Unauthorized. Invalid user session.'
    ]);
}

// 2. Resolve action
$action = $_GET['action'] ?? null;

if (!$action && !empty($_SERVER['PATH_INFO'])) {
    $action = trim($_SERVER['PATH_INFO'], '/');
}

$requestData = [];
$rawInput = file_get_contents('php://input');
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $requestData = $decoded;
    }
}
if (empty($requestData) && !empty($_POST)) {
    $requestData = $_POST;
}

if (!$action && !empty($requestData['action'])) {
    $action = $requestData['action'];
}

if (!$action) {
    $action = 'list';
}

$notifRepo = new NotificationRepository();

switch ($action) {
    case 'list':
        $notifications = $notifRepo->getByUserId($userId, 20);
        $unreadCount = $notifRepo->getUnreadCount($userId);
        sendJsonResponse(200, [
            'status'        => 'success',
            'notifications' => $notifications,
            'unread_count'  => $unreadCount
        ]);
        break;

    case 'unread-count':
    case 'unread_count':
    case 'unreadCount':
    case 'count':
        $count = $notifRepo->getUnreadCount($userId);
        sendJsonResponse(200, [
            'status'       => 'success',
            'unread_count' => $count
        ]);
        break;

    case 'mark-read':
    case 'mark_read':
    case 'markRead':
    case 'read':
        $isAll = false;
        if (isset($requestData['all'])) {
            $isAll = ($requestData['all'] == 1 || $requestData['all'] === true || $requestData['all'] === '1' || $requestData['all'] === 'true');
        } elseif (isset($_GET['all'])) {
            $isAll = ($_GET['all'] == 1 || $_GET['all'] === true || $_GET['all'] === '1' || $_GET['all'] === 'true');
        }

        if ($isAll) {
            $notifRepo->markAllAsRead($userId);
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'All notifications marked as read.'
            ]);
        }

        $id = (int)($requestData['id'] ?? $_GET['id'] ?? 0);
        if ($id > 0) {
            $notifRepo->markAsRead($id, $userId);
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => "Notification #{$id} marked as read."
            ]);
        }

        // If neither all=1 nor id specified, mark all as read or return bad request
        sendJsonResponse(400, [
            'status'  => 'error',
            'message' => 'Missing parameter: provide id or all=1.'
        ]);
        break;

    default:
        sendJsonResponse(400, [
            'status'  => 'error',
            'message' => "Unknown notifications action: '{$action}'. Valid actions are: list, unread-count, mark-read."
        ]);
        break;
}
