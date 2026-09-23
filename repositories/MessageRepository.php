<?php
// repositories/MessageRepository.php
// Strictly handles Data Access via PDO prepared statements

require_once __DIR__ . '/../config/Database.php';

class MessageRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Save a new message to the database.
     *
     * @param int $senderId
     * @param int $receiverId
     * @param int|null $jobId
     * @param string $text
     * @return int Inserted msg_id
     */
    public function saveMessage(int $senderId, int $receiverId, ?int $jobId, string $text): int {
        $stmt = $this->db->prepare("
            INSERT INTO messages (sender_id, receiver_id, job_id, message_text, is_read, created_at)
            VALUES (:sender_id, :receiver_id, :job_id, :message_text, 0, NOW())
        ");
        $stmt->execute([
            ':sender_id'    => $senderId,
            ':receiver_id'  => $receiverId,
            ':job_id'       => $jobId,
            ':message_text' => $text
        ]);

        return (int)$this->db->lastInsertId();
    }

    /**
     * Legacy alias for saveMessage to preserve backward compatibility.
     */
    public function sendMessage(int $senderId, int $receiverId, string $messageText, ?int $jobId = null): int {
        return $this->saveMessage($senderId, $receiverId, $jobId, $messageText);
    }

    /**
     * Get a single message by primary key msg_id.
     *
     * @param int $msgId
     * @return array|null
     */
    public function getMessageById(int $msgId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                m.msg_id,
                m.msg_id AS id,
                m.sender_id,
                m.receiver_id,
                m.job_id,
                m.message_text,
                m.is_read,
                m.created_at,
                u_sender.full_name AS sender_name,
                u_receiver.full_name AS receiver_name,
                jr.title AS job_title
            FROM messages m
            JOIN users u_sender ON m.sender_id = u_sender.id
            JOIN users u_receiver ON m.receiver_id = u_receiver.id
            LEFT JOIN job_requests jr ON m.job_id = jr.id
            WHERE m.msg_id = :msg_id
            LIMIT 1
        ");
        $stmt->execute([':msg_id' => $msgId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Get full chronological conversation between two users, optionally filtered by job_id.
     *
     * @param int $userId1
     * @param int $userId2
     * @param int|null $jobId
     * @return array
     */
    public function getConversation(int $userId1, int $userId2, ?int $jobId = null): array {
        $sql = "
            SELECT 
                m.msg_id,
                m.msg_id AS id,
                m.sender_id,
                m.receiver_id,
                m.job_id,
                m.message_text,
                m.is_read,
                m.created_at,
                u_sender.full_name AS sender_name,
                u_receiver.full_name AS receiver_name,
                jr.title AS job_title
            FROM messages m
            JOIN users u_sender ON m.sender_id = u_sender.id
            JOIN users u_receiver ON m.receiver_id = u_receiver.id
            LEFT JOIN job_requests jr ON m.job_id = jr.id
            WHERE ((m.sender_id = :u1_a AND m.receiver_id = :u2_a)
               OR  (m.sender_id = :u2_b AND m.receiver_id = :u1_b))
        ";

        $params = [
            ':u1_a' => $userId1,
            ':u2_a' => $userId2,
            ':u2_b' => $userId2,
            ':u1_b' => $userId1
        ];

        if ($jobId !== null && $jobId > 0) {
            $sql .= " AND m.job_id = :job_id";
            $params[':job_id'] = $jobId;
        }

        $sql .= " ORDER BY m.created_at ASC, m.msg_id ASC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Legacy alias for getConversation.
     */
    public function getThread(int $userId1, int $userId2): array {
        return $this->getConversation($userId1, $userId2);
    }

    /**
     * Mark all unread messages sent by $senderId to $receiverId as read.
     *
     * @param int $senderId The user who sent the incoming messages
     * @param int $receiverId The authenticated user who received them
     * @return bool
     */
    public function markAsRead(int $senderId, int $receiverId): bool {
        $stmt = $this->db->prepare("
            UPDATE messages
            SET is_read = 1
            WHERE sender_id = :sender_id 
              AND receiver_id = :receiver_id 
              AND is_read = 0
        ");
        return $stmt->execute([
            ':sender_id'   => $senderId,
            ':receiver_id' => $receiverId
        ]);
    }

    /**
     * Retrieve all active conversation threads for a specific user with unread counts.
     *
     * @param int $userId
     * @return array
     */
    public function getUserConversations(int $userId): array {
        $stmt = $this->db->prepare("
            SELECT 
                c.other_user_id,
                u.full_name AS other_user_name,
                u.role AS other_user_role,
                u.phone AS other_user_phone,
                last_m.message_text AS last_message,
                last_m.created_at AS last_message_time,
                last_m.sender_id AS last_sender_id,
                COALESCE(unread.unread_count, 0) AS unread_count
            FROM (
                SELECT 
                    CASE WHEN sender_id = :uid1 THEN receiver_id ELSE sender_id END AS other_user_id,
                    MAX(msg_id) AS max_msg_id
                FROM messages
                WHERE sender_id = :uid2 OR receiver_id = :uid3
                GROUP BY other_user_id
            ) c
            JOIN users u ON c.other_user_id = u.id
            JOIN messages last_m ON c.max_msg_id = last_m.msg_id
            LEFT JOIN (
                SELECT sender_id, COUNT(*) AS unread_count
                FROM messages
                WHERE receiver_id = :uid4 AND is_read = 0
                GROUP BY sender_id
            ) unread ON unread.sender_id = c.other_user_id
            ORDER BY last_m.created_at DESC
        ");
        $stmt->execute([
            ':uid1' => $userId,
            ':uid2' => $userId,
            ':uid3' => $userId,
            ':uid4' => $userId
        ]);
        return $stmt->fetchAll();
    }

    /**
     * Retrieve contact details for a chat participant.
     *
     * @param int $userId
     * @return array|null
     */
    public function getContactInfo(int $userId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                u.id, 
                u.full_name, 
                u.role, 
                u.phone, 
                u.email,
                wp.id AS worker_id, 
                wp.is_verified,
                wp.verify_status,
                wp.rating_avg, 
                wp.address
            FROM users u
            LEFT JOIN worker_profiles wp ON u.id = wp.user_id
            WHERE u.id = :id 
            LIMIT 1
        ");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();
        return $user ?: null;
    }
}
