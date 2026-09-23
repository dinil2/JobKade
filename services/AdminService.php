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
        if (!empty($doc['user_id'])) {
            $workerUserId = (int)$doc['user_id'];
            $notifTitle = ($status === 'approved') ? 'KYC Verification Approved 🎉' : 'KYC Verification Update ⚠️';
            $notifMsg = ($status === 'approved') 
                ? 'Congratulations! Your identity document has been verified. You now have the verified worker badge.'
                : 'Your KYC submission was rejected by administration. Reason: ' . $notes;

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
}
