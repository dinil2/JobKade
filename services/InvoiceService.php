<?php
// services/InvoiceService.php

require_once __DIR__ . "/../config/Database.php";
require_once __DIR__ . "/../repositories/InvoiceRepository.php";
require_once __DIR__ . "/../repositories/JobRepository.php";
require_once __DIR__ . "/../services/WalletService.php";

class InvoiceService {
    private InvoiceRepository $invoiceRepo;
    private JobRepository $jobRepo;
    private WalletService $walletService;

    public function __construct(
        ?InvoiceRepository $invoiceRepo = null,
        ?JobRepository $jobRepo = null,
        ?WalletService $walletService = null
    ) {
        $this->invoiceRepo = $invoiceRepo ?? new InvoiceRepository();
        $this->jobRepo = $jobRepo ?? new JobRepository();
        $this->walletService = $walletService ?? new WalletService();
    }

    /**
     * Check if a worker is assigned to or applied for a job.
     */
    public function hasJobRelationship(int $workerId, int $jobId, array $job): bool {
        // Direct assignment check on job_requests if column exists
        if (isset($job['assigned_worker_id']) && (int)$job['assigned_worker_id'] === $workerId) {
            return true;
        }
        if (isset($job['worker_id']) && (int)$job['worker_id'] === $workerId) {
            return true;
        }

        // Check against job_applications table
        $db = Database::getConnection();
        $profileId = (new WalletRepository())->resolveProfileId($workerId) ?? $workerId;

        $stmt = $db->prepare("
            SELECT COUNT(*) 
            FROM job_applications 
            WHERE job_id = :job_id 
              AND (worker_id = :wid OR worker_id = :pid)
        ");
        $stmt->execute([
            ':job_id' => $jobId,
            ':wid'    => $workerId,
            ':pid'    => $profileId
        ]);

        return ((int)$stmt->fetchColumn()) > 0;
    }

    /**
     * Worker creates an invoice / adds the price for a customer job.
     */
    public function createInvoice(int $workerId, array $data): array {
        $jobId = (int)($data["job_id"] ?? 0);
        if ($jobId <= 0) {
            throw new InvalidArgumentException("A valid job ID is required.");
        }

        $job = $this->jobRepo->getById($jobId);
        if (!$job) {
            throw new InvalidArgumentException("Job request #{$jobId} not found.");
        }

        $jobAmount = (float)($data["amount"] ?? $data["job_amount"] ?? $data["price"] ?? 0);
        if ($jobAmount <= 0) {
            throw new InvalidArgumentException("Please specify a valid job price greater than 0.");
        }

        if (in_array($job['status'], ['completed', 'cancelled'], true)) {
            throw new InvalidArgumentException("Cannot invoice job #{$jobId} as it is already {$job['status']}.");
        }

        // Verify or auto-establish worker relationship to the job
        $db = Database::getConnection();
        $walletRepo = new WalletRepository();
        $profileId = $walletRepo->resolveProfileId($workerId) ?? $workerId;

        if (!$this->hasJobRelationship($workerId, $jobId, $job)) {
            // In JobKade's direct marketplace model, verified workers can directly service and invoice open customer requests.
            $stmtApp = $db->prepare("
                INSERT INTO job_applications (job_id, worker_id, proposal_note, quote_amount, status)
                VALUES (:job_id, :worker_id, :note, :amount, 'accepted')
                ON DUPLICATE KEY UPDATE status = 'accepted', quote_amount = :amount2
            ");
            $stmtApp->execute([
                ':job_id'    => $jobId,
                ':worker_id' => $profileId,
                ':note'      => !empty($data['notes']) ? trim(strip_tags((string)$data['notes'])) : 'Direct job fulfillment & service invoice',
                ':amount'    => $jobAmount,
                ':amount2'   => $jobAmount
            ]);
        } else {
            // Ensure worker application status is marked accepted
            $db->prepare("
                UPDATE job_applications
                SET status = 'accepted', quote_amount = :amount
                WHERE job_id = :job_id AND (worker_id = :wid OR worker_id = :pid)
            ")->execute([
                ':job_id' => $jobId,
                ':wid'    => $workerId,
                ':pid'    => $profileId,
                ':amount' => $jobAmount
            ]);
        }

        $paymentMethod = strtolower(trim((string)($data["payment_method"] ?? "online")));
        if (!in_array($paymentMethod, ["online", "cash"], true)) {
            $paymentMethod = "online";
        }

        $notes = !empty($data["notes"]) ? trim(strip_tags((string)$data["notes"])) : "Service & labor invoice";
        $customerId = (int)$job["customer_id"];

        // Calculate commission breakdown (5% if subscribed, 10% if standard)
        $breakdown = $this->walletService->calculateBreakdown($workerId, $jobAmount);

        // Check for existing invoice on this job
        $existingInvoice = $this->invoiceRepo->getInvoiceByJobId($jobId);
        if ($existingInvoice && $existingInvoice['payment_status'] === 'paid') {
            throw new InvalidArgumentException("Job #{$jobId} invoice has already been settled and paid.");
        }

        if ($existingInvoice && $existingInvoice['payment_status'] === 'pending' && (int)$existingInvoice['worker_id'] === $workerId) {
            // Update existing pending invoice with latest price and breakdown
            $db->prepare("
                UPDATE job_invoices
                SET job_amount = :amount,
                    commission_rate = :comm_rate,
                    commission_amount = :comm_amount,
                    worker_net_amount = :net_amount,
                    notes = :notes
                WHERE id = :id
            ")->execute([
                ':amount'      => $jobAmount,
                ':comm_rate'   => $breakdown["commission_rate"],
                ':comm_amount' => $breakdown["commission_amount"],
                ':net_amount'  => $breakdown["worker_net_amount"],
                ':notes'       => $notes,
                ':id'          => $existingInvoice['id']
            ]);
            $invoiceId = (int)$existingInvoice['id'];
        } else {
            $invoiceId = $this->invoiceRepo->createInvoice(
                $jobId,
                $workerId,
                $customerId,
                $jobAmount,
                $breakdown["commission_rate"],
                $breakdown["commission_amount"],
                $breakdown["worker_net_amount"],
                $paymentMethod,
                $notes
            );
        }

        $invoice = $this->invoiceRepo->getInvoiceById($invoiceId);

        // Work is finished ("Mark Done & Set Price"), so update job_requests row to status = 'completed'
        $this->jobRepo->updateStatus($jobId, 'completed');

        return [
            "status"     => "success",
            "message"    => "Job invoice created successfully for LKR " . number_format($jobAmount, 2),
            "invoice_id" => $invoiceId,
            "invoice"    => $invoice,
            "breakdown"  => $breakdown
        ];
    }

