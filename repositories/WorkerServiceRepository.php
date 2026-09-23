<?php
// repositories/WorkerServiceRepository.php

require_once __DIR__ . '/../config/Database.php';

class WorkerServiceRepository {
    private PDO $db;

    public function __construct(?PDO $db = null) {
        $this->db = $db ?? Database::getConnection();
    }

    public function create(
        int $workerId,
        ?int $categoryId,
        string $title,
        string $description,
        float $price,
        string $pricingType = 'hourly',
        string $location = 'Colombo',
        ?string $images = null
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO worker_services 
            (worker_id, category_id, title, description, price, pricing_type, location, is_available, images, created_at)
            VALUES 
            (:worker_id, :category_id, :title, :description, :price, :pricing_type, :location, 1, :images, NOW())
        ");
        $stmt->execute([
            ':worker_id'    => $workerId,
            ':category_id'  => $categoryId,
            ':title'        => $title,
            ':description'  => $description,
            ':price'        => $price,
            ':pricing_type' => $pricingType,
            ':location'     => $location,
            ':images'       => $images
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function getByWorker(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT ws.*, c.name AS category_name, c.icon AS category_icon
            FROM worker_services ws
            LEFT JOIN categories c ON ws.category_id = c.id
            WHERE ws.worker_id = :worker_id
            ORDER BY ws.id DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function getById(int $serviceId): ?array {
        $stmt = $this->db->prepare("
            SELECT ws.*, c.name AS category_name, c.icon AS category_icon
            FROM worker_services ws
            LEFT JOIN categories c ON ws.category_id = c.id
            WHERE ws.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $serviceId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function delete(int $serviceId, int $workerId): bool {
        $stmt = $this->db->prepare("
            DELETE FROM worker_services 
            WHERE id = :id AND worker_id = :worker_id
        ");
        $stmt->execute([
            ':id'        => $serviceId,
            ':worker_id' => $workerId
        ]);
        return $stmt->rowCount() > 0;
    }

    public function updateAvailability(int $serviceId, int $workerId, bool $isAvailable): bool {
        $stmt = $this->db->prepare("
            UPDATE worker_services
            SET is_available = :avail
            WHERE id = :id AND worker_id = :worker_id
        ");
        $stmt->execute([
            ':avail'     => $isAvailable ? 1 : 0,
            ':id'        => $serviceId,
            ':worker_id' => $workerId
        ]);
        return $stmt->rowCount() > 0;
    }
}
