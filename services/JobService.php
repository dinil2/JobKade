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

        $district = trim(strip_tags((string)($data['district'] ?? '')));
        if (empty($district)) {
            throw new InvalidArgumentException("Job district is required.");
        }

        $city = trim(strip_tags((string)($data['city'] ?? '')));
        if (empty($city)) {
            throw new InvalidArgumentException("Job city is required.");
        }

        $preferredDateRaw = trim(strip_tags((string)($data['preferred_date'] ?? $data['preferred-date'] ?? '')));
        $startTimeRaw = trim(strip_tags((string)($data['start_time'] ?? $data['start-time'] ?? '')));
        $endTimeRaw = trim(strip_tags((string)($data['end_time'] ?? $data['end-time'] ?? '')));

        if (empty($preferredDateRaw)) {
            throw new InvalidArgumentException("Preferred date is required.");
        }
        if (empty($startTimeRaw)) {
            throw new InvalidArgumentException("Start time is required.");
        }
        if (empty($endTimeRaw)) {
            throw new InvalidArgumentException("End time is required.");
        }

        $d = DateTime::createFromFormat('Y-m-d', $preferredDateRaw);
        if (!$d || $d->format('Y-m-d') !== $preferredDateRaw) {
            throw new InvalidArgumentException("Invalid preferred date format. Expected YYYY-MM-DD.");
        }

        $today = date('Y-m-d');
        if ($preferredDateRaw < $today) {
            throw new InvalidArgumentException("Preferred date cannot be in the past.");
        }

        $t1 = strtotime("1970-01-01 " . $startTimeRaw);
        $t2 = strtotime("1970-01-01 " . $endTimeRaw);
        if ($t1 === false) {
            throw new InvalidArgumentException("Invalid start time format.");
        }
        if ($t2 === false) {
            throw new InvalidArgumentException("Invalid end time format.");
        }
        if ($t2 <= $t1) {
            throw new InvalidArgumentException("End time must be after start time.");
        }

        $preferredDate = $d->format('Y-m-d');
        $startTime = date('H:i:s', $t1);
        $endTime = date('H:i:s', $t2);

        $jobId = $this->jobRepo->create(
            $customerId,
            $categoryId,
            $title,
            $description,
            $lat,
            $lng,
            $address,
            $photo,
            $district,
            $city,
            $preferredDate,
            $startTime,
            $endTime
        );

        return [
            'status'  => 'success',
            'message' => 'Job request posted successfully!',
            'job_id'  => $jobId
        ];
    }

    public function getOpenJobs(?int $categoryId = null, ?string $district = null, ?int $workerProfileId = null): array {
        return $this->jobRepo->getOpenJobs($categoryId, $district, $workerProfileId);
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

            // Send email to customer via EmailService
            try {
                require_once __DIR__ . '/EmailService.php';
                require_once __DIR__ . '/../repositories/UserRepository.php';
                require_once __DIR__ . '/../repositories/WorkerRepository.php';

                $userRepo = new UserRepository();
                $custUser = $userRepo->findById((int)$job['customer_id']);
                $custEmail = !empty($custUser['email']) ? $custUser['email'] : '';
                $custName = !empty($custUser['full_name']) ? $custUser['full_name'] : 'Customer';

                $workerRepo = new WorkerRepository();
                $wProfile = $workerRepo->getProfileById($profileId);
                $workerName = !empty($wProfile['full_name']) ? $wProfile['full_name'] : 'A verified worker';

                // Determine worker's hourly rate for that job's category
                $jobCategoryId = (int)($job['category_id'] ?? 0);
                $appliedRate = null;
                if ($jobCategoryId > 0) {
                    $srvStmt = $db->prepare("
                        SELECT price FROM worker_services 
                        WHERE worker_id = :wid 
                          AND category_id = :cid 
                          AND pricing_type = 'hourly' 
                        ORDER BY id DESC LIMIT 1
                    ");
                    $srvStmt->execute([':wid' => $profileId, ':cid' => $jobCategoryId]);
                    $srvPrice = $srvStmt->fetchColumn();
                    if ($srvPrice !== false && (float)$srvPrice > 0) {
                        $appliedRate = (float)$srvPrice;
                    }
                }
                if ($appliedRate === null || $appliedRate <= 0) {
                    $appliedRate = (float)($wProfile['hourly_rate'] ?? 1000.00);
                }

                $rateFormatted = ($appliedRate == floor($appliedRate)) ? number_format($appliedRate) : number_format($appliedRate, 2);

                if (!empty($custEmail)) {
                    $subject = "JobKade: Your job has been taken";
                    $htmlBody = "
                        <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                            <h2 style=\"color: #0284c7; margin-top: 0;\">Good News! Your Job Has Been Taken</h2>
                            <p>Hi " . htmlspecialchars($custName) . ",</p>
                            <p>A skilled worker has accepted your job request on JobKade.</p>
                            <div style=\"background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; margin: 16px 0;\">
                                <p style=\"margin: 6px 0;\"><strong>Job Title:</strong> " . htmlspecialchars($job['title']) . "</p>
                                <p style=\"margin: 6px 0;\"><strong>Assigned Worker:</strong> " . htmlspecialchars($workerName) . "</p>
                                <p style=\"margin: 6px 0;\"><strong>Hourly Rate:</strong> Rs. {$rateFormatted}/hr</p>
                            </div>
                            <p>The worker is on their way. When the worker arrives, tap <strong>'Worker is Here'</strong> on your dashboard to begin the work timer.</p>
                            <div style=\"margin: 25px 0;\">
                                <a href=\"http://localhost:81/JobKade/customer/jobs.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">View Job on Dashboard</a>
                            </div>
                            <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                            <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                        </div>
                    ";
                    (new EmailService())->send($custEmail, $custName, $subject, $htmlBody);
                }
            } catch (Throwable $e) {
                error_log("Failed to send job-taken email to customer: " . $e->getMessage());
            }

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

        $jobCategoryId = (int)($job['category_id'] ?? 0);
        $hourlyRate = null;
        $appliedCategoryName = null;

        if ($jobCategoryId > 0) {
            $srvStmt = $db->prepare("
                SELECT ws.price, COALESCE(c.name, ws.title) AS category_name
                FROM worker_services ws
                LEFT JOIN categories c ON ws.category_id = c.id
                WHERE ws.worker_id = :wid 
                  AND ws.category_id = :cid 
                  AND ws.pricing_type = 'hourly'
                ORDER BY ws.id DESC
                LIMIT 1
            ");
            $srvStmt->execute([':wid' => $profileId, ':cid' => $jobCategoryId]);
            $matchedSrv = $srvStmt->fetch(PDO::FETCH_ASSOC);
            if ($matchedSrv && isset($matchedSrv['price']) && (float)$matchedSrv['price'] > 0) {
                $hourlyRate = (float)$matchedSrv['price'];
                $appliedCategoryName = $matchedSrv['category_name'];
            }
        }

        // Fall back to profile-level hourly_rate if worker has no service in that category
        if ($hourlyRate === null || $hourlyRate <= 0) {
            $hourlyRate = (float)($workerProfile['hourly_rate'] ?? 1000.00);
            if ($jobCategoryId > 0) {
                $cStmt = $db->prepare("SELECT name FROM categories WHERE id = :cid LIMIT 1");
                $cStmt->execute([':cid' => $jobCategoryId]);
                $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
                if ($cRow && !empty($cRow['name'])) {
                    $appliedCategoryName = $cRow['name'];
                }
            }
        }

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
        $rateFormatted = ($hourlyRate == floor($hourlyRate)) ? number_format($hourlyRate) : number_format($hourlyRate, 2);
        $rateNote = "{$hoursWorked} hrs @ Rs. {$rateFormatted}/hr" . ($appliedCategoryName ? " ({$appliedCategoryName})" : "");
        $notes = $travellingFee > 0 ? "{$rateNote} + Travelling fee: Rs. " . number_format($travellingFee, 2) : $rateNote;

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

        // Dispatch invoice created email to customer
        try {
            require_once __DIR__ . '/EmailService.php';
            require_once __DIR__ . '/../repositories/UserRepository.php';
            $custUser = (new UserRepository())->findById($customerId);
            $custEmail = !empty($custUser['email']) ? $custUser['email'] : '';
            $custName = !empty($custUser['full_name']) ? $custUser['full_name'] : 'Customer';

            if (!empty($custEmail)) {
                $workerName = !empty($workerProfile['full_name']) ? $workerProfile['full_name'] : 'Your assigned worker';
                $formattedTotal = number_format($jobAmount, 2);
                $formattedRate = ($hourlyRate == floor($hourlyRate)) ? number_format($hourlyRate) : number_format($hourlyRate, 2);
                $subject = "JobKade: Invoice Created for Job #{$jobId}";
                $htmlBody = "
                    <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                        <h2 style=\"color: #0284c7; margin-top: 0;\">Work Completed &amp; Invoice Created</h2>
                        <p>Hi " . htmlspecialchars($custName) . ",</p>
                        <p>Work on your job <strong>" . htmlspecialchars($job['title']) . "</strong> has been marked as completed by " . htmlspecialchars($workerName) . ".</p>
                        <div style=\"background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; margin: 16px 0;\">
                            <p style=\"margin: 4px 0;\"><strong>Invoice #:</strong> {$invoiceId}</p>
                            <p style=\"margin: 4px 0;\"><strong>Hours Billed:</strong> {$hoursWorked} hrs</p>
                            <p style=\"margin: 4px 0;\"><strong>Hourly Rate:</strong> Rs. {$formattedRate}/hr" . ($appliedCategoryName ? " (" . htmlspecialchars($appliedCategoryName) . ")" : "") . "</p>
                            " . ($travellingFee > 0 ? "<p style=\"margin: 4px 0;\"><strong>Travelling Fee:</strong> Rs. " . number_format($travellingFee, 2) . "</p>" : "") . "
                            <hr style=\"border: 0; border-top: 1px dashed #cbd5e1; margin: 8px 0;\" />
                            <p style=\"margin: 4px 0; font-size: 16px;\"><strong>Total Amount Due:</strong> <span style=\"color: #0284c7;\">Rs. {$formattedTotal}</span></p>
                        </div>
                        <p>Please review and complete your payment on your dashboard.</p>
                        <div style=\"margin: 25px 0;\">
                            <a href=\"http://localhost:81/JobKade/customer/jobs.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">View and Pay Invoice</a>
                        </div>
                        <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                        <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                    </div>
                ";
                (new EmailService())->send($custEmail, $custName, $subject, $htmlBody);
            }
        } catch (Throwable $e) {
            error_log("Failed to send invoice-created email to customer: " . $e->getMessage());
        }

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
