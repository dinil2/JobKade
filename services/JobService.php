<?php
// services/JobService.php

require_once __DIR__ . '/../repositories/JobRepository.php';

class JobService {
    private JobRepository $jobRepo;

    public function __construct() {
        $this->jobRepo = new JobRepository();
    }

    public function postJob(int $customerId, array $data): array {
        if ($customerId <= 0) {
            throw new InvalidArgumentException("Invalid customer ID.");
        }

        $title = trim(strip_tags((string)($data['title'] ?? '')));
        $description = trim(strip_tags((string)($data['description'] ?? '')));
        $categoryId = (int)($data['category_id'] ?? 0);
        $address = trim(strip_tags((string)($data['address'] ?? 'Colombo')));
        $photo = $data['photo_path'] ?? null;

        if (empty($title) || strlen($title) < 3 || strlen($title) > 150) {
            throw new InvalidArgumentException("Job title is required and must be between 3 and 150 characters.");
        }

        if (empty($description) || strlen($description) < 10 || strlen($description) > 3000) {
            throw new InvalidArgumentException("Job description must be between 10 and 3,000 characters.");
        }

        if ($categoryId <= 0) {
            throw new InvalidArgumentException("Please select a valid service category.");
        }

        if (empty($address) || strlen($address) < 2 || strlen($address) > 255) {
            throw new InvalidArgumentException("Please provide a valid location/address (2-255 characters).");
        }

        $latRaw = $data['latitude'] ?? $data['lat'] ?? 6.9271;
        $lngRaw = $data['longitude'] ?? $data['lng'] ?? 79.8612;

        if (!is_numeric($latRaw) || !is_numeric($lngRaw)) {
            throw new InvalidArgumentException("Valid geographic coordinates (latitude and longitude) are required.");
        }

        $lat = (float)$latRaw;
        $lng = (float)$lngRaw;

        if ($lat < -90.0 || $lat > 90.0 || $lng < -180.0 || $lng > 180.0) {
            throw new InvalidArgumentException("Geographic coordinates are out of valid range.");
        }

        $district = trim(strip_tags((string)($data['district'] ?? 'Colombo')));
        if (empty($district)) {
            $district = 'Colombo';
        }

        $jobId = $this->jobRepo->create($customerId, $categoryId, $title, $description, $lat, $lng, $address, $photo, $district);

        return [
            'status'  => 'success',
            'message' => 'Job request posted successfully!',
            'job_id'  => $jobId
        ];
    }

    public function getOpenJobs(?int $categoryId = null, ?string $district = null): array {
        return $this->jobRepo->getOpenJobs($categoryId, $district);
    }

    public function getWorkerJobs(int $workerId): array {
        return $this->jobRepo->getWorkerJobs($workerId);
    }

    public function getCustomerJobs(int $customerId): array {
        return $this->jobRepo->getCustomerJobs($customerId);
    }

    public function getJobDetails(int $jobId): ?array {
        $job = $this->jobRepo->getById($jobId);
        if ($job) {
            $job['applications'] = $this->jobRepo->getJobApplications($jobId);
        }
        return $job;
    }

    public function apply(int $jobId, int $workerId, array $data): array {
        $note = trim($data['proposal_note'] ?? '');
        $amount = (float)($data['quote_amount'] ?? 0);

        if ($amount <= 0) {
            throw new InvalidArgumentException("Please specify a valid quote amount.");
        }

        $appId = $this->jobRepo->applyForJob($jobId, $workerId, $note, $amount);
        return [
            'status' => 'success',
            'message' => 'Application submitted to customer!',
            'application_id' => $appId
        ];
    }
}
