<?php
// services/NotificationService.php

require_once __DIR__ . '/../repositories/NotificationRepository.php';

class NotificationService {
    private NotificationRepository $notifRepo;

    public function __construct(?NotificationRepository $notifRepo = null) {
        $this->notifRepo = $notifRepo ?? new NotificationRepository();
    }

    // Retrieve user notifications and unread count.
    public function getUserNotifications(int $userId): array {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID.");
        }

        $notifications = $this->notifRepo->getByUserId($userId);
        $unreadCount = $this->notifRepo->getUnreadCount($userId);

        return [
            'notifications' => $notifications,
            'unread_count'  => $unreadCount
        ];
    }

    // Mark all notifications for a user as read.
    public function markAllAsRead(int $userId): bool {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID.");
        }

        return $this->notifRepo->markAllAsRead($userId);
    }

    // Create a notification for a user.
    public function createNotification(int $userId, string $title, string $message, string $type = 'system'): int {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID.");
        }

        return $this->notifRepo->create($userId, $title, $message, $type, 0);
    }
}
