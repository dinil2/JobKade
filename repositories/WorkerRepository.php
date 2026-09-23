<?php
// repositories/WorkerRepository.php

require_once __DIR__ . '/../config/Database.php';

class WorkerRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function getProfileByUserId(int $userId): ?array {
        $stmt = $this->db->prepare("
            SELECT wp.*, u.full_name, u.email, u.phone, u.username
            FROM worker_profiles wp
            JOIN users u ON wp.user_id = u.id
            WHERE wp.user_id = :user_id LIMIT 1
        ");
        $stmt->execute([':user_id' => $userId]);
        $profile = $stmt->fetch();
        if ($profile) {
            $profile['categories'] = $this->getWorkerCategories($profile['id']);
        }
        return $profile ?: null;
    }

    public function findByUserId(int $userId): ?array {
        return $this->getProfileByUserId($userId);
    }

    public function findById(int $id): ?array {
        return $this->getProfileById($id);
    }

    public function getProfileById(int $workerId): ?array {
        $stmt = $this->db->prepare("
            SELECT wp.*, u.full_name, u.email, u.phone, u.username
            FROM worker_profiles wp
            JOIN users u ON wp.user_id = u.id
            WHERE wp.id = :id LIMIT 1
        ");
        $stmt->execute([':id' => $workerId]);
        $profile = $stmt->fetch();
        if ($profile) {
            $profile['categories'] = $this->getWorkerCategories($profile['id']);
        }
        return $profile ?: null;
    }

    public function createProfile(int $userId, array $data): int {
        $stmt = $this->db->prepare("
            INSERT INTO worker_profiles (user_id, bio, service_radius_km, latitude, longitude, address, working_hours, verify_status)
            VALUES (:user_id, :bio, :service_radius_km, :latitude, :longitude, :address, :working_hours, 'unverified')
        ");
        $stmt->execute([
            ':user_id'           => $userId,
            ':bio'               => $data['bio'] ?? '',
            ':service_radius_km' => $data['service_radius_km'] ?? 15,
            ':latitude'          => $data['latitude'] ?? 6.9271,
            ':longitude'         => $data['longitude'] ?? 79.8612,
            ':address'           => $data['address'] ?? 'Colombo',
            ':working_hours'     => $data['working_hours'] ?? '8:00 AM - 6:00 PM'
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function updateProfile(int $workerId, array $data): bool {
        $stmt = $this->db->prepare("
            UPDATE worker_profiles 
            SET bio = :bio, service_radius_km = :service_radius_km,
                latitude = :latitude, longitude = :longitude, address = :address, working_hours = :working_hours
            WHERE id = :id
        ");
        $res = $stmt->execute([
            ':bio'               => $data['bio'] ?? '',
            ':service_radius_km' => $data['service_radius_km'] ?? 15,
            ':latitude'          => $data['latitude'] ?? 6.9271,
            ':longitude'         => $data['longitude'] ?? 79.8612,
            ':address'           => $data['address'] ?? 'Colombo',
            ':working_hours'     => $data['working_hours'] ?? '8:00 AM - 6:00 PM',
            ':id'                => $workerId
        ]);

        if (!empty($data['full_name']) || !empty($data['phone'])) {
            $userStmt = $this->db->prepare("
                UPDATE users u
                JOIN worker_profiles wp ON u.id = wp.user_id
                SET u.full_name = COALESCE(:full_name, u.full_name),
                    u.phone = COALESCE(:phone, u.phone)
                WHERE wp.id = :id
            ");
            $userStmt->execute([
                ':full_name' => $data['full_name'] ?? null,
                ':phone'     => $data['phone'] ?? null,
                ':id'        => $workerId
            ]);
        }

        return $res;
    }

    public function setVerified(int $workerId, bool $isVerified): bool {
        $status = $isVerified ? 'verified' : 'unverified';
        $stmt = $this->db->prepare("UPDATE worker_profiles SET is_verified = :v, verify_status = :status WHERE id = :id");
        return $stmt->execute([
            ':v'      => $isVerified ? 1 : 0,
            ':status' => $status,
            ':id'     => $workerId
        ]);
    }

    public function updateVerificationStatus(int $workerId, string $status): bool {
        $isVerified = ($status === 'verified') ? 1 : 0;
        $stmt = $this->db->prepare("UPDATE worker_profiles SET verify_status = :status, is_verified = :v WHERE id = :id");
        return $stmt->execute([
            ':status' => $status,
            ':v'      => $isVerified,
            ':id'     => $workerId
        ]);
    }

    public function getWorkerCategories(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT c.id, c.name, c.slug, c.icon
            FROM categories c
            JOIN worker_categories wc ON c.id = wc.category_id
            WHERE wc.worker_id = :worker_id
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function setWorkerCategories(int $workerId, array $categoryIds): void {
        $this->db->prepare("DELETE FROM worker_categories WHERE worker_id = :id")->execute([':id' => $workerId]);
        $ins = $this->db->prepare("INSERT INTO worker_categories (worker_id, category_id) VALUES (:w, :c)");
        foreach ($categoryIds as $catId) {
            $ins->execute([':w' => $workerId, ':c' => (int)$catId]);
        }
    }

    /**
     * Search verified workers with optional trade category and location calculation (Haversine Formula).
     *
     * @param float|null $lat
     * @param float|null $lng
     * @param int|null $categoryId
     * @return array
     */
    public function searchWorkers(?float $lat = null, ?float $lng = null, ?int $categoryId = null): array {
        $params = [];
        $distanceSelect = "0 AS distance_km";

        if ($lat !== null && $lng !== null) {
            // Earth radius ~6371 km
            $distanceSelect = "(6371 * acos(
                cos(radians(:lat)) * cos(radians(wp.latitude)) * cos(radians(wp.longitude) - radians(:lng)) +
                sin(radians(:lat)) * sin(radians(wp.latitude))
            )) AS distance_km";
            $params[':lat'] = $lat;
            $params[':lng'] = $lng;
        }

        $sql = "
            SELECT wp.*, u.full_name, u.email, u.phone, u.username, $distanceSelect
            FROM worker_profiles wp
            JOIN users u ON wp.user_id = u.id
            WHERE u.status = 'active'
        ";

        if ($categoryId !== null && $categoryId > 0) {
            $sql .= " AND wp.id IN (SELECT worker_id FROM worker_categories WHERE category_id = :cat_id)";
            $params[':cat_id'] = $categoryId;
        }

        if ($lat !== null && $lng !== null) {
            $sql .= " ORDER BY distance_km ASC";
        } else {
            $sql .= " ORDER BY wp.rating_avg DESC, wp.is_verified DESC";
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $workers = $stmt->fetchAll();

        foreach ($workers as &$worker) {
            $worker['categories'] = $this->getWorkerCategories($worker['id']);
            $worker['distance_km'] = isset($worker['distance_km']) ? round((float)$worker['distance_km'], 1) : null;
        }

        return $workers;
    }
}
