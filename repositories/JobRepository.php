<?php
// repositories/JobRepository.php

require_once __DIR__ . '/../config/Database.php';

class JobRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function create(int $customerId, int $categoryId, string $title, string $description, float $lat, float $lng, string $address, ?string $photoPath = null): int {
        $stmt = $this->db->prepare("
            INSERT INTO job_requests (customer_id, category_id, title, description, latitude, longitude, address, photo_path, status)
            VALUES (:customer_id, :category_id, :title, :description, :lat, :lng, :address, :photo_path, 'open')
        ");
        $stmt->execute([
            ':customer_id' => $customerId,
            ':category_id' => $categoryId,
            ':title'       => $title,
            ':description' => $description,
            ':lat'         => $lat,
            ':lng'         => $lng,
            ':address'     => $address,
            ':photo_path'  => $photoPath
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getOpenJobs(?int $categoryId = null): array {
        $sql = "
            SELECT jr.*, c.name AS category_name, c.icon AS category_icon, u.full_name AS customer_name, u.phone AS customer_phone
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            WHERE jr.status = 'open'
        ";
        $params = [];
        if ($categoryId !== null && $categoryId > 0) {
            $sql .= " AND jr.category_id = :cat_id";
            $params[':cat_id'] = $categoryId;
        }
        $sql .= " ORDER BY jr.created_at DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function getCustomerJobs(int $customerId): array {
        $stmt = $this->db->prepare("
            SELECT jr.*, c.name AS category_name, c.icon AS category_icon
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            WHERE jr.customer_id = :customer_id
            ORDER BY jr.created_at DESC
        ");
        $stmt->execute([':customer_id' => $customerId]);
        return $stmt->fetchAll();
    }

    public function getById(int $jobId): ?array {
        $stmt = $this->db->prepare("
            SELECT jr.*, c.name AS category_name, c.icon AS category_icon, u.full_name AS customer_name, u.phone AS customer_phone, u.email AS customer_email
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            WHERE jr.id = :id LIMIT 1
        ");
        $stmt->execute([':id' => $jobId]);
        return $stmt->fetch() ?: null;
    }

    public function updateStatus(int $jobId, string $status): bool {
        $stmt = $this->db->prepare("UPDATE job_requests SET status = :status WHERE id = :id");
        return $stmt->execute([':status' => $status, ':id' => $jobId]);
    }

    public function applyForJob(int $jobId, int $workerId, string $proposalNote, float $quoteAmount): int {
        $stmt = $this->db->prepare("
            INSERT INTO job_applications (job_id, worker_id, proposal_note, quote_amount)
            VALUES (:job_id, :worker_id, :proposal_note, :quote_amount)
        ");
        $stmt->execute([
            ':job_id'        => $jobId,
            ':worker_id'     => $workerId,
            ':proposal_note' => $proposalNote,
            ':quote_amount'  => $quoteAmount
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getJobApplications(int $jobId): array {
        $stmt = $this->db->prepare("
            SELECT ja.*, wp.is_verified, wp.verify_status, wp.rating_avg, u.full_name AS worker_name, u.phone AS worker_phone
            FROM job_applications ja
            JOIN worker_profiles wp ON ja.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE ja.job_id = :job_id
            ORDER BY ja.created_at DESC
        ");
        $stmt->execute([':job_id' => $jobId]);
        return $stmt->fetchAll();
    }

    public function getAllJobs(): array {
        $stmt = $this->db->query("
            SELECT jr.*, c.name AS category_name, u.full_name AS customer_name
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            ORDER BY jr.created_at DESC
        ");
        return $stmt->fetchAll();
    }
}
