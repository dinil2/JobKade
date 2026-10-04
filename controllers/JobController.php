<?php
// controllers/JobController.php

require_once __DIR__ . '/../services/JobService.php';
require_once __DIR__ . '/../services/InvoiceService.php';
require_once __DIR__ . '/../services/WalletService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class JobController {
    private JobService $jobService;
    private InvoiceService $invoiceService;
    private WalletService $walletService;

    public function __construct() {
        $this->jobService = new JobService();
        $this->invoiceService = new InvoiceService();
        $this->walletService = new WalletService();
    }

    public function create(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Please sign in to post a job request.']);
        }

        $data = getRequestData();
        try {
            $res = $this->jobService->postJob((int)$user['user_id'], $data);
            sendJsonResponse(201, $res);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function listOpen(): void {
        $user = JWT::getAuthUser();
        $hasAccess = true;
        if ($user && $user['role'] === 'worker') {
            $workerId = (int)($user['worker_id'] ?? 0);
            if ($workerId > 0) {
                $hasAccess = (new WalletRepository())->hasJobAccess($workerId);
            }
        }

        $catId = isset($_GET['category_id']) ? (int)$_GET['category_id'] : null;
        $jobs = $this->jobService->getOpenJobs($catId);

        // If worker does not have active access/subscription, mask direct contact numbers
        if (!$hasAccess) {
            foreach ($jobs as &$j) {
                if (!empty($j['customer_phone'])) {
                    $j['customer_phone'] = substr($j['customer_phone'], 0, 4) . '******';
                }
            }
        }

        sendJsonResponse(200, [
            'status'         => 'success',
            'has_job_access' => $hasAccess,
            'jobs'           => $jobs
        ]);
    }

    public function customerJobs(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Unauthorized.']);
        }
        $jobs = $this->jobService->getCustomerJobs((int)$user['user_id']);
        sendJsonResponse(200, ['status' => 'success', 'jobs' => $jobs]);
    }

    public function details(int $jobId): void {
        $job = $this->jobService->getJobDetails($jobId);
        if (!$job) {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Job not found.']);
        }
        $invoice = $this->invoiceService->getJobInvoice($jobId);
        sendJsonResponse(200, [
            'status'  => 'success',
            'job'     => $job,
            'invoice' => $invoice
        ]);
    }

    public function apply(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only workers can apply for jobs.']);
        }

        $data = getRequestData();
        $jobId = (int)($data['job_id'] ?? 0);
        try {
            $res = $this->jobService->apply($jobId, (int)$user['worker_id'], $data);
            sendJsonResponse(201, $res);
        } catch (Exception $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * POST /api/jobs.php?action=create-invoice
     * Worker adds final price for customer job.
     */
    public function createInvoice(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user['role'] !== 'worker' || empty($user['worker_id'])) {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Only assigned workers can create invoices.']);
        }

        $data = getRequestData();
        try {
            $result = $this->invoiceService->createInvoice((int)$user['worker_id'], $data);
            sendJsonResponse(201, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * POST /api/jobs.php?action=pay-invoice
     * Customer settles invoice (online or cash) with wallet impact.
     */
    public function payInvoice(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Authentication required to pay invoice.']);
        }

        $data = getRequestData();
        $invoiceId = (int)($data['invoice_id'] ?? 0);
        $method = (string)($data['payment_method'] ?? 'online');

        if ($invoiceId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid invoice_id is required.']);
        }

        try {
            $result = $this->invoiceService->payInvoice(
                $invoiceId,
                $method,
                (int)$user['user_id'],
                (string)($user['role'] ?? '')
            );
            sendJsonResponse(200, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * GET /api/jobs.php?action=invoices
     */
    public function invoices(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Authentication required.']);
        }

        if ($user['role'] === 'worker' && !empty($user['worker_id'])) {
            $list = $this->invoiceService->getWorkerInvoices((int)$user['worker_id']);
        } else {
            $list = $this->invoiceService->getCustomerInvoices((int)$user['user_id']);
        }

        sendJsonResponse(200, ['status' => 'success', 'invoices' => $list]);
    }
}
