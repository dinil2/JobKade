<?php
// repositories/PromotionRepository.php

require_once __DIR__ . '/../config/Database.php';

class PromotionRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getActivePromotions(): array {
        $stmt = $this->db->query("
            SELECT p.*, wp.is_verified, wp.verify_status, wp.rating_avg, wp.address, u.full_name AS worker_name, u.phone AS worker_phone
            FROM promotions p
            JOIN worker_profiles wp ON p.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE p.status = 'approved' AND p.valid_until >= CURDATE()
            ORDER BY p.created_at DESC
        ");
        return $stmt->fetchAll();
    }

    public function createPromotion(int $workerId, string $title, string $description, int $discountPercent, string $validUntil): int {
        $stmt = $this->db->prepare("
            INSERT INTO promotions (worker_id, title, description, discount_percent, valid_until, status)
            VALUES (:worker_id, :title, :description, :discount, :valid_until, 'pending')
        ");
        $stmt->execute([
            ':worker_id' => $workerId,
            ':title'     => $title,
            ':description' => $description,
            ':discount'  => $discountPercent,
            ':valid_until' => $validUntil
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getAllPending(): array {
        $stmt = $this->db->query("
            SELECT p.*, u.full_name AS worker_name
            FROM promotions p
            JOIN worker_profiles wp ON p.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE p.status = 'pending'
            ORDER BY p.created_at ASC
        ");
        return $stmt->fetchAll();
    }

    public function moderate(int $promoId, string $status): bool {
        $stmt = $this->db->prepare("UPDATE promotions SET status = :status WHERE id = :id");
        return $stmt->execute([':status' => $status, ':id' => $promoId]);
    }

    public function getByWorker(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT p.*, wp.is_verified, wp.verify_status, u.full_name AS worker_name
            FROM promotions p
            JOIN worker_profiles wp ON p.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE p.worker_id = :worker_id
            ORDER BY p.created_at DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function deleteByWorker(int $promoId, int $workerId): bool {
        $stmt = $this->db->prepare("DELETE FROM promotions WHERE id = :id AND worker_id = :worker_id");
        $stmt->execute([':id' => $promoId, ':worker_id' => $workerId]);
        return $stmt->rowCount() > 0;
    }
}
