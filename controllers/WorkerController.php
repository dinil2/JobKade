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
        unset($profile['hourly_rate']);
        sendJsonResponse(200, ['status' => 'success', 'worker' => $profile]);
    }

    public function updateProfile(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Forbidden. Only workers can update their profile.']);
        }

        $data = getRequestData();
        unset($data['hourly_rate']);
        try {
            $this->workerService->updateProfile((int)$user['worker_id'], $data);
            sendJsonResponse(200, ['status' => 'success', 'message' => 'Profile updated successfully!']);
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
        sendJsonResponse(200, ['status' => 'success', 'services' => $list]);
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
