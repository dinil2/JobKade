<?php
// repositories/InvoiceRepository.php

require_once __DIR__ . "/../config/Database.php";

class InvoiceRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Create a new job invoice record.
     */
    public function createInvoice(
        int $jobId,
        int $workerId,
        int $customerId,
        float $jobAmount,
        float $commissionRate,
        float $commissionAmount,
        float $workerNetAmount,
        string $paymentMethod,
        ?string $notes = null
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO job_invoices 
            (job_id, worker_id, customer_id, job_amount, commission_rate, commission_amount, worker_net_amount, payment_method, payment_status, notes, created_at)
            VALUES 
            (:job_id, :worker_id, :customer_id, :job_amount, :commission_rate, :commission_amount, :worker_net_amount, :payment_method, 'pending', :notes, NOW())
        ");
        $stmt->execute([
            ":job_id"            => $jobId,
            ":worker_id"         => $workerId,
            ":customer_id"       => $customerId,
            ":job_amount"        => $jobAmount,
            ":commission_rate"   => $commissionRate,
            ":commission_amount" => $commissionAmount,
            ":worker_net_amount" => $workerNetAmount,
            ":payment_method"    => $paymentMethod,
            ":notes"             => $notes
        ]);

        return (int)$this->db->lastInsertId();
    }

    /**
     * Get an invoice by ID with customer, worker, and job metadata.
     */
    public function getInvoiceById(int $invoiceId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                ji.*,
                ji.job_amount AS amount,
                ji.payment_status AS status,
                jr.title AS job_title,
                jr.address AS job_address,
                u_worker.full_name AS worker_name,
                u_worker.phone AS worker_phone,
                u_worker.email AS worker_email,
                u_cust.full_name AS customer_name,
                u_cust.phone AS customer_phone,
                u_cust.email AS customer_email
            FROM job_invoices ji
            JOIN job_requests jr ON ji.job_id = jr.id
            JOIN worker_profiles wp ON ji.worker_id = wp.id
            JOIN users u_worker ON wp.user_id = u_worker.id
            JOIN users u_cust ON ji.customer_id = u_cust.id
            WHERE ji.id = :id
            LIMIT 1
        ");
        $stmt->execute([":id" => $invoiceId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Get the latest invoice for a specific job.
     */
    public function getInvoiceByJobId(int $jobId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                ji.*,
                ji.job_amount AS amount,
                ji.payment_status AS status,
                jr.title AS job_title
            FROM job_invoices ji
            JOIN job_requests jr ON ji.job_id = jr.id
            WHERE ji.job_id = :job_id
            ORDER BY ji.id DESC
            LIMIT 1
        ");
        $stmt->execute([":job_id" => $jobId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Get all invoices for a worker.
     */
    public function getInvoicesByWorker(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT 
                ji.*,
                ji.job_amount AS amount,
                ji.payment_status AS status,
                jr.title AS job_title,
                u.full_name AS customer_name,
                u.phone AS customer_phone
            FROM job_invoices ji
            JOIN job_requests jr ON ji.job_id = jr.id
            JOIN users u ON ji.customer_id = u.id
            WHERE ji.worker_id = :worker_id
            ORDER BY ji.created_at DESC
        ");
        $stmt->execute([":worker_id" => $workerId]);
        return $stmt->fetchAll();
    }

    /**
     * Get all invoices for a customer.
     */
    public function getInvoicesByCustomer(int $customerId): array {
        $stmt = $this->db->prepare("
            SELECT 
                ji.*,
                ji.job_amount AS amount,
                ji.payment_status AS status,
                jr.title AS job_title,
                u.full_name AS worker_name,
                u.phone AS worker_phone
            FROM job_invoices ji
            JOIN job_requests jr ON ji.job_id = jr.id
            JOIN worker_profiles wp ON ji.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE ji.customer_id = :customer_id
            ORDER BY ji.created_at DESC
        ");
        $stmt->execute([":customer_id" => $customerId]);
        return $stmt->fetchAll();
    }

    /**
     * Mark an invoice as paid conditionally if not already paid.
     */
    public function markAsPaid(int $invoiceId, string $paymentMethod): bool {
        $stmt = $this->db->prepare("
            UPDATE job_invoices
            SET 
                payment_status = 'paid',
                payment_method = :method,
                paid_at = NOW()
            WHERE id = :id AND payment_status != 'paid'
        ");
        $stmt->execute([
            ":method" => $paymentMethod,
            ":id"     => $invoiceId
        ]);
        return $stmt->rowCount() > 0;
    }
}

