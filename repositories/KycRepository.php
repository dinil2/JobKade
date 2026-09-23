<?php
// repositories/KycRepository.php

require_once __DIR__ . '/../config/Database.php';

class KycRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    /**
     * Create a new KYC verification document record.
     */
    public function createKycRecord(int $workerId, string $docType, string $docName, string $filePath): int {
        $stmt = $this->db->prepare("
            INSERT INTO kyc_documents (worker_id, document_type, document_name, document_path, file_path, status)
            VALUES (:worker_id, :doc_type, :doc_name, :doc_path, :file_path, 'pending')
        ");
        $stmt->execute([
            ':worker_id' => $workerId,
            ':doc_type'  => $docType,
            ':doc_name'  => $docName,
            ':doc_path'  => $filePath,
            ':file_path' => $filePath
        ]);
        return (int)$this->db->lastInsertId();
    }

    /**
     * Backward-compatible alias for createKycRecord.
     */
    public function submitDocument(int $workerId, string $docType, string $docName, string $docPath): int {
        return $this->createKycRecord($workerId, $docType, $docName, $docPath);
    }

    /**
     * Retrieve all KYC documents for a specific worker.
     */
    public function getDocumentsByWorkerId(int $workerId): array {
        $stmt = $this->db->prepare("
            SELECT 
                kd.id AS kyc_id,
                kd.id,
                kd.worker_id,
                kd.document_type,
                kd.document_name,
                COALESCE(kd.file_path, kd.document_path) AS file_path,
                COALESCE(kd.document_path, kd.file_path) AS document_path,
                kd.status,
                COALESCE(kd.admin_notes, kd.rejection_reason) AS admin_notes,
                COALESCE(kd.rejection_reason, kd.admin_notes) AS rejection_reason,
                kd.reviewed_by,
                kd.reviewed_at,
                kd.created_at,
                u.full_name AS reviewed_by_name
            FROM kyc_documents kd
            LEFT JOIN users u ON kd.reviewed_by = u.id
            WHERE kd.worker_id = :worker_id
            ORDER BY kd.created_at DESC
        ");
        $stmt->execute([':worker_id' => $workerId]);
        return $stmt->fetchAll();
    }

    /**
     * Backward-compatible alias for getDocumentsByWorkerId.
     */
    public function getDocumentsByWorker(int $workerId): array {
        return $this->getDocumentsByWorkerId($workerId);
    }

    /**
     * Retrieve the latest KYC record and computed status for a worker.
     */
    public function getLatestStatusByWorker(int $workerId): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                kd.id AS kyc_id,
                kd.id,
                kd.worker_id,
                kd.document_type,
                kd.document_name,
                COALESCE(kd.file_path, kd.document_path) AS file_path,
                kd.status,
                COALESCE(kd.admin_notes, kd.rejection_reason) AS admin_notes,
                kd.created_at,
                kd.reviewed_at,
                wp.is_verified,
                wp.verify_status
            FROM kyc_documents kd
            JOIN worker_profiles wp ON kd.worker_id = wp.id
            WHERE kd.worker_id = :worker_id
            ORDER BY kd.created_at DESC
            LIMIT 1
        ");
        $stmt->execute([':worker_id' => $workerId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Retrieve a single KYC document by ID.
     */
    public function getDocumentById(int $id): ?array {
        $stmt = $this->db->prepare("
            SELECT 
                kd.*,
                kd.id AS kyc_id,
                COALESCE(kd.file_path, kd.document_path) AS file_path,
                COALESCE(kd.admin_notes, kd.rejection_reason) AS admin_notes,
                wp.user_id,
                wp.is_verified,
                wp.verify_status,
                u.full_name AS worker_name,
                u.email AS worker_email,
                u.phone AS worker_phone
            FROM kyc_documents kd
            JOIN worker_profiles wp ON kd.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            WHERE kd.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $doc = $stmt->fetch();
        return $doc ?: null;
    }

    /**
     * Retrieve all pending KYC documents for moderation with worker information.
     */
    public function getPendingKycList(): array {
        $stmt = $this->db->query("
            SELECT 
                kd.id AS kyc_id,
                kd.id,
                kd.worker_id,
                kd.document_type,
                kd.document_name,
                COALESCE(kd.file_path, kd.document_path) AS file_path,
                COALESCE(kd.document_path, kd.file_path) AS document_path,
                kd.status,
                kd.created_at,
                wp.id AS worker_profile_id,
                wp.is_verified,
                wp.verify_status,
                u.id AS user_id,
                u.full_name AS worker_name,
                u.email AS worker_email,
                u.phone AS worker_phone,
                GROUP_CONCAT(c.name SEPARATOR ', ') AS categories
            FROM kyc_documents kd
            JOIN worker_profiles wp ON kd.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            LEFT JOIN worker_categories wc ON wp.id = wc.worker_id
            LEFT JOIN categories c ON wc.category_id = c.id
            WHERE kd.status = 'pending'
            GROUP BY kd.id
            ORDER BY kd.created_at ASC
        ");
        return $stmt->fetchAll();
    }

    /**
     * Retrieve KYC documents filtered by status.
     */
    public function getAllByStatus(string $status = 'pending'): array {
        $stmt = $this->db->prepare("
            SELECT 
                kd.id AS kyc_id,
                kd.id,
                kd.worker_id,
                kd.document_type,
                kd.document_name,
                COALESCE(kd.file_path, kd.document_path) AS file_path,
                COALESCE(kd.document_path, kd.file_path) AS document_path,
                kd.status,
                COALESCE(kd.admin_notes, kd.rejection_reason) AS admin_notes,
                kd.created_at,
                kd.reviewed_at,
                u.full_name AS worker_name,
                u.email AS worker_email,
                u.phone AS worker_phone,
                admin_u.full_name AS reviewed_by_name,
                GROUP_CONCAT(c.name SEPARATOR ', ') AS categories
            FROM kyc_documents kd
            JOIN worker_profiles wp ON kd.worker_id = wp.id
            JOIN users u ON wp.user_id = u.id
            LEFT JOIN users admin_u ON kd.reviewed_by = admin_u.id
            LEFT JOIN worker_categories wc ON wp.id = wc.worker_id
            LEFT JOIN categories c ON wc.category_id = c.id
            WHERE kd.status = :status
            GROUP BY kd.id
            ORDER BY kd.created_at DESC
        ");
        $stmt->execute([':status' => $status]);
        return $stmt->fetchAll();
    }

    /**
     * Backward-compatible alias for getPendingKycList.
     */
    public function getAllPending(): array {
        return $this->getPendingKycList();
    }

    /**
     * Update KYC status and synchronize document columns.
     */
    public function updateKycStatus(int $kycId, string $status, ?string $notes, int $adminId): bool {
        $stmt = $this->db->prepare("
            UPDATE kyc_documents
            SET 
                status = :status,
                rejection_reason = :reason,
                admin_notes = :notes,
                reviewed_by = :admin_id,
                reviewed_at = NOW()
            WHERE id = :id
        ");
        return $stmt->execute([
            ':status'   => $status,
            ':reason'   => $notes,
            ':notes'    => $notes,
            ':admin_id' => $adminId,
            ':id'       => $kycId
        ]);
    }

    /**
     * Backward-compatible reviewDocument method.
     */
    public function reviewDocument(int $docId, string $status, ?string $reason, int $adminId): bool {
        return $this->updateKycStatus($docId, $status, $reason, $adminId);
    }
}
