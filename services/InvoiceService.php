<?php
// services/InvoiceService.php

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

        $paymentMethod = strtolower(trim((string)($data["payment_method"] ?? "online")));
        if (!in_array($paymentMethod, ["online", "cash"], true)) {
            $paymentMethod = "online";
        }

        $notes = !empty($data["notes"]) ? trim(strip_tags((string)$data["notes"])) : "Service & labor invoice";
        $customerId = (int)$job["customer_id"];

        // Calculate commission breakdown (5% if subscribed, 10% if standard)
        $breakdown = $this->walletService->calculateBreakdown($workerId, $jobAmount);

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

        $invoice = $this->invoiceRepo->getInvoiceById($invoiceId);

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
    public function payInvoice(int $invoiceId, string $paymentMethod): array {
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

