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
            $profile['services'] = $this->getWorkerServices($profile['id']);
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
            $profile['services'] = $this->getWorkerServices($profile['id']);

            $primaryCat = null;
            $secondaryCats = [];
            foreach ($profile['categories'] as $cat) {
                if ((int)($cat['is_primary'] ?? 0) === 1 && !$primaryCat) {
                    $primaryCat = $cat['name'];
                } else {
                    $secondaryCats[] = $cat['name'];
                }
            }
            if (!$primaryCat && !empty($profile['categories'])) {
                $primaryCat = $profile['categories'][0]['name'];
                $secondaryCats = array_slice(array_map(fn($c) => $c['name'], $profile['categories']), 1);
            }
            $profile['primary_trade'] = $primaryCat ?: ($profile['profession'] ?? 'Service Professional');
            $profile['secondary_trades'] = $secondaryCats;
            $profile['extra_categories'] = $secondaryCats;
        }
        return $profile ?: null;
    }

    public function createProfile(int $userId, array $data): int {
        $district = $data['district'] ?? $data['address'] ?? 'Colombo';
        $stmt = $this->db->prepare("
            INSERT INTO worker_profiles (user_id, bio, address, district, working_hours, verify_status)
            VALUES (:user_id, :bio, :address, :district, :working_hours, 'unverified')
        ");
        $stmt->execute([
            ':user_id'           => $userId,
            ':bio'               => $data['bio'] ?? '',
            ':address'           => $data['address'] ?? $district,
            ':district'          => $district,
            ':working_hours'     => $data['working_hours'] ?? '8:00 AM - 6:00 PM'
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function updateProfile(int $workerId, array $data): bool {
        $district = $data['district'] ?? ($data['address'] ?? null);
        $stmt = $this->db->prepare("
            UPDATE worker_profiles 
            SET bio = :bio, address = :address, district = COALESCE(:district, district), working_hours = :working_hours
            WHERE id = :id
        ");
        $res = $stmt->execute([
            ':bio'               => $data['bio'] ?? '',
            ':address'           => $data['address'] ?? 'Colombo',
            ':district'          => $district,
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

    public function isVerified(int $workerId): bool {
        $stmt = $this->db->prepare("
            SELECT verify_status, is_verified 
            FROM worker_profiles 
            WHERE id = :wid OR user_id = :uid 
            LIMIT 1
        ");
        $stmt->execute([':wid' => $workerId, ':uid' => $workerId]);
        $row = $stmt->fetch();
        if (!$row) {
            return false;
        }
        return ($row['verify_status'] === 'verified' || (int)$row['is_verified'] === 1);
    }

    public function getWorkerCategories(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT c.id, c.name, c.slug, c.icon, COALESCE(wc.is_primary, 0) AS is_primary
            FROM categories c
            JOIN worker_categories wc ON c.id = wc.category_id
            WHERE wc.worker_id = :worker_id
            ORDER BY wc.is_primary DESC, wc.category_id ASC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function getCategoryCount(int $workerId): int {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM worker_categories WHERE worker_id = :wid");
        $stmt->execute([':wid' => $workerId]);
        return (int)$stmt->fetchColumn();
    }

    public function hasCategory(int $workerId, int $categoryId): bool {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM worker_categories WHERE worker_id = :wid AND category_id = :cid");
        $stmt->execute([':wid' => $workerId, ':cid' => $categoryId]);
        return ((int)$stmt->fetchColumn()) > 0;
    }

    public function setWorkerCategories(int $workerId, array $categoryIds, ?int $primaryCategoryId = null): void {
        $this->db->prepare("DELETE FROM worker_categories WHERE worker_id = :id")->execute([':id' => $workerId]);
        $ins = $this->db->prepare("INSERT INTO worker_categories (worker_id, category_id, is_primary) VALUES (:w, :c, :p)");
        foreach ($categoryIds as $idx => $catId) {
            $isPri = ($primaryCategoryId !== null && (int)$catId === (int)$primaryCategoryId) || ($primaryCategoryId === null && $idx === 0);
            $ins->execute([
                ':w' => $workerId,
                ':c' => (int)$catId,
                ':p' => $isPri ? 1 : 0
            ]);
        }
    }

    public function getWorkerServices(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT ws.id, ws.worker_id, ws.category_id, ws.title, ws.description, 
                   ws.price, ws.pricing_type, ws.location, ws.is_available,
                   COALESCE(c.name, 'General Services') AS category,
                   COALESCE(c.name, 'General Services') AS category_name,
                   c.slug AS category_slug, c.icon AS category_icon
            FROM worker_services ws
            LEFT JOIN categories c ON ws.category_id = c.id
            WHERE ws.worker_id = :worker_id AND ws.is_available = 1
            ORDER BY ws.id DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    public function addCategoryIfNotExists(int $workerId, int $categoryId, bool $isPrimary = false): bool {
        if ($workerId <= 0 || $categoryId <= 0) {
            return false;
        }
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM worker_categories WHERE worker_id = :wid AND category_id = :cid");
        $stmt->execute([':wid' => $workerId, ':cid' => $categoryId]);
        if ((int)$stmt->fetchColumn() === 0) {
            $ins = $this->db->prepare("INSERT INTO worker_categories (worker_id, category_id, is_primary) VALUES (:wid, :cid, :is_primary)");
            return $ins->execute([
                ':wid'        => $workerId,
                ':cid'        => $categoryId,
                ':is_primary' => $isPrimary ? 1 : 0
            ]);
        }
        return true;
    }

    public function getCategoryIdBySlugOrName(string $nameOrSlug): ?int {
        $term = strtolower(trim($nameOrSlug));
        $stmt = $this->db->prepare("
            SELECT id FROM categories 
            WHERE LOWER(slug) = :term OR LOWER(name) = :term 
            LIMIT 1
        ");
        $stmt->execute([':term' => $term]);
        $row = $stmt->fetch();
        return $row ? (int)$row['id'] : null;
    }

    /**
     * Search verified workers with optional trade category.
     * Coordinates/distance calculations are ignored.
     * Ordered by rating_avg DESC, is_verified DESC only.
     *
     * @param float|null $lat
     * @param float|null $lng
     * @param int|null $categoryId
     * @return array
     */
    public function searchWorkers(?float $lat = null, ?float $lng = null, ?int $categoryId = null, ?string $district = null): array {
        $params = [];

        $sql = "
            SELECT wp.*, u.full_name, u.email, u.phone, u.username
            FROM worker_profiles wp
            JOIN users u ON wp.user_id = u.id
            WHERE u.status = 'active'
        ";

        if ($categoryId !== null && $categoryId > 0) {
            $sql .= " AND wp.id IN (SELECT worker_id FROM worker_categories WHERE category_id = :cat_id)";
            $params[':cat_id'] = $categoryId;
        }

        if (!empty($district)) {
            $cleanDistrict = trim($district);
            $sql .= " ORDER BY (CASE WHEN (
                wp.district = :dist_exact1 
                OR wp.address LIKE :dist_pattern1 
                OR u.address LIKE :dist_pattern2
                OR EXISTS (
                    SELECT 1 FROM worker_services ws 
                    WHERE ws.worker_id = wp.id 
                    AND (ws.district = :dist_exact2 OR ws.location LIKE :dist_pattern3)
                )
            ) THEN 1 ELSE 0 END) DESC, wp.rating_avg DESC, wp.is_verified DESC";
            $params[':dist_exact1'] = $cleanDistrict;
            $params[':dist_exact2'] = $cleanDistrict;
            $params[':dist_pattern1'] = "%" . $cleanDistrict . "%";
            $params[':dist_pattern2'] = "%" . $cleanDistrict . "%";
            $params[':dist_pattern3'] = "%" . $cleanDistrict . "%";
        } else {
            $sql .= " ORDER BY wp.rating_avg DESC, wp.is_verified DESC";
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $workers = $stmt->fetchAll();

        foreach ($workers as &$worker) {
            $worker['categories'] = $this->getWorkerCategories($worker['id']);
            $worker['services'] = $this->getWorkerServices($worker['id']);

            $primaryCat = null;
            $secondaryCats = [];
            foreach ($worker['categories'] as $cat) {
                if ((int)($cat['is_primary'] ?? 0) === 1 && !$primaryCat) {
                    $primaryCat = $cat['name'];
                } else {
                    $secondaryCats[] = $cat['name'];
                }
            }
            if (!$primaryCat && !empty($worker['categories'])) {
                $primaryCat = $worker['categories'][0]['name'];
                $secondaryCats = array_slice(array_map(fn($c) => $c['name'], $worker['categories']), 1);
            }
            $worker['primary_trade'] = $primaryCat ?: ($worker['profession'] ?? 'Service Professional');
            $worker['secondary_trades'] = $secondaryCats;
            $worker['extra_categories'] = $secondaryCats;
            if (!empty($district)) {
                $dLow = strtolower(trim($district));
                $workerDistLow = strtolower(trim($worker['district'] ?? ''));
                $workerAddrLow = strtolower(trim($worker['address'] ?? ''));
                $match = ($workerDistLow === $dLow || str_contains($workerAddrLow, $dLow));
                if (!$match && !empty($worker['services'])) {
                    foreach ($worker['services'] as $s) {
                        if (strtolower(trim($s['district'] ?? '')) === $dLow || str_contains(strtolower($s['location'] ?? ''), $dLow)) {
                            $match = true;
                            break;
                        }
                    }
                }
                $worker['is_suggested'] = $match;
                $worker['is_district_match'] = $match;
            }
        }

        return $workers;
    }
}
