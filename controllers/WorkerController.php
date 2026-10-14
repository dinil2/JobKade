<?php
// controllers/WorkerController.php

require_once __DIR__ . '/../services/WorkerService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class WorkerController {
    private WorkerService $workerService;

    public function __construct() {
        $this->workerService = new WorkerService();
    }

    public function search(): void {
        $params = $_GET;
        $workers = $this->workerService->search($params);
        sendJsonResponse(200, [
            'status' => 'success',
            'count'  => count($workers),
            'workers'=> $workers
        ]);
    }

    public function getProfile(int $workerId): void {
        $profile = $this->workerService->getProfile($workerId);
        if (!$profile) {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Worker profile not found.']);
        }
        sendJsonResponse(200, ['status' => 'success', 'worker' => $profile]);
    }

    public function updateProfile(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Forbidden. Only workers can update their profile.']);
        }
        $workerId = (int)(!empty($user['worker_id']) ? $user['worker_id'] : 0);
        if ($workerId <= 0) {
            $profile = (new WorkerRepository())->getProfileByUserId((int)$user['user_id']);
            $workerId = $profile ? (int)$profile['id'] : 0;
        }
        if ($workerId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Worker profile not found.']);
        }

        $data = getRequestData();
        try {
            $this->workerService->updateProfile($workerId, $data);
            sendJsonResponse(200, ['status' => 'success', 'message' => 'Profile updated successfully!']);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function getCoverage(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Forbidden. Only workers can view coverage.']);
        }
        $workerId = (int)(!empty($user['worker_id']) ? $user['worker_id'] : 0);
        if ($workerId <= 0) {
            $profile = (new WorkerRepository())->getProfileByUserId((int)$user['user_id']);
            $workerId = $profile ? (int)$profile['id'] : 0;
        }
        $coverage = $this->workerService->getWorkerCoverage($workerId);
        sendJsonResponse(200, ['status' => 'success', 'coverage' => $coverage]);
    }

    public function updateCoverage(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Forbidden. Only workers can update coverage.']);
        }
        $workerId = (int)(!empty($user['worker_id']) ? $user['worker_id'] : 0);
        if ($workerId <= 0) {
            $profile = (new WorkerRepository())->getProfileByUserId((int)$user['user_id']);
            $workerId = $profile ? (int)$profile['id'] : 0;
        }
        if ($workerId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Worker profile not found.']);
        }

        $data = getRequestData();
        $district = trim((string)($data['district'] ?? ''));
        $coverAll = !empty($data['cover_all_cities']) || (!empty($data['coverage_mode']) && $data['coverage_mode'] === 'all');
        $cities = $data['cities'] ?? ($data['coverage_cities'] ?? []);
        if (is_string($cities)) {
            $decoded = json_decode($cities, true);
            $cities = is_array($decoded) ? $decoded : array_filter(array_map('trim', explode(',', $cities)));
        }
        if (!is_array($cities)) {
            $cities = [];
        }

        try {
            $this->workerService->setWorkerCoverage($workerId, $district, $cities, $coverAll);
            sendJsonResponse(200, ['status' => 'success', 'message' => 'Coverage updated successfully!']);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function addService(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can add service listings.']);
        }

        $data = getRequestData();
        try {
            $res = $this->workerService->addCustomService((int)$user['worker_id'], $data);
            sendJsonResponse(201, $res);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function myServices(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can view their services.']);
        }

        $list = $this->workerService->getMyServices((int)$user['worker_id']);
        $services = isset($list['services']) ? $list['services'] : $list;
        sendJsonResponse(200, ['status' => 'success', 'services' => $services]);
    }

    public function deleteService(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can delete their services.']);
        }

        $data = getRequestData();
        $serviceId = (int)($data['service_id'] ?? $_GET['id'] ?? 0);
        if ($serviceId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid service_id is required.']);
        }

        $success = $this->workerService->deleteCustomService($serviceId, (int)$user['worker_id']);
        if ($success) {
            sendJsonResponse(200, ['status' => 'success', 'message' => 'Service deleted successfully.']);
        } else {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Service not found or already deleted.']);
        }
    }
}
