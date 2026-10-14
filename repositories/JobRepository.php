<?php
// repositories/JobRepository.php

require_once __DIR__ . '/../config/Database.php';

class JobRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function create(
        int $customerId,
        int $categoryId,
        string $title,
        string $description,
        float $lat,
        float $lng,
        string $address,
        ?string $photoPath = null,
        string $district = 'Colombo',
        ?string $city = null
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO job_requests (customer_id, category_id, title, description, latitude, longitude, address, district, city, photo_path, status)
            VALUES (:customer_id, :category_id, :title, :description, :lat, :lng, :address, :district, :city, :photo_path, 'open')
        ");
        $stmt->execute([
            ':customer_id' => $customerId,
            ':category_id' => $categoryId,
            ':title'       => $title,
            ':description' => $description,
            ':lat'         => $lat,
            ':lng'         => $lng,
            ':address'     => $address,
            ':district'    => $district,
            ':city'        => $city,
            ':photo_path'  => $photoPath
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getOpenJobs(?int $categoryId = null, ?string $district = null, ?int $workerProfileId = null): array {
        $sql = "
            SELECT jr.*, c.name AS category_name, c.icon AS category_icon, u.full_name AS customer_name, u.phone AS customer_phone
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            WHERE jr.status = 'open' AND jr.worker_id IS NULL
        ";
        $params = [];
        if ($categoryId !== null && $categoryId > 0) {
            $sql .= " AND jr.category_id = :cat_id";
            $params[':cat_id'] = $categoryId;
        }

        if ($workerProfileId !== null && $workerProfileId > 0) {
            $sql .= " AND EXISTS (
                SELECT 1 FROM worker_coverage wc
                WHERE wc.worker_id = :wc_worker_id
                  AND wc.district = jr.district
                  AND (wc.city = 'ALL' OR wc.city = jr.city)
            )";
            $params[':wc_worker_id'] = $workerProfileId;
        }

        if (!empty($district)) {
            $sql .= " ORDER BY (CASE WHEN (jr.district = :dist_exact OR jr.address LIKE :dist_pattern) THEN 1 ELSE 0 END) DESC, jr.created_at DESC";
            $params[':dist_exact'] = trim($district);
            $params[':dist_pattern'] = "%" . trim($district) . "%";
        } else {
            $sql .= " ORDER BY jr.created_at DESC";
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function getCustomerJobs(int $customerId): array {
        $stmt = $this->db->prepare("
            SELECT jr.*, 
                   c.name AS category_name, 
                   c.icon AS category_icon,
                   u_worker.full_name AS worker_name,
                   u_worker.phone AS worker_phone,
                   COALESCE(
                       (SELECT ws.price FROM worker_services ws 
                        WHERE ws.worker_id = wp.id 
                          AND ws.category_id = jr.category_id 
                          AND ws.pricing_type = 'hourly' 
                        ORDER BY ws.id DESC LIMIT 1),
                       wp.hourly_rate
                   ) AS worker_hourly_rate,
                   wp.travelling_fee AS worker_travelling_fee,
                   wp.rating_avg AS worker_rating
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            LEFT JOIN worker_profiles wp ON jr.worker_id = wp.id
            LEFT JOIN users u_worker ON wp.user_id = u_worker.id
            WHERE jr.customer_id = :customer_id
            ORDER BY jr.created_at DESC
        ");
        $stmt->execute([':customer_id' => $customerId]);
        return $stmt->fetchAll();
    }

    // All jobs assigned to or applied by a worker, with details.
    public function getWorkerJobs(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT jr.*,
                   jr.id AS job_id,
                   jr.title AS job_title,
                   jr.status AS job_status,
                   c.name AS category_name,
                   c.icon AS category_icon,
                   u.full_name AS customer_name,
                   u.phone AS customer_phone,
                   u.email AS customer_email,
                   COALESCE(
                       (SELECT ws.price FROM worker_services ws 
                        WHERE ws.worker_id = wp.id 
                          AND ws.category_id = jr.category_id 
                          AND ws.pricing_type = 'hourly' 
                        ORDER BY ws.id DESC LIMIT 1),
                       wp.hourly_rate
                   ) AS worker_hourly_rate,
                   wp.travelling_fee AS worker_travelling_fee
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            LEFT JOIN worker_profiles wp ON jr.worker_id = wp.id
            WHERE jr.worker_id = :worker_id
            ORDER BY jr.updated_at DESC, jr.created_at DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function getById(int $jobId): ?array {
        $stmt = $this->db->prepare("
            SELECT jr.*, 
                   c.name AS category_name, 
                   c.icon AS category_icon, 
                   u.full_name AS customer_name, 
                   u.phone AS customer_phone, 
                   u.email AS customer_email,
                   u_worker.full_name AS worker_name,
                   u_worker.phone AS worker_phone,
                   COALESCE(
                       (SELECT ws.price FROM worker_services ws 
                        WHERE ws.worker_id = wp.id 
                          AND ws.category_id = jr.category_id 
                          AND ws.pricing_type = 'hourly' 
                        ORDER BY ws.id DESC LIMIT 1),
                       wp.hourly_rate
                   ) AS worker_hourly_rate,
                   wp.travelling_fee AS worker_travelling_fee
            FROM job_requests jr
            JOIN categories c ON jr.category_id = c.id
            JOIN users u ON jr.customer_id = u.id
            LEFT JOIN worker_profiles wp ON jr.worker_id = wp.id
            LEFT JOIN users u_worker ON wp.user_id = u_worker.id
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
