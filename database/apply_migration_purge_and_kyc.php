<?php
// database/apply_migration_purge_and_kyc.php

require_once __DIR__ . '/../config/Database.php';

try {
    $db = Database::getConnection();
    echo "Connected to MySQL database: jobkade_db\n";

    // 1. Drop hourly_rate from worker_profiles if present
    $cols = $db->query("SHOW COLUMNS FROM `worker_profiles` LIKE 'hourly_rate'")->fetchAll();
    if (!empty($cols)) {
        $db->exec("ALTER TABLE `worker_profiles` DROP COLUMN `hourly_rate`");
        echo "[SUCCESS] Dropped 'hourly_rate' column from 'worker_profiles'.\n";
    } else {
        echo "[INFO] 'hourly_rate' column was already absent from 'worker_profiles'.\n";
    }

    // 2. Add verify_status to worker_profiles if not present
    $cols = $db->query("SHOW COLUMNS FROM `worker_profiles` LIKE 'verify_status'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE `worker_profiles` ADD COLUMN `verify_status` ENUM('unverified', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'unverified' AFTER `is_verified`");
        echo "[SUCCESS] Added 'verify_status' ENUM to 'worker_profiles'.\n";
    } else {
        echo "[INFO] 'verify_status' column already exists in 'worker_profiles'.\n";
    }

    // Synchronize verify_status with is_verified
    $updatedProfiles = $db->exec("UPDATE `worker_profiles` SET `verify_status` = 'verified' WHERE `is_verified` = 1 AND `verify_status` = 'unverified'");
    echo "[INFO] Synchronized verify_status for $updatedProfiles existing verified worker profiles.\n";

    // 3. Ensure file_path and admin_notes exist in kyc_documents
    $cols = $db->query("SHOW COLUMNS FROM `kyc_documents` LIKE 'file_path'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE `kyc_documents` ADD COLUMN `file_path` VARCHAR(255) NULL AFTER `document_path`");
        echo "[SUCCESS] Added 'file_path' to 'kyc_documents'.\n";
    } else {
        echo "[INFO] 'file_path' column already exists in 'kyc_documents'.\n";
    }

    $cols = $db->query("SHOW COLUMNS FROM `kyc_documents` LIKE 'admin_notes'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE `kyc_documents` ADD COLUMN `admin_notes` TEXT NULL AFTER `rejection_reason`");
        echo "[SUCCESS] Added 'admin_notes' to 'kyc_documents'.\n";
    } else {
        echo "[INFO] 'admin_notes' column already exists in 'kyc_documents'.\n";
    }

    // Sync values
    $db->exec("UPDATE `kyc_documents` SET `file_path` = `document_path` WHERE `file_path` IS NULL OR `file_path` = ''");
    $db->exec("UPDATE `kyc_documents` SET `admin_notes` = `rejection_reason` WHERE `admin_notes` IS NULL");
    echo "[SUCCESS] Synchronized file_path and admin_notes in 'kyc_documents'.\n";

    // 4. Ensure composite and single indexes for performance
    try {
        $db->exec("CREATE INDEX idx_kyc_worker_status ON `kyc_documents` (`worker_id`, `status`)");
        echo "[SUCCESS] Created index idx_kyc_worker_status.\n";
    } catch (PDOException $e) {
        // Index might already exist
        echo "[INFO] Index idx_kyc_worker_status exists or noted.\n";
    }

    try {
        $db->exec("CREATE INDEX idx_kyc_status ON `kyc_documents` (`status`)");
        echo "[SUCCESS] Created index idx_kyc_status.\n";
    } catch (PDOException $e) {
        echo "[INFO] Index idx_kyc_status exists or noted.\n";
    }

    echo "\n=== MIGRATION COMPLETED SUCCESSFULLY ===\n";

} catch (Exception $e) {
    echo "[ERROR] Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
