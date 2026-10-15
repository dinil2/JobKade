<?php
// services/NotificationService.php

require_once __DIR__ . '/../config/Database.php';

class NotificationService {
    /**
     * Create an in-app notification for a user.
     * Failures are only logged, never breaking the main flow.
     *
     * @param int $userId
     * @param string $title
     * @param string $message
     * @param string $type
     * @return void
     */
    public static function create(int $userId, string $title, string $message, string $type = 'system'): void {
        if ($userId <= 0) {
            error_log("NotificationService::create skipped: Invalid user ID {$userId}");
            return;
        }

        try {
            $db = Database::getConnection();
            $stmt = $db->prepare("
                INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                VALUES (:uid, :title, :message, :type, 0, NOW())
            ");
            $stmt->execute([
                ':uid'     => $userId,
                ':title'   => mb_substr($title, 0, 150),
                ':message' => $message,
                ':type'    => mb_substr($type, 0, 50),
            ]);
        } catch (Throwable $e) {
            error_log("NotificationService failure for user #{$userId} [Title: {$title}]: " . $e->getMessage());
        }
    }
}
