<?php
// services/AdminService.php

require_once __DIR__ . '/../repositories/KycRepository.php';
require_once __DIR__ . '/../repositories/WorkerRepository.php';
require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../config/Database.php';

class AdminService {
    private KycRepository $kycRepo;
    private WorkerRepository $workerRepo;
    private UserRepository $userRepo;
    private PDO $db;

    public function __construct() {
        $this->kycRepo = new KycRepository();
        $this->workerRepo = new WorkerRepository();
        $this->userRepo = new UserRepository();
        $this->db = Database::getConnection();
    }

    // Retrieve all pending KYC verification requests.
    public function getPendingKycList(): array {
        return $this->kycRepo->getPendingKycList();
    }

    // Retrieve KYC requests by status filter.
    public function getKycByStatus(string $status): array {
        return $this->kycRepo->getAllByStatus($status);
    }

    // Review and verify a KYC document (Approve or Reject).
    public function verifyKyc(int $kycId, string $status, ?string $notes, int $adminId): array {
        if ($kycId <= 0) {
            throw new InvalidArgumentException("Invalid KYC document ID.");
        }

        $status = strtolower(trim($status));
        if (!in_array($status, ['approved', 'rejected'], true)) {
            throw new InvalidArgumentException("Status must be either 'approved' or 'rejected'.");
        }

        $doc = $this->kycRepo->getDocumentById($kycId);
        if (!$doc) {
            throw new InvalidArgumentException("KYC document not found.");
        }

        $workerId = (int)$doc['worker_id'];
        $notes = !empty($notes) ? trim(strip_tags((string)$notes)) : null;

        if ($status === 'rejected' && empty($notes)) {
            $notes = "Document could not be verified. Please re-upload a clear copy.";
        }

        // 1. Update KYC document status
        $updated = $this->kycRepo->updateKycStatus($kycId, $status, $notes, $adminId);
        if (!$updated) {
            throw new RuntimeException("Failed to update KYC document record.");
        }

        // 2. Transition worker profile verification status
        $workerStatus = ($status === 'approved') ? 'verified' : 'rejected';
        $this->workerRepo->updateVerificationStatus($workerId, $workerStatus);

        // 3. Dispatch in-app notification to worker user
        $workerUserId = (int)($doc['user_id'] ?? 0);
        if ($workerUserId <= 0) {
            $profile = $this->workerRepo->getProfileById($workerId);
            $workerUserId = (int)($profile['user_id'] ?? 0);
        }

        if ($workerUserId > 0) {
            $notifTitle = ($status === 'approved') ? 'KYC Verification Approved' : 'KYC Verification Rejected';
            $notifMsg = ($status === 'approved') 
                ? 'Congratulations! Your identity document has been verified. You now have the verified worker badge.'
                : 'Your KYC submission was rejected by administration. Reason: ' . ($notes ?: 'Document could not be verified.');

            try {
                $nStmt = $this->db->prepare("
                    INSERT INTO notifications (user_id, title, message, type, is_read)
                    VALUES (:uid, :title, :msg, 'kyc', 0)
                ");
                $nStmt->execute([
                    ':uid'   => $workerUserId,
                    ':title' => $notifTitle,
                    ':msg'   => $notifMsg
                ]);
            } catch (Exception $e) {
                // Log and proceed without blocking transaction
                error_log("Failed to dispatch KYC notification: " . $e->getMessage());
            }
        }

        return [
            'status'        => 'success',
            'message'       => "KYC document #{$kycId} has been successfully {$status}.",
            'kyc_id'        => $kycId,
            'review_status' => $status,
            'worker_status' => $workerStatus,
            'admin_notes'   => $notes
        ];
    }

    // Verify all KYC documents for a worker at once (NIC, Police Report, Selfie packet).
    public function verifyWorkerPacket(int $workerId, string $status, ?string $notes, int $adminId): array {
        if ($workerId <= 0) {
            throw new InvalidArgumentException("Invalid worker ID provided.");
        }
        $status = strtolower(trim($status));
        if (!in_array($status, ['approved', 'rejected'], true)) {
            throw new InvalidArgumentException("Status must be either 'approved' or 'rejected'.");
        }

        $docs = $this->kycRepo->getDocumentsByWorkerId($workerId);
        if (empty($docs)) {
            throw new InvalidArgumentException("No KYC documents found for worker ID #{$workerId}.");
        }

        $notes = !empty($notes) ? trim(strip_tags((string)$notes)) : null;
        if ($status === 'rejected' && empty($notes)) {
            $notes = "Worker verification could not be approved. Please review documents and re-submit.";
        }

        foreach ($docs as $doc) {
            $docId = (int)($doc['kyc_id'] ?? $doc['id']);
            $this->kycRepo->updateKycStatus($docId, $status, $notes, $adminId);
        }

        $workerStatus = ($status === 'approved') ? 'verified' : 'rejected';
        $this->workerRepo->updateVerificationStatus($workerId, $workerStatus);

        $profile = $this->workerRepo->getProfileById($workerId);
        if ($profile && !empty($profile['user_id'])) {
            $workerUserId = (int)$profile['user_id'];
            $notifTitle = ($status === 'approved') ? 'KYC Verification Approved' : 'KYC Verification Rejected';
            $notifMsg = ($status === 'approved')
                ? 'Congratulations! Your National ID, Police Report, and Live Selfie have all been verified and approved.'
                : 'Your verification packet was reviewed and rejected. Reason: ' . ($notes ?: 'Documents could not be approved.');

            try {
                $nStmt = $this->db->prepare("
                    INSERT INTO notifications (user_id, title, message, type, is_read)
                    VALUES (:uid, :title, :msg, 'kyc', 0)
                ");
                $nStmt->execute([':uid' => $workerUserId, ':title' => $notifTitle, ':msg' => $notifMsg]);
            } catch (Exception $e) {
                error_log("Failed to dispatch worker packet KYC notification: " . $e->getMessage());
            }
        }

        return [
            'status'        => 'success',
            'message'       => "Worker #{$workerId} verification packet has been successfully {$status}.",
            'worker_id'     => $workerId,
            'worker_status' => $workerStatus,
            'admin_notes'   => $notes
        ];
    }

    // Retrieve platform analytics: numbers-only dashboard datasets (KPIs, monthly breakdown, worker performance, customer activity, category ranking, recent activity).
    public function getAnalytics(): array {
        $thisMonth = date('Y-m');

        // 1. KPI Numbers:
        // Total workers, total customers, total jobs posted, total jobs completed,
        // platform revenue in Rs. (sum of job_amount on paid invoices),
        // commission earned in Rs. (sum of commission_amount on paid invoices).
        $totalWorkers = (int)$this->db->query("SELECT COUNT(*) FROM users WHERE role = 'worker'")->fetchColumn();
        $totalCustomers = (int)$this->db->query("SELECT COUNT(*) FROM users WHERE role = 'customer'")->fetchColumn();
        $totalJobsPosted = (int)$this->db->query("SELECT COUNT(*) FROM job_requests")->fetchColumn();
        $totalJobsCompleted = (int)$this->db->query("SELECT COUNT(*) FROM job_requests WHERE status = 'completed'")->fetchColumn();

        $revStmt = $this->db->query("
            SELECT 
                COALESCE(SUM(job_amount), 0) AS platform_revenue,
                COALESCE(SUM(commission_amount), 0) AS commission_earned
            FROM job_invoices
            WHERE payment_status = 'paid'
        ");
        $revRow = $revStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $platformRevenue = (float)($revRow['platform_revenue'] ?? 0);
        $commissionEarned = (float)($revRow['commission_earned'] ?? 0);

        // 2. Monthly Breakdown: last 8 months, one row per month —
        // month name, jobs posted, jobs completed, revenue in Rs., commission in Rs.
        $monthlyBreakdown = [];
        for ($i = 0; $i < 8; $i++) {
            $dt = (new DateTime('first day of this month'))->modify("-$i month");
            $ym = $dt->format('Y-m');
            $monthName = $dt->format('F Y');

            // Jobs posted in this month
            $jpStmt = $this->db->prepare("SELECT COUNT(*) FROM job_requests WHERE DATE_FORMAT(created_at, '%Y-%m') = :ym");
            $jpStmt->execute([':ym' => $ym]);
            $jobsPosted = (int)$jpStmt->fetchColumn();

            // Jobs completed in this month
            $jcStmt = $this->db->prepare("
                SELECT COUNT(*) 
                FROM job_requests 
                WHERE status = 'completed' 
                  AND (DATE_FORMAT(completed_at, '%Y-%m') = :ym1 OR (completed_at IS NULL AND DATE_FORMAT(updated_at, '%Y-%m') = :ym2))
            ");
            $jcStmt->execute([':ym1' => $ym, ':ym2' => $ym]);
            $jobsCompleted = (int)$jcStmt->fetchColumn();

            // Revenue and commission on paid invoices in this month
            $invStmt = $this->db->prepare("
                SELECT 
                    COALESCE(SUM(job_amount), 0) AS revenue,
                    COALESCE(SUM(commission_amount), 0) AS commission
                FROM job_invoices
                WHERE payment_status = 'paid' 
                  AND (DATE_FORMAT(paid_at, '%Y-%m') = :ym1 OR (paid_at IS NULL AND DATE_FORMAT(created_at, '%Y-%m') = :ym2))
            ");
            $invStmt->execute([':ym1' => $ym, ':ym2' => $ym]);
            $invRow = $invStmt->fetch(PDO::FETCH_ASSOC) ?: [];

            $monthlyBreakdown[] = [
                'month'          => $monthName,
                'month_key'      => $ym,
                'jobs_posted'    => $jobsPosted,
                'jobs_completed' => $jobsCompleted,
                'revenue'        => (float)($invRow['revenue'] ?? 0),
                'commission'     => (float)($invRow['commission'] ?? 0)
            ];
        }

        // 3. Worker Performance: one row per worker —
        // worker name, jobs completed (count of their invoices),
        // earnings this month in Rs. (sum of worker_net_amount on paid invoices this month),
        // total earnings in Rs. (sum of worker_net_amount on paid invoices, all time).
        // Sort by total earnings descending.
        $workerStmt = $this->db->prepare("
            SELECT 
                wp.id AS worker_id,
                u.full_name AS worker_name,
                COUNT(CASE WHEN ji.payment_status = 'paid' THEN 1 END) AS jobs_completed,
                COALESCE(SUM(CASE WHEN ji.payment_status = 'paid' AND (DATE_FORMAT(ji.paid_at, '%Y-%m') = :ym1 OR (ji.paid_at IS NULL AND DATE_FORMAT(ji.created_at, '%Y-%m') = :ym2)) THEN ji.worker_net_amount ELSE 0 END), 0) AS earnings_this_month,
                COALESCE(SUM(CASE WHEN ji.payment_status = 'paid' THEN ji.worker_net_amount ELSE 0 END), 0) AS total_earnings
            FROM worker_profiles wp
            JOIN users u ON wp.user_id = u.id
            LEFT JOIN job_invoices ji ON ji.worker_id = wp.id
            GROUP BY wp.id, u.full_name
            ORDER BY total_earnings DESC, jobs_completed DESC, u.full_name ASC
        ");
        $workerStmt->execute([':ym1' => $thisMonth, ':ym2' => $thisMonth]);
        $workerRows = $workerStmt->fetchAll(PDO::FETCH_ASSOC);

        $workerPerformance = array_map(function($w) {
            return [
                'worker_id'           => (int)$w['worker_id'],
                'worker_name'         => (string)$w['worker_name'],
                'jobs_completed'      => (int)$w['jobs_completed'],
                'earnings_this_month' => (float)$w['earnings_this_month'],
                'total_earnings'      => (float)$w['total_earnings']
            ];
        }, $workerRows);

        // 4. Customer Activity: one row per customer —
        // customer name, jobs posted (count of job_requests),
        // jobs completed (count with status completed).
        // Sort by jobs posted descending.
        $customerStmt = $this->db->query("
            SELECT 
                u.id AS customer_id,
                u.full_name AS customer_name,
                COUNT(jr.id) AS jobs_posted,
                COUNT(CASE WHEN jr.status = 'completed' THEN 1 END) AS jobs_completed
            FROM users u
            LEFT JOIN job_requests jr ON jr.customer_id = u.id
            WHERE u.role = 'customer'
            GROUP BY u.id, u.full_name
            ORDER BY jobs_posted DESC, jobs_completed DESC, u.full_name ASC
        ");
        $customerRows = $customerStmt->fetchAll(PDO::FETCH_ASSOC);

        $customerActivity = array_map(function($c) {
            return [
                'customer_id'    => (int)$c['customer_id'],
                'customer_name'  => (string)$c['customer_name'],
                'jobs_posted'    => (int)$c['jobs_posted'],
                'jobs_completed' => (int)$c['jobs_completed']
            ];
        }, $customerRows);

        // 5. Category Ranking: trade category name and worker count per category, sorted descending.
        $catStmt = $this->db->query("
            SELECT 
                c.id AS category_id,
                c.name AS category_name,
                COUNT(DISTINCT wc.worker_id) AS worker_count
            FROM categories c
            LEFT JOIN worker_categories wc ON c.id = wc.category_id
            GROUP BY c.id, c.name
            ORDER BY worker_count DESC, c.name ASC
        ");
        $categoryRows = $catStmt->fetchAll(PDO::FETCH_ASSOC);

        $categoryRanking = array_map(function($cat) {
            return [
                'category_id'   => (int)$cat['category_id'],
                'category_name' => (string)$cat['category_name'],
                'worker_count'  => (int)$cat['worker_count']
            ];
        }, $categoryRows);

        // 6. Recent Activity: latest 10 events across the platform —
        // newest job requests, paid invoices, and registrations,
        // each with a description and timestamp, newest first.
        $events = [];

        // 6a. Newest job requests
        $reqsStmt = $this->db->query("
            SELECT jr.id, jr.title, u.full_name AS customer_name, jr.created_at
            FROM job_requests jr
            JOIN users u ON jr.customer_id = u.id
            ORDER BY jr.created_at DESC
            LIMIT 10
        ");
        foreach ($reqsStmt->fetchAll(PDO::FETCH_ASSOC) as $jr) {
            $events[] = [
                'type'        => 'job_request',
                'description' => "Job request posted: '" . $jr['title'] . "' by " . $jr['customer_name'],
                'timestamp'   => $jr['created_at']
            ];
        }

        // 6b. Newest paid invoices
        $paidInvStmt = $this->db->query("
            SELECT 
                ji.id,
                ji.job_amount,
                ji.payment_method,
                wu.full_name AS worker_name,
                cu.full_name AS customer_name,
                COALESCE(ji.paid_at, ji.created_at) AS event_time
            FROM job_invoices ji
            JOIN worker_profiles wp ON ji.worker_id = wp.id
            JOIN users wu ON wp.user_id = wu.id
            JOIN users cu ON ji.customer_id = cu.id
            WHERE ji.payment_status = 'paid'
            ORDER BY event_time DESC
            LIMIT 10
        ");
        foreach ($paidInvStmt->fetchAll(PDO::FETCH_ASSOC) as $pi) {
            $amtFormatted = number_format((float)$pi['job_amount'], 2);
            $methodText = ucfirst($pi['payment_method'] ?? 'online');
            $events[] = [
                'type'        => 'paid_invoice',
                'description' => "Invoice #{$pi['id']} paid: Rs. {$amtFormatted} via {$methodText} ({$pi['worker_name']} / {$pi['customer_name']})",
                'timestamp'   => $pi['event_time']
            ];
        }

        // 6c. Newest user registrations
        $regStmt = $this->db->query("
            SELECT id, full_name, role, created_at
            FROM users
            WHERE role IN ('worker', 'customer')
            ORDER BY created_at DESC
            LIMIT 10
        ");
        foreach ($regStmt->fetchAll(PDO::FETCH_ASSOC) as $reg) {
            $roleLabel = ucfirst($reg['role']);
            $events[] = [
                'type'        => 'registration',
                'description' => "New {$roleLabel} registered: {$reg['full_name']}",
                'timestamp'   => $reg['created_at']
            ];
        }

        // Sort events chronologically descending
        usort($events, function($a, $b) {
            return strtotime($b['timestamp']) <=> strtotime($a['timestamp']);
        });
        $recentActivity = array_slice($events, 0, 10);

        return [
            'kpis' => [
                'total_workers'        => $totalWorkers,
                'total_customers'      => $totalCustomers,
                'total_jobs_posted'    => $totalJobsPosted,
                'total_jobs_completed' => $totalJobsCompleted,
                'platform_revenue'     => $platformRevenue,
                'commission_earned'    => $commissionEarned,
            ],
            'total_workers'        => $totalWorkers,
            'total_customers'      => $totalCustomers,
            'total_jobs_posted'    => $totalJobsPosted,
            'total_jobs_completed' => $totalJobsCompleted,
            'platform_revenue'     => $platformRevenue,
            'commission_earned'    => $commissionEarned,
            'monthly_breakdown'    => $monthlyBreakdown,
            'worker_performance'   => $workerPerformance,
            'customer_activity'    => $customerActivity,
            'category_ranking'     => $categoryRanking,
            'recent_activity'      => $recentActivity,
        ];
    }
}
