<?php
// controllers/NotificationController.php

require_once __DIR__ . '/../services/NotificationService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class NotificationController {
    private NotificationService $notifService;

    public function __construct(?NotificationService $notifService = null) {
        $this->notifService = $notifService ?? new NotificationService();
    }

    /**
     * Authenticate JWT Bearer token and extract user ID.
     *
     * @return array
     */
    private function authenticate(): array {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, [
                'status'  => 'error',
                'message' => 'Unauthorized. A valid JWT Bearer token is required.'
            ]);
        }

        $userId = (int)($user['id'] ?? $user['user_id'] ?? 0);
        if ($userId <= 0) {
            sendJsonResponse(401, [
                'status'  => 'error',
                'message' => 'Unauthorized. Invalid user payload inside JWT token.'
            ]);
        }

        return [
            'user_id' => $userId,
            'role'    => $user['role'] ?? 'customer',
            'email'   => $user['email'] ?? ''
        ];
    }

    /**
     * GET ?action=list
     * Returns logged-in user's notifications ordered by newest first:
     * id, title, message, type, is_read, created_at
     */
    public function list(): void {
        $authUser = $this->authenticate();

        try {
            $data = $this->notifService->getUserNotifications($authUser['user_id']);
            sendJsonResponse(200, [
                'status'        => 'success',
                'notifications' => $data['notifications'],
                'unread_count'  => $data['unread_count']
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Failed to retrieve notifications: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * POST ?action=read-all
     * Marks all notifications of logged-in user as read.
     */
    public function readAll(): void {
        $authUser = $this->authenticate();

        try {
            $this->notifService->markAllAsRead($authUser['user_id']);
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'All notifications marked as read.'
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Failed to mark notifications as read: ' . $e->getMessage()
            ]);
        }
    }
}
