<?php
// services/KycService.php

require_once __DIR__ . '/../repositories/KycRepository.php';
require_once __DIR__ . '/../repositories/WorkerRepository.php';

class KycService {
    private KycRepository $kycRepo;
    private WorkerRepository $workerRepo;
    private const MAX_FILE_SIZE = 5242880; // 5 MB in bytes
    private const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
    private const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/pjpeg'
    ];

    public function __construct() {
        $this->kycRepo = new KycRepository();
        $this->workerRepo = new WorkerRepository();
    }

    /**
     * Submit a KYC document for worker verification.
     * Supports either an uploaded $_FILES array or a pre-uploaded/provided file path.
     */
    public function submitDocument(int $workerId, array $data, ?array $file = null): array {
        if ($workerId <= 0) {
            throw new InvalidArgumentException("Invalid worker ID provided.");
        }

        // Validate worker existence
        $profile = $this->workerRepo->getProfileById($workerId);
        if (!$profile) {
            throw new InvalidArgumentException("Worker profile not found.");
        }

        $docType = strtolower(trim((string)($data['document_type'] ?? 'nic')));
        $validTypes = ['nic', 'driving_license', 'trade_certificate', 'police_report'];
        if (!in_array($docType, $validTypes, true)) {
            $docType = 'nic';
        }

        $docName = trim(strip_tags((string)($data['document_name'] ?? '')));
        if (empty($docName)) {
            $docName = strtoupper($docType) . " Document";
        }

        $filePath = null;

        // 1. Handle uploaded file if present
        if ($file && isset($file['error']) && $file['error'] !== UPLOAD_ERR_NO_FILE) {
            if ($file['error'] !== UPLOAD_ERR_OK) {
                throw new RuntimeException("File upload failed with error code: " . $file['error']);
            }

            if ($file['size'] > self::MAX_FILE_SIZE) {
                throw new InvalidArgumentException("File size exceeds 5MB limit. Please upload a smaller file.");
            }

            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
                throw new InvalidArgumentException("Invalid file format. Allowed formats: PDF, PNG, JPG, JPEG.");
            }

            // Verify MIME type using finfo if available
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mimeType = finfo_file($finfo, $file['tmp_name']);
                finfo_close($finfo);
                if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
                    throw new InvalidArgumentException("Security check failed: Invalid file MIME type ($mimeType).");
                }
            }

            $uploadDir = __DIR__ . '/../uploads/kyc';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $uniqueName = 'kyc_' . $workerId . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
            $destination = $uploadDir . '/' . $uniqueName;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                throw new RuntimeException("Failed to save uploaded document to server.");
            }

            $filePath = 'uploads/kyc/' . $uniqueName;
        } elseif (!empty($data['file_path']) || !empty($data['document_path'])) {
            // Provided file path
            $filePath = trim((string)($data['file_path'] ?? $data['document_path']));
        } else {
            // Default placeholder path for mock / test payload
            $filePath = 'uploads/kyc/doc_sample_' . time() . '.pdf';
        }

        // Persist record
        $docId = $this->kycRepo->createKycRecord($workerId, $docType, $docName, $filePath);

        // Update worker profile verification status to 'pending'
        $this->workerRepo->updateVerificationStatus($workerId, 'pending');

        return [
            'status'      => 'success',
            'message'     => 'KYC document submitted successfully and pending admin approval!',
            'document_id' => $docId,
            'kyc_id'      => $docId,
            'file_path'   => $filePath,
            'verify_status' => 'pending'
        ];
    }

    /**
     * Retrieve all documents for a worker with human-friendly descriptions.
     */
    public function getWorkerDocuments(int $workerId): array {
        return $this->kycRepo->getDocumentsByWorkerId($workerId);
    }

    /**
     * Get computed KYC status summary for a worker.
     */
    public function getWorkerStatus(int $workerId): array {
        $profile = $this->workerRepo->getProfileById($workerId);
        if (!$profile) {
            return [
                'is_verified'   => false,
                'verify_status' => 'unverified',
                'status_label'  => 'Action Required',
                'documents'     => []
            ];
        }

        $docs = $this->kycRepo->getDocumentsByWorkerId($workerId);
        $verifyStatus = $profile['verify_status'] ?? ($profile['is_verified'] ? 'verified' : 'unverified');

        $statusLabel = match ($verifyStatus) {
            'verified' => 'Verified',
            'pending'  => 'Pending Approval',
            'rejected' => 'Action Required (Rejected)',
            default    => 'Not Submitted'
        };

        return [
            'is_verified'   => (bool)$profile['is_verified'],
            'verify_status' => $verifyStatus,
            'status_label'  => $statusLabel,
            'documents'     => $docs
        ];
    }

    public function getAllPending(): array {
        return $this->kycRepo->getPendingKycList();
    }

    public function review(int $docId, string $status, ?string $reason, int $adminId): bool {
        return $this->kycRepo->updateKycStatus($docId, $status, $reason, $adminId);
    }
}
