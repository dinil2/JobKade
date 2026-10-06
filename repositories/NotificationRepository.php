<?php
// repositories/NotificationRepository.php

require_once __DIR__ . '/../config/Database.php';

class NotificationRepository {
    private PDO $db;

    public function __construct(?PDO $db = null) {
        $this->db = $db ?? Database::getConnection();
    }

    /**
     * Create a new notification for a user.
     *
     * @param int $userId
     * @param string $title
     * @param string $message
     * @param string $type
     * @param int $isRead
     * @return int
     */
    public function create(int $userId, string $title, string $message, string $type = 'system', int $isRead = 0): int {
        $stmt = $this->db->prepare("
            INSERT INTO notifications (user_id, title, message, type, is_read)
            VALUES (:uid, :title, :msg, :type, :is_read)
        ");
        $stmt->execute([
            ':uid'     => $userId,
            ':title'   => $title,
            ':msg'     => $message,
            ':type'    => $type,
            ':is_read' => $isRead
        ]);
        return (int)$this->db->lastInsertId();
    }

    /**
     * Get user notifications ordered by newest first.
     *
     * @param int $userId
     * @param int $limit
     * @return array
     */
    public function getByUserId(int $userId, int $limit = 50): array {
        $stmt = $this->db->prepare("
            SELECT id, title, message, type, is_read, created_at
            FROM notifications
            WHERE user_id = :uid
            ORDER BY id DESC
            LIMIT :lim
        ");
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map(function($row) {
            $row['id'] = (int)$row['id'];
            $row['is_read'] = (int)$row['is_read'];
            return $row;
        }, $results);
    }

    /**
     * Mark all notifications for a user as read.
     *
     * @param int $userId
     * @return bool
     */
    public function markAllAsRead(int $userId): bool {
        $stmt = $this->db->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = :uid AND is_read = 0
        ");
        return $stmt->execute([':uid' => $userId]);
    }

    /**
     * Count unread notifications for a user.
     *
     * @param int $userId
     * @return int
     */
    public function getUnreadCount(int $userId): int {
        $stmt = $this->db->prepare("
            SELECT COUNT(*)
            FROM notifications
            WHERE user_id = :uid AND is_read = 0
        ");
        $stmt->execute([':uid' => $userId]);
        return (int)$stmt->fetchColumn();
    }
}
