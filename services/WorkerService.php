<?php
// services/WorkerService.php

require_once __DIR__ . '/../repositories/WorkerRepository.php';

class WorkerService {
    private WorkerRepository $workerRepo;

    public function __construct() {
        $this->workerRepo = new WorkerRepository();
    }

    public function search(array $params): array {
        $lat = isset($params['lat']) ? (float)$params['lat'] : null;
        $lng = isset($params['lng']) ? (float)$params['lng'] : null;
        $catId = isset($params['category_id']) && $params['category_id'] !== '' ? (int)$params['category_id'] : null;

        return $this->workerRepo->searchWorkers($lat, $lng, $catId);
    }

    public function getProfile(int $workerId): ?array {
        return $this->workerRepo->getProfileById($workerId);
    }

    public function updateProfile(int $workerId, array $data): bool {
        if ($workerId <= 0) {
            throw new InvalidArgumentException("Invalid worker ID.");
        }

        if (isset($data['bio'])) {
            $bio = trim(strip_tags((string)$data['bio']));
            if (strlen($bio) > 2000) {
                throw new InvalidArgumentException("Bio cannot exceed 2000 characters.");
            }
            $data['bio'] = $bio;
        }

        if (isset($data['service_radius_km'])) {
            if (!is_numeric($data['service_radius_km'])) {
                throw new InvalidArgumentException("Service radius must be a valid number.");
            }
            $radius = (int)$data['service_radius_km'];
            if ($radius < 1 || $radius > 150) {
                throw new InvalidArgumentException("Service radius must be between 1 and 150 km.");
            }
            $data['service_radius_km'] = $radius;
        }

        if (isset($data['full_name'])) {
            $fullName = trim(strip_tags((string)$data['full_name']));
            if (empty($fullName) || strlen($fullName) < 2 || strlen($fullName) > 100) {
                throw new InvalidArgumentException("Full name must be between 2 and 100 characters.");
            }
            $data['full_name'] = $fullName;
        }

        if (isset($data['phone'])) {
            $phone = trim(strip_tags((string)$data['phone']));
            if (!empty($phone) && !preg_match('/^[0-9+\s-]{9,15}$/', $phone)) {
                throw new InvalidArgumentException("Please provide a valid phone number (9-15 digits).");
            }
            $data['phone'] = $phone;
        }

        if (isset($data['address'])) {
            $data['address'] = trim(strip_tags((string)$data['address']));
            if (strlen($data['address']) > 255) {
                throw new InvalidArgumentException("Address cannot exceed 255 characters.");
            }
        }

        return $this->workerRepo->updateProfile($workerId, $data);
    }

    public function updateVerificationStatus(int $workerId, string $status): bool {
        $allowed = ['unverified', 'pending', 'verified', 'rejected'];
        if (!in_array($status, $allowed, true)) {
            throw new InvalidArgumentException("Invalid verification status: $status");
        }
        return $this->workerRepo->updateVerificationStatus($workerId, $status);
    }

    public function setVerified(int $workerId, bool $isVerified): bool {
        return $this->workerRepo->setVerified($workerId, $isVerified);
    }

    public function addCustomService(int $workerId, array $data): array {
        require_once __DIR__ . '/../repositories/WorkerServiceRepository.php';
        $serviceRepo = new WorkerServiceRepository();

        $title = trim(strip_tags((string)($data['title'] ?? $data['service-title'] ?? '')));
        if (empty($title) || strlen($title) < 3) {
            throw new InvalidArgumentException("Service title is required (at least 3 characters).");
        }

        $description = trim(strip_tags((string)($data['description'] ?? '')));
        if (empty($description)) {
            $description = $title;
        }

        $price = (float)($data['price'] ?? 1500.00);
        if ($price < 100) {
            throw new InvalidArgumentException("Price must be at least Rs. 100.");
        }

        $pricingType = strtolower((string)($data['pricing_type'] ?? 'hourly'));
        if (!in_array($pricingType, ['hourly', 'fixed', 'starting_at'], true)) {
            $pricingType = 'hourly';
        }

        $catId = !empty($data['category_id']) ? (int)$data['category_id'] : null;
        $location = trim(strip_tags((string)($data['location'] ?? 'Colombo')));
        $images = isset($data['images']) ? (is_array($data['images']) ? json_encode($data['images']) : (string)$data['images']) : null;

        $profile = $this->workerRepo->findByUserId($workerId);
        $profileId = $profile ? (int)$profile['id'] : $workerId;

        $serviceId = $serviceRepo->create($profileId, $catId, $title, $description, $price, $pricingType, $location, $images);
        return [
            'status'     => 'success',
            'message'    => 'Service created successfully.',
            'service_id' => $serviceId
        ];
    }

    public function getMyServices(int $workerId): array {
        require_once __DIR__ . '/../repositories/WorkerServiceRepository.php';
        $serviceRepo = new WorkerServiceRepository();
        $profile = $this->workerRepo->findByUserId($workerId);
        $profileId = $profile ? (int)$profile['id'] : $workerId;
        return [
            'status' => 'success',
            'services' => $serviceRepo->getByWorker($profileId)
        ];
    }

    public function deleteCustomService(int $serviceId, int $workerId): bool {
        require_once __DIR__ . '/../repositories/WorkerServiceRepository.php';
        $serviceRepo = new WorkerServiceRepository();
        $profile = $this->workerRepo->findByUserId($workerId);
        $profileId = $profile ? (int)$profile['id'] : $workerId;
        return $serviceRepo->delete($serviceId, $profileId);
    }
}
