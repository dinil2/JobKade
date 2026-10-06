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

    /**
     * Retrieve all pending KYC verification requests.
     */
    public function getPendingKycList(): array {
        return $this->kycRepo->getPendingKycList();
    }

    /**
     * Retrieve KYC requests by status filter.
     */
    public function getKycByStatus(string $status): array {
        return $this->kycRepo->getAllByStatus($status);
    }

    /**
     * Review and verify a KYC document (Approve or Reject).
     *
     * @param int $kycId
     * @param string $status 'approved' or 'rejected'
     * @param string|null $notes Admin feedback / rejection reason
     * @param int $adminId ID of the reviewing administrator
     * @return array
     */
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

    /**
     * Verify all KYC documents for a worker at once (NIC, Police Report, Selfie packet).
     */
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

    /**
     * Retrieve platform analytics for charts.
     */
    public function getAnalytics(): array {
        $labels = [];
        $monthsKeys = [];
        $now = new DateTime('first day of this month');

        for ($i = 7; $i >= 0; $i--) {
            $dt = clone $now;
            $dt->modify("-$i month");
            $ym = $dt->format('Y-m');
            $monthsKeys[] = $ym;
            $labels[] = $dt->format('M');
        }

        $registrations = array_fill_keys($monthsKeys, 0);
        $jobs = array_fill_keys($monthsKeys, 0);
        $revenue = array_fill_keys($monthsKeys, 0.0);

        // 1. Worker registrations per month (COUNT of users WHERE role = 'worker', grouped by DATE_FORMAT(created_at, '%Y-%m'))
        $workerStmt = $this->db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS count
            FROM users
            WHERE role = 'worker'
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ");
        while ($row = $workerStmt->fetch(PDO::FETCH_ASSOC)) {
            if (isset($registrations[$row['ym']])) {
                $registrations[$row['ym']] = (int)$row['count'];
            }
        }

        // 2. Job requests per month (COUNT of job_requests grouped the same way)
        $jobsStmt = $this->db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS count
            FROM job_requests
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ");
        while ($row = $jobsStmt->fetch(PDO::FETCH_ASSOC)) {
            if (isset($jobs[$row['ym']])) {
                $jobs[$row['ym']] = (int)$row['count'];
            }
        }

        // 3. Revenue per month (SUM of amount from subscription_payments WHERE status = 'completed', grouped the same way)
        $revStmt = $this->db->query("
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, SUM(amount) AS total
            FROM subscription_payments
            WHERE status = 'completed'
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ");
        while ($row = $revStmt->fetch(PDO::FETCH_ASSOC)) {
            if (isset($revenue[$row['ym']])) {
                $revenue[$row['ym']] = (float)$row['total'];
            }
        }

        // 4. Worker counts per trade category (COUNT from worker_categories joined to categories, grouped by category name)
        $catStmt = $this->db->query("
            SELECT c.name, COUNT(wc.worker_id) AS count
            FROM worker_categories wc
            JOIN categories c ON wc.category_id = c.id
            GROUP BY c.name
            ORDER BY count DESC
        ");
        $categoryLabels = [];
        $categoryCounts = [];
        $categoryMap = [];
        while ($row = $catStmt->fetch(PDO::FETCH_ASSOC)) {
            $categoryLabels[] = $row['name'];
            $categoryCounts[] = (int)$row['count'];
            $categoryMap[$row['name']] = (int)$row['count'];
        }

        if (empty($categoryLabels)) {
            $allCatStmt = $this->db->query("SELECT name FROM categories ORDER BY id ASC");
            while ($row = $allCatStmt->fetch(PDO::FETCH_ASSOC)) {
                $categoryLabels[] = $row['name'];
                $categoryCounts[] = 0;
                $categoryMap[$row['name']] = 0;
            }
        }

        return [
            'labels'               => $labels,
            'worker_registrations' => array_values($registrations),
            'registrations'        => array_values($registrations),
            'job_requests'         => array_values($jobs),
            'jobs'                 => array_values($jobs),
            'revenue'              => array_values($revenue),
            'category_counts'      => $categoryMap,
            'categories'           => [
                'labels' => $categoryLabels,
                'data'   => $categoryCounts
            ],
            'category_labels'      => $categoryLabels,
            'category_data'        => $categoryCounts
        ];
    }
}
