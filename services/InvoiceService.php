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

    // Check if a worker is assigned to or applied for a job.
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

    // Worker creates an invoice / adds the price for a customer job.
    public function createInvoice(int $workerId, array $data): array {
        $jobId = (int)($data["job_id"] ?? 0);
        if ($jobId <= 0) {
            throw new InvalidArgumentException("Invalid job ID.");
        }

        $job = $this->jobRepo->getById($jobId);
        if (!$job) {
            throw new InvalidArgumentException("Job request #{$jobId} not found.");
        }

        $jobAmount = (float)($data["amount"] ?? $data["job_amount"] ?? $data["price"] ?? 0);
        if ($jobAmount <= 0) {
            throw new InvalidArgumentException("Price must be greater than 0.");
        }

        if (in_array($job['status'], ['completed', 'cancelled'], true)) {
            throw new InvalidArgumentException("Cannot invoice job #{$jobId} because it is {$job['status']}.");
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
            throw new InvalidArgumentException("Invoice for job #{$jobId} is already paid.");
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

    // Customer or Worker pays and settles the invoice.
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
                throw new InvalidArgumentException("Not authorized to settle this invoice.");
            }
        }

        $result = $this->walletService->settleInvoice($invoiceId, $paymentMethod);

        // Send payment receipt emails to customer and worker after successful payment settlement
        if (!empty($result) && ($result['status'] ?? '') === 'success') {
            try {
                $this->sendPaymentReceiptEmails($invoiceId, $result);
            } catch (Throwable $e) {
                error_log("InvoiceService: Failed sending payment receipt emails for invoice #{$invoiceId}: " . $e->getMessage());
            }
        }

        return $result;
    }

    /**
     * Send automatic payment receipt emails to customer and worker.
     * Wrapped so any failure is only logged and never breaks the payment flow.
     */
    protected function sendPaymentReceiptEmails(int $invoiceId, array $settleResult): void {
        try {
            require_once __DIR__ . "/../repositories/UserRepository.php";
            require_once __DIR__ . "/../repositories/WorkerRepository.php";
            require_once __DIR__ . "/../repositories/JobRepository.php";
            require_once __DIR__ . "/EmailService.php";

            $invoice = $this->invoiceRepo->getInvoiceById($invoiceId);
            if (!$invoice) {
                error_log("InvoiceService: Invoice #{$invoiceId} not found when generating receipt emails.");
                return;
            }

            // 1. Load job title from job_requests via JobRepository
            $jobId = (int)($invoice['job_id'] ?? 0);
            $job = $this->jobRepo->getById($jobId);
            $jobTitle = !empty($job['title']) ? $job['title'] : ($invoice['job_title'] ?? "Job Request #{$jobId}");

            // 2. Load Customer details from users table via UserRepository
            $userRepo = new UserRepository();
            $customerUser = $userRepo->findById((int)$invoice['customer_id']);
            $customerEmail = !empty($customerUser['email']) ? $customerUser['email'] : ($invoice['customer_email'] ?? '');
            $customerName  = !empty($customerUser['full_name']) ? $customerUser['full_name'] : ($invoice['customer_name'] ?? 'Customer');

            // 3. Load Worker details from users table via WorkerRepository & UserRepository
            $workerRepo = new WorkerRepository();
            $workerProfile = $workerRepo->getProfileById((int)$invoice['worker_id']);
            $workerUserId = ($workerProfile && !empty($workerProfile['user_id'])) ? (int)$workerProfile['user_id'] : 0;
            $workerUser = ($workerUserId > 0) ? $userRepo->findById($workerUserId) : null;
            $workerEmail = !empty($workerUser['email']) ? $workerUser['email'] : ($workerProfile['email'] ?? ($invoice['worker_email'] ?? ''));
            $workerName  = !empty($workerUser['full_name']) ? $workerUser['full_name'] : ($workerProfile['full_name'] ?? ($invoice['worker_name'] ?? 'Worker'));

            // Financial & metadata figures
            $jobAmount = (float)($invoice['job_amount'] ?? $invoice['amount'] ?? 0.0);
            $commissionRate = (float)($invoice['commission_rate'] ?? 0.10);
            $commissionRatePercent = round($commissionRate * 100);
            $commissionAmount = (float)($invoice['commission_amount'] ?? 0.0);
            $workerNetAmount = (float)($invoice['worker_net_amount'] ?? ($jobAmount - $commissionAmount));

            $cleanMethod = strtolower((string)($settleResult['payment_method'] ?? $invoice['payment_method'] ?? 'online'));
            $paymentMethodLabel = ($cleanMethod === 'cash') ? 'Cash' : 'Online';

            $paymentDate = !empty($invoice['paid_at']) ? $invoice['paid_at'] : date('Y-m-d H:i:s');

            $hoursWorked = (isset($invoice['hours_worked']) && $invoice['hours_worked'] !== null && (float)$invoice['hours_worked'] > 0)
                ? (float)$invoice['hours_worked']
                : null;
            $hourlyRate = isset($invoice['worker_hourly_rate']) && (float)$invoice['worker_hourly_rate'] > 0
                ? (float)$invoice['worker_hourly_rate']
                : (isset($workerProfile['hourly_rate']) ? (float)$workerProfile['hourly_rate'] : null);
            $travellingFee = (isset($invoice['travelling_fee']) && (float)$invoice['travelling_fee'] > 0)
                ? (float)$invoice['travelling_fee']
                : null;

            $emailService = new EmailService();

            // Customer Email — Subject: JobKade: Payment Receipt - Invoice #[id]
            if (!empty($customerEmail)) {
                try {
                    $customerSubject = "JobKade: Payment Receipt - Invoice #{$invoiceId}";
                    $customerHtml = $this->buildCustomerReceiptHtml([
                        'invoice_id'     => $invoiceId,
                        'job_title'      => $jobTitle,
                        'worker_name'    => $workerName,
                        'customer_name'  => $customerName,
                        'job_amount'     => $jobAmount,
                        'payment_method' => $paymentMethodLabel,
                        'payment_date'   => $paymentDate,
                        'hours_worked'   => $hoursWorked,
                        'hourly_rate'    => $hourlyRate,
                        'travelling_fee' => $travellingFee,
                    ]);

                    $emailService->send($customerEmail, $customerName, $customerSubject, $customerHtml);
                } catch (Throwable $e) {
                    error_log("InvoiceService: Customer receipt email failed for invoice #{$invoiceId}: " . $e->getMessage());
                }
            }

            // Worker Email — Subject: JobKade: Payment Settled - Invoice #[id]
            if (!empty($workerEmail)) {
                try {
                    $workerSubject = "JobKade: Payment Settled - Invoice #{$invoiceId}";
                    $workerHtml = $this->buildWorkerSettlementHtml([
                        'invoice_id'              => $invoiceId,
                        'job_title'               => $jobTitle,
                        'worker_name'             => $workerName,
                        'customer_name'           => $customerName,
                        'job_amount'              => $jobAmount,
                        'commission_rate_percent' => $commissionRatePercent,
                        'commission_amount'       => $commissionAmount,
                        'worker_net_amount'       => $workerNetAmount,
                        'payment_method'          => $paymentMethodLabel,
                        'payment_method_raw'      => $cleanMethod,
                        'payment_date'            => $paymentDate,
                        'hours_worked'            => $hoursWorked,
                        'hourly_rate'             => $hourlyRate,
                        'travelling_fee'          => $travellingFee,
                    ]);

                    $emailService->send($workerEmail, $workerName, $workerSubject, $workerHtml);
                } catch (Throwable $e) {
                    error_log("InvoiceService: Worker settlement email failed for invoice #{$invoiceId}: " . $e->getMessage());
                }
            }

            // In-app notifications for payment completion (notify customer AND worker)
            try {
                require_once __DIR__ . '/NotificationService.php';
                $customerId = (int)($invoice['customer_id'] ?? 0);
                if ($customerId > 0) {
                    $formattedTotal = number_format($jobAmount, 2);
                    NotificationService::create(
                        $customerId,
                        "Payment Completed",
                        "Payment of Rs. {$formattedTotal} for invoice #{$invoiceId} ('{$jobTitle}') was successful.",
                        'payment'
                    );
                }
                if ($workerUserId > 0) {
                    $formattedNet = number_format($workerNetAmount, 2);
                    NotificationService::create(
                        $workerUserId,
                        "Payment Settled",
                        "Payment settled for invoice #{$invoiceId} ('{$jobTitle}'). Net credited: Rs. {$formattedNet}.",
                        'payment'
                    );
                }
            } catch (Throwable $e) {
                error_log("InvoiceService: Payment in-app notification failed for invoice #{$invoiceId}: " . $e->getMessage());
            }
        } catch (Throwable $ex) {
            error_log("InvoiceService: sendPaymentReceiptEmails encountered an error: " . $ex->getMessage());
        }
    }

    private function buildCustomerReceiptHtml(array $d): string {
        $safeJobTitle   = htmlspecialchars($d['job_title'], ENT_QUOTES, 'UTF-8');
        $safeWorkerName = htmlspecialchars($d['worker_name'], ENT_QUOTES, 'UTF-8');
        $safeCustName   = htmlspecialchars($d['customer_name'], ENT_QUOTES, 'UTF-8');
        $amountFormatted = number_format($d['job_amount'], 2);

        $hoursLine = '';
        if ($d['hours_worked'] !== null) {
            $rateSuffix = ($d['hourly_rate'] !== null) ? " (@ Rs. " . number_format($d['hourly_rate'], 2) . "/hr)" : "";
            $hoursLine = "<tr><td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Hours Billed:</td><td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">" . number_format($d['hours_worked'], 2) . " hrs{$rateSuffix}</td></tr>";
        }

        $travelLine = '';
        if ($d['travelling_fee'] !== null) {
            $travelLine = "<tr><td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Travelling Fee:</td><td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Rs. " . number_format($d['travelling_fee'], 2) . "</td></tr>";
        }

        return "
<!DOCTYPE html>
<html>
<head><meta charset=\"UTF-8\"></head>
<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#f4f6f8; margin:0; padding:20px;\">
  <div style=\"max-width:580px; margin:0 auto; background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 2px 6px rgba(0,0,0,0.04);\">
    <div style=\"background:linear-gradient(135deg, #2563eb, #1d4ed8); padding:24px 30px; color:#ffffff;\">
      <h1 style=\"margin:0; font-size:24px; font-weight:800; letter-spacing:-0.02em;\">JobKade</h1>
      <p style=\"margin:4px 0 0; font-size:14px; opacity:0.9;\">Payment Receipt</p>
    </div>
    <div style=\"padding:28px 30px;\">
      <div style=\"font-size:16px; color:#111827; margin-bottom:16px;\">Hello <strong>{$safeCustName}</strong>,</div>
      <p style=\"color:#4b5563; font-size:14px; line-height:1.5; margin-bottom:20px;\">Thank you for your payment! Here is your official receipt for the completed job service:</p>

      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; font-size:14px; margin-bottom:24px;\">
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Invoice Number:</td>
          <td align=\"right\" style=\"font-weight:700; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">#{$d['invoice_id']}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Job Title:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$safeJobTitle}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Worker:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$safeWorkerName}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Payment Method:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$d['payment_method']}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Payment Date:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$d['payment_date']}</td>
        </tr>
        {$hoursLine}
        {$travelLine}
        <tr>
          <td style=\"color:#111827; font-weight:700; font-size:15px; padding-top:14px;\">Amount Paid:</td>
          <td align=\"right\" style=\"color:#2563eb; font-weight:800; font-size:18px; padding-top:14px;\">Rs. {$amountFormatted}</td>
        </tr>
      </table>

      <div style=\"background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:14px 18px; color:#065f46; font-size:13.5px; line-height:1.4;\">
        <strong>Thank you for choosing JobKade!</strong> We appreciate your business and hope you had a great service experience.
      </div>
    </div>
    <div style=\"background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px 30px; font-size:12px; color:#9ca3af; text-align:center;\">
      &copy; 2026 JobKade. Verified Local Skilled Services Marketplace. &bull; Contact us: <a href=\"mailto:jobkade7@gmail.com\" style=\"color:#2563eb; text-decoration:none;\">jobkade7@gmail.com</a>
    </div>
  </div>
</body>
</html>";
    }

    private function buildWorkerSettlementHtml(array $d): string {
        $safeJobTitle   = htmlspecialchars($d['job_title'], ENT_QUOTES, 'UTF-8');
        $safeWorkerName = htmlspecialchars($d['worker_name'], ENT_QUOTES, 'UTF-8');
        $amountFormatted = number_format($d['job_amount'], 2);
        $commFormatted   = number_format($d['commission_amount'], 2);
        $netFormatted    = number_format($d['worker_net_amount'], 2);

        $hoursLine = '';
        if ($d['hours_worked'] !== null) {
            $rateSuffix = ($d['hourly_rate'] !== null) ? " (@ Rs. " . number_format($d['hourly_rate'], 2) . "/hr)" : "";
            $hoursLine = "<tr><td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Hours Worked:</td><td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">" . number_format($d['hours_worked'], 2) . " hrs{$rateSuffix}</td></tr>";
        }

        $travelLine = '';
        if ($d['travelling_fee'] !== null) {
            $travelLine = "<tr><td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Travelling Fee:</td><td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Rs. " . number_format($d['travelling_fee'], 2) . "</td></tr>";
        }

        $note = ($d['payment_method_raw'] === 'cash')
            ? "Customer paid in cash. The platform commission of <strong>Rs. {$commFormatted}</strong> has been debited from your wallet."
            : "The net earnings of <strong>Rs. {$netFormatted}</strong> have been credited to your JobKade wallet.";

        return "
<!DOCTYPE html>
<html>
<head><meta charset=\"UTF-8\"></head>
<body style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#f4f6f8; margin:0; padding:20px;\">
  <div style=\"max-width:580px; margin:0 auto; background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 2px 6px rgba(0,0,0,0.04);\">
    <div style=\"background:linear-gradient(135deg, #10b981, #059669); padding:24px 30px; color:#ffffff;\">
      <h1 style=\"margin:0; font-size:24px; font-weight:800; letter-spacing:-0.02em;\">JobKade</h1>
      <p style=\"margin:4px 0 0; font-size:14px; opacity:0.9;\">Payment Settled</p>
    </div>
    <div style=\"padding:28px 30px;\">
      <div style=\"font-size:16px; color:#111827; margin-bottom:16px;\">Hello <strong>{$safeWorkerName}</strong>,</div>
      <p style=\"color:#4b5563; font-size:14px; line-height:1.5; margin-bottom:20px;\">Invoice #{$d['invoice_id']} has been settled. Below is your complete earnings and commission breakdown:</p>

      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; font-size:14px; margin-bottom:24px;\">
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Invoice Number:</td>
          <td align=\"right\" style=\"font-weight:700; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">#{$d['invoice_id']}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Job Title:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$safeJobTitle}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Payment Method:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$d['payment_method']}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Payment Date:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">{$d['payment_date']}</td>
        </tr>
        {$hoursLine}
        {$travelLine}
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Gross Job Amount:</td>
          <td align=\"right\" style=\"font-weight:600; color:#111827; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Rs. {$amountFormatted}</td>
        </tr>
        <tr>
          <td style=\"color:#6b7280; padding:8px 0; border-bottom:1px solid #f3f4f6;\">Commission ({$d['commission_rate_percent']}%):</td>
          <td align=\"right\" style=\"font-weight:600; color:#ef4444; padding:8px 0; border-bottom:1px solid #f3f4f6;\">- Rs. {$commFormatted}</td>
        </tr>
        <tr>
          <td style=\"color:#111827; font-weight:700; font-size:15px; padding-top:14px;\">Net Amount:</td>
          <td align=\"right\" style=\"color:#10b981; font-weight:800; font-size:18px; padding-top:14px;\">Rs. {$netFormatted}</td>
        </tr>
      </table>

      <div style=\"background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:14px 18px; color:#065f46; font-size:13.5px; line-height:1.4;\">
        {$note}
      </div>
    </div>
    <div style=\"background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px 30px; font-size:12px; color:#9ca3af; text-align:center;\">
      &copy; 2026 JobKade. Verified Local Skilled Services Marketplace. &bull; Contact us: <a href=\"mailto:jobkade7@gmail.com\" style=\"color:#10b981; text-decoration:none;\">jobkade7@gmail.com</a>
    </div>
  </div>
</body>
</html>";
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

