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
            throw new InvalidArgumentException("Job title must be 3 to 150 characters.");
        }

        if (empty($description) || strlen($description) < 10 || strlen($description) > 3000) {
            throw new InvalidArgumentException("Job description must be 10 to 3000 characters.");
        }

        if ($categoryId <= 0) {
            throw new InvalidArgumentException("Select a valid service category.");
        }

        if (empty($address) || strlen($address) < 2 || strlen($address) > 255) {
            throw new InvalidArgumentException("Enter a valid location.");
        }

        $latRaw = $data['latitude'] ?? $data['lat'] ?? 6.9271;
        $lngRaw = $data['longitude'] ?? $data['lng'] ?? 79.8612;

        if (!is_numeric($latRaw) || !is_numeric($lngRaw)) {
            throw new InvalidArgumentException("Coordinates are required.");
        }

        $lat = (float)$latRaw;
        $lng = (float)$lngRaw;

        if ($lat < -90.0 || $lat > 90.0 || $lng < -180.0 || $lng > 180.0) {
            throw new InvalidArgumentException("Coordinates are out of range.");
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
            throw new InvalidArgumentException("Enter a valid quote amount.");
        }

        $appId = $this->jobRepo->applyForJob($jobId, $workerId, $note, $amount);
        return [
            'status' => 'success',
            'message' => 'Application submitted to customer!',
            'application_id' => $appId
        ];
    }

    public function takeJob(int $jobId, int $workerId): array {
        if ($jobId <= 0) {
            throw new InvalidArgumentException("Invalid job ID.");
        }
        if ($workerId <= 0) {
            throw new InvalidArgumentException("Invalid worker ID.");
        }

        require_once __DIR__ . '/../repositories/WalletRepository.php';
        $walletRepo = new WalletRepository();
        $profileId = $walletRepo->resolveProfileId($workerId) ?? $workerId;

        // Check if worker has job access
        if (!$walletRepo->hasJobAccess($profileId)) {
            throw new Exception("You must have active marketplace access (Rs. 1,000 access fee or active subscription) to take jobs.");
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $stmt = $db->prepare("SELECT id, status, worker_id, customer_id, title FROM job_requests WHERE id = :id FOR UPDATE");
            $stmt->execute([':id' => $jobId]);
            $job = $stmt->fetch();

            if (!$job) {
                $db->rollBack();
                throw new Exception("Job not found.");
            }

            if ($job['status'] !== 'open' || !empty($job['worker_id'])) {
                $db->rollBack();
                throw new Exception("This job was just taken.");
            }

            $update = $db->prepare("
                UPDATE job_requests 
                SET worker_id = :worker_id, status = 'in_progress', updated_at = NOW() 
                WHERE id = :id
            ");
            $update->execute([
                ':worker_id' => $profileId,
                ':id'        => $jobId
            ]);

            $db->commit();

            try {
                require_once __DIR__ . '/NotificationService.php';
                $workerRepo = new WorkerRepository();
                $wProfile = $workerRepo->getProfileById($profileId);
                $workerName = $wProfile['full_name'] ?? 'A verified worker';
                (new NotificationService())->createNotification(
                    (int)$job['customer_id'],
                    "Worker Assigned",
                    "{$workerName} has taken your job '{$job['title']}'.",
                    "job"
                );
            } catch (Exception $e) {}

            return [
                'status'  => 'success',
                'message' => 'Job successfully assigned to you!'
            ];
        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    public function confirmArrival(int $jobId, int $customerId): array {
        if ($jobId <= 0 || $customerId <= 0) {
            throw new InvalidArgumentException("Invalid job or customer ID.");
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM job_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $jobId]);
        $job = $stmt->fetch();

        if (!$job) {
            throw new InvalidArgumentException("Job request not found.");
        }

        if ((int)$job['customer_id'] !== $customerId) {
            throw new Exception("Unauthorized: You are not the owner of this job request.");
        }

        if ($job['status'] !== 'in_progress') {
            throw new Exception("Arrival can only be confirmed for jobs in progress.");
        }

        if (empty($job['worker_id'])) {
            throw new Exception("No worker is assigned to this job.");
        }

        if (!empty($job['arrived_at'])) {
            return [
                'status'     => 'success',
                'message'    => 'Arrival already confirmed.',
                'arrived_at' => $job['arrived_at']
            ];
        }

        $now = date('Y-m-d H:i:s');
        $up = $db->prepare("UPDATE job_requests SET arrived_at = :arrived_at, updated_at = NOW() WHERE id = :id");
        $up->execute([':arrived_at' => $now, ':id' => $jobId]);

        try {
            require_once __DIR__ . '/NotificationService.php';
            $workerRepo = new WorkerRepository();
            $wProfile = $workerRepo->getProfileById((int)$job['worker_id']);
            if ($wProfile && !empty($wProfile['user_id'])) {
                (new NotificationService())->createNotification(
                    (int)$wProfile['user_id'],
                    "Arrival Confirmed",
                    "Customer confirmed your arrival for '{$job['title']}'. The work timer has started!",
                    "job"
                );
            }
        } catch (Exception $e) {}

        return [
            'status'     => 'success',
            'message'    => 'Worker arrival confirmed! Work timer started.',
            'arrived_at' => $now
        ];
    }

    public function cancelAssignment(int $jobId, int $customerId): array {
        if ($jobId <= 0 || $customerId <= 0) {
            throw new InvalidArgumentException("Invalid job or customer ID.");
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM job_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $jobId]);
        $job = $stmt->fetch();

        if (!$job) {
            throw new InvalidArgumentException("Job request not found.");
        }

        if ((int)$job['customer_id'] !== $customerId) {
            throw new Exception("Unauthorized: You are not the owner of this job request.");
        }

        if ($job['status'] !== 'in_progress') {
            throw new Exception("Assignment can only be cancelled for in-progress jobs.");
        }

        if (!empty($job['arrived_at'])) {
            throw new Exception("Cancellation is disabled after worker arrival has been confirmed.");
        }

        $oldWorkerId = (int)$job['worker_id'];

        $up = $db->prepare("
            UPDATE job_requests 
            SET worker_id = NULL, status = 'open', arrived_at = NULL, updated_at = NOW() 
            WHERE id = :id
        ");
        $up->execute([':id' => $jobId]);

        try {
            require_once __DIR__ . '/NotificationService.php';
            $workerRepo = new WorkerRepository();
            $wProfile = $workerRepo->getProfileById($oldWorkerId);
            if ($wProfile && !empty($wProfile['user_id'])) {
                (new NotificationService())->createNotification(
                    (int)$wProfile['user_id'],
                    "Assignment Cancelled",
                    "Customer cancelled assignment for '{$job['title']}'. The job is back in Available Jobs.",
                    "job"
                );
            }
        } catch (Exception $e) {}

        return [
            'status'  => 'success',
            'message' => 'Worker assignment cancelled. The job is back in Available Jobs.'
        ];
    }

    public function completeHourlyJob(int $jobId, int $workerId): array {
        if ($jobId <= 0 || $workerId <= 0) {
            throw new InvalidArgumentException("Invalid job or worker ID.");
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT * FROM job_requests WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $jobId]);
        $job = $stmt->fetch();

        if (!$job) {
            throw new InvalidArgumentException("Job request not found.");
        }

        require_once __DIR__ . '/../repositories/WalletRepository.php';
        require_once __DIR__ . '/../repositories/WorkerRepository.php';
        require_once __DIR__ . '/../repositories/InvoiceRepository.php';
        require_once __DIR__ . '/WalletService.php';

        $walletRepo = new WalletRepository();
        $profileId = $walletRepo->resolveProfileId($workerId) ?? $workerId;

        if ((int)$job['worker_id'] !== $profileId && (int)$job['worker_id'] !== $workerId) {
            throw new Exception("Unauthorized: You are not the assigned worker for this job.");
        }

        if ($job['status'] !== 'in_progress') {
            throw new Exception("Only in-progress jobs can be completed.");
        }

        if (empty($job['arrived_at'])) {
            throw new Exception("Cannot mark job done before the customer confirms your arrival.");
        }

        $workerRepo = new WorkerRepository();
        $workerProfile = $workerRepo->getProfileById($profileId);
        if (!$workerProfile) {
            throw new Exception("Worker profile not found.");
        }

        $hourlyRate = (float)($workerProfile['hourly_rate'] ?? 1000.00);
        $travellingFee = (float)($workerProfile['travelling_fee'] ?? 0.00);

        $completedAt = date('Y-m-d H:i:s');
        $arrivedTimestamp = strtotime($job['arrived_at']);
        $completedTimestamp = strtotime($completedAt);

        $elapsedSeconds = max(0, $completedTimestamp - $arrivedTimestamp);
        $elapsedMinutes = $elapsedSeconds / 60.0;

        // round UP to nearest 15 minutes -> minimum 60 minutes
        $roundedMinutes = ceil($elapsedMinutes / 15.0) * 15;
        $billableMinutes = (int)max(60, $roundedMinutes);
        $hoursWorked = round($billableMinutes / 60.0, 2);

        // Price = (billable minutes / 60) x worker's hourly rate + worker's travelling fee
        $laborPrice = round(($billableMinutes / 60.0) * $hourlyRate, 2);
        $jobAmount = round($laborPrice + $travellingFee, 2);

        $walletService = new WalletService();
        $breakdown = $walletService->calculateBreakdown($profileId, $jobAmount);

        $customerId = (int)$job['customer_id'];
        $notes = "Hourly service: {$hoursWorked} hrs @ Rs. " . number_format($hourlyRate, 2) . "/hr + Travelling fee: Rs. " . number_format($travellingFee, 2);

        $invoiceRepo = new InvoiceRepository();
        $existingInvoice = $invoiceRepo->getInvoiceByJobId($jobId);
        if ($existingInvoice && $existingInvoice['payment_status'] === 'paid') {
            throw new Exception("Invoice for job #{$jobId} is already paid.");
        }

        if ($existingInvoice) {
            $db->prepare("
                UPDATE job_invoices
                SET job_amount = :amount,
                    hours_worked = :hours_worked,
                    travelling_fee = :travelling_fee,
                    commission_rate = :comm_rate,
                    commission_amount = :comm_amount,
                    worker_net_amount = :net_amount,
                    notes = :notes
                WHERE id = :id
            ")->execute([
                ':amount'         => $jobAmount,
                ':hours_worked'   => $hoursWorked,
                ':travelling_fee' => $travellingFee,
                ':comm_rate'      => $breakdown['commission_rate'],
                ':comm_amount'    => $breakdown['commission_amount'],
                ':net_amount'     => $breakdown['worker_net_amount'],
                ':notes'          => $notes,
                ':id'             => $existingInvoice['id']
            ]);
            $invoiceId = (int)$existingInvoice['id'];
        } else {
            $invoiceId = $invoiceRepo->createInvoice(
                $jobId,
                $profileId,
                $customerId,
                $jobAmount,
                $breakdown['commission_rate'],
                $breakdown['commission_amount'],
                $breakdown['worker_net_amount'],
                'online',
                $notes,
                $hoursWorked,
                $travellingFee
            );
        }

        // Set completed_at and status = 'completed'
        $db->prepare("
            UPDATE job_requests 
            SET completed_at = :completed_at, status = 'completed', updated_at = NOW() 
            WHERE id = :id
        ")->execute([
            ':completed_at' => $completedAt,
            ':id'           => $jobId
        ]);

        try {
            require_once __DIR__ . '/NotificationService.php';
            (new NotificationService())->createNotification(
                $customerId,
                "Job Completed",
                "Work on '{$job['title']}' is finished! Total amount: Rs. " . number_format($jobAmount, 2),
                "invoice"
            );
        } catch (Exception $e) {}

        $invoice = $invoiceRepo->getInvoiceById($invoiceId);

        return [
            'status'         => 'success',
            'message'        => 'Job marked as complete and invoice created.',
            'invoice_id'     => $invoiceId,
            'job_id'         => $jobId,
            'hours_worked'   => $hoursWorked,
            'hourly_rate'    => $hourlyRate,
            'travelling_fee' => $travellingFee,
            'job_amount'     => $jobAmount,
            'invoice'        => $invoice,
            'breakdown'      => $breakdown
        ];
    }
}
