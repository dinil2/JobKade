<?php
// services/NotificationService.php

require_once __DIR__ . '/../repositories/NotificationRepository.php';

class NotificationService {
    private NotificationRepository $notifRepo;

    public function __construct(?NotificationRepository $notifRepo = null) {
        $this->notifRepo = $notifRepo ?? new NotificationRepository();
    }

    /**
     * Retrieve user notifications and unread count.
     *
     * @param int $userId
     * @return array
     */
    public function getUserNotifications(int $userId): array {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID provided.");
        }

        $notifications = $this->notifRepo->getByUserId($userId);
        $unreadCount = $this->notifRepo->getUnreadCount($userId);

        return [
            'notifications' => $notifications,
            'unread_count'  => $unreadCount
        ];
    }

    /**
     * Mark all notifications for a user as read.
     *
     * @param int $userId
     * @return bool
     */
    public function markAllAsRead(int $userId): bool {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID provided.");
        }

        return $this->notifRepo->markAllAsRead($userId);
    }

    /**
     * Create a notification for a user.
     *
     * @param int $userId
     * @param string $title
     * @param string $message
     * @param string $type
     * @return int
     */
    public function createNotification(int $userId, string $title, string $message, string $type = 'system'): int {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID provided.");
        }

        return $this->notifRepo->create($userId, $title, $message, $type, 0);
    }
}
