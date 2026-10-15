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

        // 3. Dispatch rejection email to worker user if rejected (no email on approval)
        if ($status === 'rejected') {
            $workerUserId = (int)($doc['user_id'] ?? 0);
            if ($workerUserId <= 0) {
                $profile = $this->workerRepo->getProfileById($workerId);
                $workerUserId = (int)($profile['user_id'] ?? 0);
            }

            if ($workerUserId > 0) {
                try {
                    require_once __DIR__ . '/EmailService.php';
                    require_once __DIR__ . '/../repositories/UserRepository.php';
                    $userRepo = new UserRepository();
                    $wUser = $userRepo->findById($workerUserId);
                    if ($wUser && !empty($wUser['email'])) {
                        $wEmail = $wUser['email'];
                        $wName = $wUser['full_name'] ?? 'Worker';
                        $subject = "JobKade: KYC Verification Update";
                        $reasonText = htmlspecialchars($notes ?: 'Document could not be verified. Please re-upload a clear copy.');
                        $htmlBody = "
                            <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                                <h2 style=\"color: #dc2626; margin-top: 0;\">KYC Document Rejected</h2>
                                <p>Hi " . htmlspecialchars($wName) . ",</p>
                                <p>Your submitted KYC identity document was reviewed and could not be approved at this time.</p>
                                <div style=\"background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;\">
                                    <strong>Reason for Rejection:</strong><br />
                                    <span>{$reasonText}</span>
                                </div>
                                <p>Please log in to your dashboard and re-upload a clear, valid copy of the required document.</p>
                                <div style=\"margin: 25px 0;\">
                                    <a href=\"http://localhost:81/JobKade/worker/kyc.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">Go to Identity Verification</a>
                                </div>
                                <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                                <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                            </div>
                        ";
                        (new EmailService())->send($wEmail, $wName, $subject, $htmlBody);
                    }
                } catch (Throwable $e) {
                    error_log("Failed to send KYC rejection email: " . $e->getMessage());
                }

                // In-app notification for KYC document rejection
                try {
                    require_once __DIR__ . '/NotificationService.php';
                    $reasonMsg = $notes ?: 'Document could not be verified. Please re-upload a clear copy.';
                    NotificationService::create(
                        $workerUserId,
                        "KYC Document Rejected",
                        "Your submitted KYC identity document could not be approved. Reason: {$reasonMsg}",
                        'kyc'
                    );
                } catch (Throwable $ne) {
                    error_log("Failed to send KYC rejection notification: " . $ne->getMessage());
                }
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

        // Dispatch rejection email if rejected (silent on approval)
        if ($status === 'rejected') {
            $profile = $this->workerRepo->getProfileById($workerId);
            if ($profile && !empty($profile['user_id'])) {
                $workerUserId = (int)$profile['user_id'];
                try {
                    require_once __DIR__ . '/EmailService.php';
                    require_once __DIR__ . '/../repositories/UserRepository.php';
                    $userRepo = new UserRepository();
                    $wUser = $userRepo->findById($workerUserId);
                    if ($wUser && !empty($wUser['email'])) {
                        $wEmail = $wUser['email'];
                        $wName = $wUser['full_name'] ?? 'Worker';
                        $subject = "JobKade: KYC Verification Update";
                        $reasonText = htmlspecialchars($notes ?: 'Documents could not be approved. Please review and re-submit.');
                        $htmlBody = "
                            <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                                <h2 style=\"color: #dc2626; margin-top: 0;\">KYC Verification Packet Rejected</h2>
                                <p>Hi " . htmlspecialchars($wName) . ",</p>
                                <p>Your verification packet was reviewed and rejected by administration.</p>
                                <div style=\"background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;\">
                                    <strong>Reason for Rejection:</strong><br />
                                    <span>{$reasonText}</span>
                                </div>
                                <p>Please log in to your dashboard to review the feedback and submit updated documentation.</p>
                                <div style=\"margin: 25px 0;\">
                                    <a href=\"http://localhost:81/JobKade/worker/kyc.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">Go to Identity Verification</a>
                                </div>
                                <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                                <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                            </div>
                        ";
                        (new EmailService())->send($wEmail, $wName, $subject, $htmlBody);
                    }
                } catch (Throwable $e) {
                    error_log("Failed to dispatch worker packet KYC rejection email: " . $e->getMessage());
                }

                // In-app notification for worker packet KYC rejection
                try {
                    require_once __DIR__ . '/NotificationService.php';
                    $reasonMsg = $notes ?: 'Documents could not be approved. Please review and re-submit.';
                    NotificationService::create(
                        $workerUserId,
                        "KYC Verification Rejected",
                        "Your verification packet was reviewed and rejected. Reason: {$reasonMsg}",
                        'kyc'
                    );
                } catch (Throwable $ne) {
                    error_log("Failed to send worker packet KYC rejection notification: " . $ne->getMessage());
                }
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

        // 2. Monthly Breakdown: restricted to September and October 2026 only (2 points) —
        // month name, jobs posted, jobs completed, revenue in Rs., commission in Rs.
        $targetMonths = [
            ['ym' => '2026-09', 'label' => 'September 2026'],
            ['ym' => '2026-10', 'label' => 'October 2026']
        ];
        $monthlyBreakdown = [];
        foreach ($targetMonths as $tm) {
            $ym = $tm['ym'];
            $monthName = $tm['label'];

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
        // worker name, jobs completed (count of their paid invoices),
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
        // customer name, jobs posted, transactions (paid invoices count), and total spent (sum of job_amount on paid invoices).
        // Sort by total spent descending.
        $customerStmt = $this->db->query("
            SELECT 
                u.id AS customer_id,
                u.full_name AS customer_name,
                COALESCE(jr_counts.jobs_posted, 0) AS jobs_posted,
                COALESCE(jr_counts.jobs_completed, 0) AS jobs_completed,
                COALESCE(inv_counts.transactions, 0) AS transactions,
                COALESCE(inv_counts.total_spent, 0.00) AS total_spent
            FROM users u
            LEFT JOIN (
                SELECT 
                    customer_id, 
                    COUNT(*) AS jobs_posted,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS jobs_completed
                FROM job_requests
                GROUP BY customer_id
            ) jr_counts ON jr_counts.customer_id = u.id
            LEFT JOIN (
                SELECT 
                    customer_id,
                    COUNT(*) AS transactions,
                    SUM(job_amount) AS total_spent
                FROM job_invoices
                WHERE payment_status = 'paid'
                GROUP BY customer_id
            ) inv_counts ON inv_counts.customer_id = u.id
            WHERE u.role = 'customer'
            ORDER BY total_spent DESC, transactions DESC, jobs_posted DESC, u.full_name ASC
        ");
        $customerRows = $customerStmt->fetchAll(PDO::FETCH_ASSOC);

        $customerActivity = array_map(function($c) {
            return [
                'customer_id'    => (int)$c['customer_id'],
                'customer_name'  => (string)$c['customer_name'],
                'jobs_posted'    => (int)$c['jobs_posted'],
                'jobs_completed' => (int)$c['jobs_completed'],
                'transactions'   => (int)$c['transactions'],
                'total_spent'    => (float)$c['total_spent']
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

    /**
     * Retrieve complete worker summary for admin popup modal:
     * - Earnings from job_invoices (paid only)
     * - Subscription status from worker_subscriptions (latest by end_date)
     * - Subscription totals from subscription_payments (status = 'completed')
     * - Plan name from subscription_plans
     * - Profile fields from worker_profiles & users
     *
     * @param int $workerProfileId
     * @return array
     */
    public function getWorkerSummary(int $workerProfileId): array {
        if ($workerProfileId <= 0) {
            throw new InvalidArgumentException("Invalid worker profile ID.");
        }

        // 1. Fetch profile & user info
        $stmt = $this->db->prepare("
            SELECT wp.*, u.full_name, u.email, u.phone, u.profile_picture, u.status AS user_status, u.address AS user_address
            FROM worker_profiles wp
            JOIN users u ON u.id = wp.user_id
            WHERE wp.id = :wid
            LIMIT 1
        ");
        $stmt->execute([':wid' => $workerProfileId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);

        // Fallback: check by user_id if not found by worker_profiles.id
        if (!$profile) {
            $stmt = $this->db->prepare("
                SELECT wp.*, u.full_name, u.email, u.phone, u.profile_picture, u.status AS user_status, u.address AS user_address
                FROM worker_profiles wp
                JOIN users u ON u.id = wp.user_id
                WHERE wp.user_id = :uid
                LIMIT 1
            ");
            $stmt->execute([':uid' => $workerProfileId]);
            $profile = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // Fallback: check users table directly if user is worker without worker_profiles row
        if (!$profile) {
            $stmt = $this->db->prepare("
                SELECT id AS user_id, full_name, email, phone, profile_picture, status AS user_status, address AS user_address, created_at
                FROM users
                WHERE id = :uid AND role = 'worker'
                LIMIT 1
            ");
            $stmt->execute([':uid' => $workerProfileId]);
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$u) {
                throw new InvalidArgumentException("Worker not found.");
            }
            $profile = [
                'id'              => 0,
                'user_id'         => (int)$u['user_id'],
                'full_name'       => $u['full_name'],
                'email'           => $u['email'],
                'phone'           => $u['phone'],
                'profile_picture' => $u['profile_picture'],
                'user_status'     => $u['user_status'],
                'address'         => $u['user_address'] ?? 'Colombo',
                'district'        => 'Colombo',
                'is_verified'     => 0,
                'verify_status'   => 'unverified',
                'rating_avg'      => 5.0,
                'reviews_count'   => 0,
                'hourly_rate'     => 1000.00,
                'created_at'      => $u['created_at']
            ];
        }

        $wpId = (int)($profile['id'] ?? 0);
        $userId = (int)($profile['user_id'] ?? 0);

        // 2. Earnings from job_invoices (paid only)
        $totalEarnings = 0.0;
        $monthlyEarnings = 0.0;
        $jobsCompleted = 0;

        if ($wpId > 0) {
            $earnStmt = $this->db->prepare("
                SELECT 
                    COALESCE(SUM(worker_net_amount), 0) AS total_earnings,
                    COUNT(*) AS jobs_completed
                FROM job_invoices
                WHERE worker_id = :wid AND payment_status = 'paid'
            ");
            $earnStmt->execute([':wid' => $wpId]);
            $earnData = $earnStmt->fetch(PDO::FETCH_ASSOC);
            $totalEarnings = (float)($earnData['total_earnings'] ?? 0.0);
            $jobsCompleted = (int)($earnData['jobs_completed'] ?? 0);

            // Monthly earnings (current month, paid invoices)
            $monthStmt = $this->db->prepare("
                SELECT COALESCE(SUM(worker_net_amount), 0)
                FROM job_invoices
                WHERE worker_id = :wid 
                  AND payment_status = 'paid'
                  AND (
                    (paid_at IS NOT NULL AND MONTH(paid_at) = MONTH(CURRENT_DATE()) AND YEAR(paid_at) = YEAR(CURRENT_DATE()))
                    OR
                    (paid_at IS NULL AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE()))
                  )
            ");
            $monthStmt->execute([':wid' => $wpId]);
            $monthlyEarnings = (float)$monthStmt->fetchColumn();
        }

        // 3. Subscription section
        $planName = 'None';
        $subStatus = 'None';
        $totalSubPaid = 0.0;
        $lastPaymentDate = null;

        if ($wpId > 0) {
            // Latest subscription from worker_subscriptions by end_date
            $subStmt = $this->db->prepare("
                SELECT ws.status, ws.start_date, ws.end_date, sp.name AS plan_name
                FROM worker_subscriptions ws
                LEFT JOIN subscription_plans sp ON sp.id = ws.plan_id
                WHERE ws.worker_id = :wid
                ORDER BY ws.end_date DESC, ws.id DESC
                LIMIT 1
            ");
            $subStmt->execute([':wid' => $wpId]);
            $subRow = $subStmt->fetch(PDO::FETCH_ASSOC);

            if ($subRow) {
                if (!empty($subRow['plan_name'])) {
                    $planName = $subRow['plan_name'];
                }
                $rawStatus = strtolower(trim((string)$subRow['status']));
                $endDate = $subRow['end_date'] ?? '';

                if ($rawStatus === 'active' && (!empty($endDate) && $endDate >= date('Y-m-d'))) {
                    $subStatus = 'Active';
                } elseif (!empty($rawStatus)) {
                    $subStatus = 'Expired';
                } else {
                    $subStatus = 'None';
                }
            }

            // Fallback plan name from subscription_payments if worker_subscriptions was empty
            if ($planName === 'None') {
                $lastPlanStmt = $this->db->prepare("
                    SELECT sp.name 
                    FROM subscription_payments p 
                    JOIN subscription_plans sp ON sp.id = p.plan_id 
                    WHERE p.worker_id = :wid AND p.status = 'completed' 
                    ORDER BY p.id DESC LIMIT 1
                ");
                $lastPlanStmt->execute([':wid' => $wpId]);
                $lastPlan = $lastPlanStmt->fetchColumn();
                if ($lastPlan) {
                    $planName = $lastPlan;
                }
            }

            // Subscription payments (status = 'completed')
            $payStmt = $this->db->prepare("
                SELECT 
                    COALESCE(SUM(amount), 0) AS total_paid,
                    MAX(created_at) AS last_payment_date
                FROM subscription_payments
                WHERE worker_id = :wid AND status = 'completed'
            ");
            $payStmt->execute([':wid' => $wpId]);
            $payData = $payStmt->fetch(PDO::FETCH_ASSOC);
            $totalSubPaid = (float)($payData['total_paid'] ?? 0.0);
            $lastPaymentDate = !empty($payData['last_payment_date']) ? $payData['last_payment_date'] : null;
        }

        // Format last payment date
        $lastPaymentFormatted = 'None';
        if (!empty($lastPaymentDate)) {
            $ts = strtotime($lastPaymentDate);
            $lastPaymentFormatted = $ts ? date('M j, Y', $ts) : $lastPaymentDate;
        }

        // 4. Profile details: Category, Location/District, Rating, Verification, Phone
        $category = 'None';
        if ($wpId > 0) {
            $catStmt = $this->db->prepare("
                SELECT c.name
                FROM worker_categories wc
                JOIN categories c ON c.id = wc.category_id
                WHERE wc.worker_id = :wid
                ORDER BY wc.is_primary DESC, c.name ASC
            ");
            $catStmt->execute([':wid' => $wpId]);
            $cats = $catStmt->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($cats)) {
                $category = implode(', ', $cats);
            } else {
                $srvStmt = $this->db->prepare("
                    SELECT c.name FROM worker_services ws
                    JOIN categories c ON c.id = ws.category_id
                    WHERE ws.worker_id = :wid
                    LIMIT 1
                ");
                $srvStmt->execute([':wid' => $wpId]);
                $srvCat = $srvStmt->fetchColumn();
                if ($srvCat) {
                    $category = $srvCat;
                }
            }
        }

        $district = !empty($profile['district']) ? trim((string)$profile['district']) : '';
        $address = !empty($profile['address']) ? trim((string)$profile['address']) : (!empty($profile['user_address']) ? trim((string)$profile['user_address']) : '');
        $location = 'None';
        if ($district && $address && stripos($address, $district) === false) {
            $location = "{$address}, {$district}";
        } elseif ($district) {
            $location = $district;
        } elseif ($address) {
            $location = $address;
        }

        $ratingVal = isset($profile['rating_avg']) && $profile['rating_avg'] !== null
            ? number_format((float)$profile['rating_avg'], 1)
            : '5.0';

        $isSuspended = (($profile['user_status'] ?? '') === 'suspended');
        if ($isSuspended) {
            $verificationStatus = 'Suspended';
        } elseif (!empty($profile['is_verified']) || ($profile['verify_status'] ?? '') === 'verified') {
            $verificationStatus = 'Verified';
        } elseif (($profile['verify_status'] ?? '') === 'pending') {
            $verificationStatus = 'Pending';
        } elseif (($profile['verify_status'] ?? '') === 'rejected') {
            $verificationStatus = 'Rejected';
        } else {
            $verificationStatus = 'Unverified';
        }

        $phone = !empty($profile['phone']) ? trim((string)$profile['phone']) : 'None';

        return [
            'worker_id'                  => $wpId,
            'user_id'                    => $userId,
            'name'                       => !empty($profile['full_name']) ? $profile['full_name'] : 'Unnamed Worker',
            'email'                      => !empty($profile['email']) ? $profile['email'] : 'None',
            'phone'                      => $phone,
            'avatar'                     => !empty($profile['profile_picture']) ? $profile['profile_picture'] : null,
            'category'                   => $category ?: 'None',
            'location'                   => $location ?: 'None',
            'district'                   => $district ?: 'None',
            'rating'                     => $ratingVal,
            'reviews_count'              => (int)($profile['reviews_count'] ?? 0),
            'verification_status'        => $verificationStatus,
            // Earnings section
            'total_earnings'             => $totalEarnings,
            'total_earnings_formatted'   => 'Rs. ' . number_format($totalEarnings, 2),
            'monthly_earnings'           => $monthlyEarnings,
            'monthly_earnings_formatted' => 'Rs. ' . number_format($monthlyEarnings, 2),
            'jobs_completed'             => $jobsCompleted,
            // Subscription section
            'plan_name'                  => $planName ?: 'None',
            'subscription_status'        => $subStatus ?: 'None',
            'total_sub_paid'             => $totalSubPaid,
            'total_sub_paid_formatted'   => 'Rs. ' . number_format($totalSubPaid, 2),
            'last_payment_date'          => $lastPaymentFormatted ?: 'None',
        ];
    }
}

