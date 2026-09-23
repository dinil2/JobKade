-- database/migration_purge_hourly_rate_and_kyc.sql
-- Purges hourly_rate attribute and enhances KYC verification schema

-- 1. Drop hourly_rate from worker_profiles if it exists
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'worker_profiles' 
  AND COLUMN_NAME = 'hourly_rate';

SET @stmt = IF(@col_exists > 0, 'ALTER TABLE `worker_profiles` DROP COLUMN `hourly_rate`', 'SELECT "hourly_rate column already removed"');
PREPARE drop_hourly_rate FROM @stmt;
EXECUTE drop_hourly_rate;
DEALLOCATE PREPARE drop_hourly_rate;

-- 2. Add verify_status to worker_profiles if it does not exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'worker_profiles' 
  AND COLUMN_NAME = 'verify_status';

SET @stmt = IF(@col_exists = 0, 'ALTER TABLE `worker_profiles` ADD COLUMN `verify_status` ENUM(\'unverified\', \'pending\', \'verified\', \'rejected\') NOT NULL DEFAULT \'unverified\' AFTER `is_verified`', 'SELECT "verify_status column already exists"');
PREPARE add_verify_status FROM @stmt;
EXECUTE add_verify_status;
DEALLOCATE PREPARE add_verify_status;

-- Synchronize verify_status with is_verified for existing profiles
UPDATE `worker_profiles` 
SET `verify_status` = 'verified' 
WHERE `is_verified` = 1 AND `verify_status` = 'unverified';

-- 3. Enhance kyc_documents table with file_path and admin_notes
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'kyc_documents' 
  AND COLUMN_NAME = 'file_path';

SET @stmt = IF(@col_exists = 0, 'ALTER TABLE `kyc_documents` ADD COLUMN `file_path` VARCHAR(255) NULL AFTER `document_path`', 'SELECT "file_path column already exists"');
PREPARE add_file_path FROM @stmt;
EXECUTE add_file_path;
DEALLOCATE PREPARE add_file_path;

SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'kyc_documents' 
  AND COLUMN_NAME = 'admin_notes';

SET @stmt = IF(@col_exists = 0, 'ALTER TABLE `kyc_documents` ADD COLUMN `admin_notes` TEXT NULL AFTER `rejection_reason`', 'SELECT "admin_notes column already exists"');
PREPARE add_admin_notes FROM @stmt;
EXECUTE add_admin_notes;
DEALLOCATE PREPARE add_admin_notes;

-- Populate synchronized columns for any legacy records
UPDATE `kyc_documents` SET `file_path` = `document_path` WHERE `file_path` IS NULL OR `file_path` = '';
UPDATE `kyc_documents` SET `admin_notes` = `rejection_reason` WHERE `admin_notes` IS NULL;
UPDATE `kyc_documents` SET `document_path` = `file_path` WHERE `document_path` IS NULL OR `document_path` = '';
UPDATE `kyc_documents` SET `rejection_reason` = `admin_notes` WHERE `rejection_reason` IS NULL;