    /**
     * Customer or Worker pays and settles the invoice.
     */
    public function payInvoice(int $invoiceId, string $paymentMethod, ?int $callerUserId = null, ?string $callerRole = null): array {
        if ($callerUserId !== null) {
            $invoice = $this->invoiceRepo->getInvoiceById($invoiceId);
            if (!$invoice) {
                throw new InvalidArgumentException("Invoice #{$invoiceId} not found.");
            }

            $isCustomer = ((int)$invoice['customer_id'] === $callerUserId);
            $isWorker = (isset($invoice['worker_user_id']) && (int)$invoice['worker_user_id'] === $callerUserId);
            if (!$isWorker) {
                $walletRepo = new WalletRepository();
                $profileId = $walletRepo->resolveProfileId($callerUserId);
                if ($profileId && $profileId === (int)$invoice['worker_id']) {
                    $isWorker = true;
                }
            }
            $isAdmin = ($callerRole === 'admin');

            if (!$isCustomer && !$isWorker && !$isAdmin) {
                throw new InvalidArgumentException("You are not authorized to settle this invoice.");
            }
        }

        return $this->walletService->settleInvoice($invoiceId, $paymentMethod);
    }

    public function getInvoice(int $invoiceId): ?array {
        return $this->invoiceRepo->getInvoiceById($invoiceId);
    }

    public function getJobInvoice(int $jobId): ?array {
        return $this->invoiceRepo->getInvoiceByJobId($jobId);
    }

    public function getWorkerInvoices(int $workerId): array {
        return $this->invoiceRepo->getInvoicesByWorker($workerId);
    }

    public function getCustomerInvoices(int $customerId): array {
        return $this->invoiceRepo->getInvoicesByCustomer($customerId);
    }
}

