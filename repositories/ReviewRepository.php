<?php
// repositories/ReviewRepository.php

require_once __DIR__ . '/../config/Database.php';

class ReviewRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function createReview(int $customerId, int $workerId, ?int $jobId, int $rating, string $comment): int {
        $stmt = $this->db->prepare("
            INSERT INTO reviews (customer_id, worker_id, job_id, rating, comment)
            VALUES (:customer_id, :worker_id, :job_id, :rating, :comment)
        ");
        $stmt->execute([
            ':customer_id' => $customerId,
            ':worker_id'   => $workerId,
            ':job_id'      => $jobId,
            ':rating'      => $rating,
            ':comment'     => $comment
        ]);
        $reviewId = (int)$this->db->lastInsertId();

        // Update worker aggregate rating
        $this->updateWorkerScore($workerId);

        return $reviewId;
    }

    public function getWorkerReviews(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT r.*, u.full_name AS customer_name
            FROM reviews r
            JOIN users u ON r.customer_id = u.id
            WHERE r.worker_id = :w_id
            ORDER BY r.created_at DESC
        ");
        $stmt->execute([':w_id' => $workerId]);
        return $stmt->fetchAll();
    }

    private function updateWorkerScore(int $workerId): void {
        $stmt = $this->db->prepare("
            SELECT AVG(rating) AS avg_score, COUNT(*) AS total_count
            FROM reviews WHERE worker_id = :id
        ");
        $stmt->execute([':id' => $workerId]);
        $res = $stmt->fetch();
        if ($res && $res['total_count'] > 0) {
            $update = $this->db->prepare("
                UPDATE worker_profiles
                SET rating_avg = :score, reviews_count = :cnt
                WHERE id = :id
            ");
            $update->execute([
                ':score' => round((float)$res['avg_score'], 2),
                ':cnt'   => (int)$res['total_count'],
                ':id'    => $workerId
            ]);
        }
    }
}
