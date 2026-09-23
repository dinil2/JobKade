-- ==========================================================
-- Job Kade: Verified Location-Based Marketplace
-- Database Schema for MySQL / MariaDB (phpMyAdmin)
-- Fully 3NF Normalized Schema matching Proposal CSE5015
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `jobkade_db`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `jobkade_db`;

-- 1. Users Table (Role-based: Customer, Worker, Administrator)
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `full_name` VARCHAR(100) NOT NULL,
    `username` VARCHAR(60) NOT NULL UNIQUE,
    `email` VARCHAR(191) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('customer', 'worker', 'admin') NOT NULL DEFAULT 'customer',
    `phone` VARCHAR(20) DEFAULT NULL,
    `address` VARCHAR(255) DEFAULT 'Colombo',
    `status` ENUM('active', 'suspended', 'pending') NOT NULL DEFAULT 'active',
    `notification_prefs` JSON DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Trade Categories Table (Electrician, Plumber, AC Tech, etc.)
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `slug` VARCHAR(100) NOT NULL UNIQUE,
    `icon` VARCHAR(50) DEFAULT 'bi-tools',
    `description` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Worker Profiles (Location, Verification, Service Area)
CREATE TABLE IF NOT EXISTS `worker_profiles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL UNIQUE,
    `bio` TEXT DEFAULT NULL,
    `service_radius_km` INT DEFAULT 15,
    `latitude` DECIMAL(10, 7) DEFAULT 6.9271000,
    `longitude` DECIMAL(10, 7) DEFAULT 79.8612000,
    `address` VARCHAR(255) DEFAULT 'Colombo, Western Province',
    `is_verified` TINYINT(1) DEFAULT 0,
    `verify_status` ENUM('unverified', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'unverified',
    `has_job_access` TINYINT(1) DEFAULT 0,
    `wallet_balance` DECIMAL(10,2) DEFAULT 0.00,
    `total_earnings` DECIMAL(10,2) DEFAULT 0.00,
    `total_commission_paid` DECIMAL(10,2) DEFAULT 0.00,
    `rating_avg` DECIMAL(3,2) DEFAULT 5.00,
    `reviews_count` INT DEFAULT 0,
    `working_hours` VARCHAR(100) DEFAULT '8:00 AM - 6:00 PM',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_worker_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Worker to Category Many-to-Many
CREATE TABLE IF NOT EXISTS `worker_categories` (
    `worker_id` INT NOT NULL,
    `category_id` INT NOT NULL,
    PRIMARY KEY (`worker_id`, `category_id`),
    CONSTRAINT `fk_wc_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_wc_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. KYC Documents (NIC, Driving License, Trade Certificates)
CREATE TABLE IF NOT EXISTS `kyc_documents` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `document_type` ENUM('nic', 'driving_license', 'trade_certificate', 'police_report') NOT NULL,
    `document_name` VARCHAR(255) NOT NULL,
    `document_path` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `rejection_reason` TEXT DEFAULT NULL,
    `admin_notes` TEXT DEFAULT NULL,
    `reviewed_by` INT DEFAULT NULL,
    `reviewed_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_kyc_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_kyc_admin` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    INDEX `idx_kyc_worker_status` (`worker_id`, `status`),
    INDEX `idx_kyc_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Structured Job Requests (Posted by Customers)
CREATE TABLE IF NOT EXISTS `job_requests` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT NOT NULL,
    `category_id` INT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `photo_path` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('open', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_job_customer` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_job_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Job Applications / Quotes (from verified, subscribed workers)
CREATE TABLE IF NOT EXISTS `job_applications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `job_id` INT NOT NULL,
    `worker_id` INT NOT NULL,
    `proposal_note` TEXT DEFAULT NULL,
    `quote_amount` DECIMAL(10,2) NOT NULL,
    `status` ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ja_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ja_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Subscription Plans for Workers
CREATE TABLE IF NOT EXISTS `subscription_plans` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(50) NOT NULL,
    `price` DECIMAL(10,2) NOT NULL,
    `duration_days` INT NOT NULL,
    `features` TEXT NOT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Worker Active Subscriptions
CREATE TABLE IF NOT EXISTS `worker_subscriptions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `plan_id` INT NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `status` ENUM('active', 'expired') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ws_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ws_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Subscription Payments & Digital Receipts
CREATE TABLE IF NOT EXISTS `subscription_payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `plan_id` INT NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `payment_method` VARCHAR(50) DEFAULT 'Online IPG (Card/Visa/Master)',
    `transaction_ref` VARCHAR(100) NOT NULL UNIQUE,
    `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
    `status` ENUM('completed', 'failed', 'pending') NOT NULL DEFAULT 'completed',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_sp_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sp_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. In-App Customer-Worker Messaging
CREATE TABLE IF NOT EXISTS `messages` (
    `msg_id` INT AUTO_INCREMENT PRIMARY KEY,
    `job_id` INT DEFAULT NULL,
    `sender_id` INT NOT NULL,
    `receiver_id` INT NOT NULL,
    `message_text` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE SET NULL,
    INDEX `idx_messages_sender_receiver` (`sender_id`, `receiver_id`),
    INDEX `idx_messages_receiver_sender` (`receiver_id`, `sender_id`),
    INDEX `idx_messages_job` (`job_id`),
    INDEX `idx_messages_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Ratings & Reviews
CREATE TABLE IF NOT EXISTS `reviews` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT NOT NULL,
    `worker_id` INT NOT NULL,
    `job_id` INT DEFAULT NULL,
    `rating` TINYINT NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
    `comment` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_rev_customer` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rev_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rev_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Worker Promotional Offers
CREATE TABLE IF NOT EXISTS `promotions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `discount_percent` INT DEFAULT 10,
    `valid_until` DATE NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_promo_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Notifications
CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(50) DEFAULT 'system',
    `is_read` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Job Invoices & Commission Settlement
CREATE TABLE IF NOT EXISTS `job_invoices` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `job_id` INT NOT NULL,
    `worker_id` INT NOT NULL,
    `customer_id` INT NOT NULL,
    `job_amount` DECIMAL(10,2) NOT NULL,
    `commission_rate` DECIMAL(4,2) NOT NULL DEFAULT 0.10,
    `commission_amount` DECIMAL(10,2) NOT NULL,
    `worker_net_amount` DECIMAL(10,2) NOT NULL,
    `payment_method` ENUM('online', 'cash') NOT NULL,
    `payment_status` ENUM('pending', 'paid', 'cancelled') NOT NULL DEFAULT 'pending',
    `notes` TEXT DEFAULT NULL,
    `paid_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_inv_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inv_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Worker Wallet Transactions Ledger
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `job_id` INT DEFAULT NULL,
    `invoice_id` INT DEFAULT NULL,
    `type` ENUM('online_credit', 'cash_commission_debit', 'access_fee', 'subscription_fee', 'withdrawal') NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `balance_after` DECIMAL(10,2) NOT NULL,
    `payment_method` ENUM('online', 'cash', 'system') NOT NULL DEFAULT 'system',
    `description` VARCHAR(255) NOT NULL,
    `transaction_ref` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_tx_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tx_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_tx_inv` FOREIGN KEY (`invoice_id`) REFERENCES `job_invoices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Worker Custom Services & Gig Listings
CREATE TABLE IF NOT EXISTS `worker_services` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `category_id` INT DEFAULT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `price` DECIMAL(10,2) NOT NULL DEFAULT 1500.00,
    `pricing_type` ENUM('hourly', 'fixed', 'starting_at') NOT NULL DEFAULT 'hourly',
    `location` VARCHAR(255) DEFAULT 'Colombo',
    `is_available` TINYINT(1) DEFAULT 1,
    `images` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_ws_worker_profile` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ws_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Worker Wallet Payout / Withdrawal Requests
CREATE TABLE IF NOT EXISTS `wallet_payout_requests` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `worker_id` INT NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `bank_name` VARCHAR(100) NOT NULL,
    `account_number` VARCHAR(50) NOT NULL,
    `account_name` VARCHAR(100) NOT NULL,
    `branch` VARCHAR(100) DEFAULT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'completed') NOT NULL DEFAULT 'pending',
    `admin_notes` TEXT DEFAULT NULL,
    `transaction_ref` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `processed_at` DATETIME DEFAULT NULL,
    CONSTRAINT `fk_payout_worker` FOREIGN KEY (`worker_id`) REFERENCES `worker_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SEED DATA (Default Accounts, Categories & Subscription Plans)
-- ==========================================================

-- Categories
INSERT INTO `categories` (`id`, `name`, `slug`, `icon`, `description`) VALUES
(1, 'Electrician', 'electrician', 'bi-lightning-charge', 'Wiring, breakers, lighting, appliance installation and power issues.'),
(2, 'Plumber', 'plumber', 'bi-droplet', 'Pipe leakage, drainage, bathroom fittings and water motor repairs.'),
(3, 'AC Technician', 'ac-technician', 'bi-snow', 'AC servicing, gas filling, repair and installation.'),
(4, 'Painter', 'painter', 'bi-brush', 'Interior, exterior painting, waterproofing and wall finishing.'),
(5, 'Carpenter', 'carpenter', 'bi-hammer', 'Furniture repair, door/window fittings, kitchen cabinets.'),
(6, 'Masonry & Tiling', 'masonry', 'bi-bricks', 'Floor tiling, plastering, bathroom renovations and masonry work.')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- Subscription Plans
INSERT INTO `subscription_plans` (`id`, `name`, `price`, `duration_days`, `features`, `is_active`) VALUES
(1, 'Monthly Plan', 3000.00, 30, '5% platform commission rate (Save 50%), Unlimited customer job board access, Verified worker priority badge, In-app direct messaging', 1),
(2, 'Yearly Plan', 30000.00, 365, '5% platform commission rate (Save 50%), 2 Months Free (Save Rs. 6,000), Top search and map ranking, Unlimited job applications, VIP support', 1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `price`=VALUES(`price`), `duration_days`=VALUES(`duration_days`), `features`=VALUES(`features`);

-- Seed Users:
-- Admin: admin@jobkade.lk / admin@123
-- Customer: customer@gmail.com / customer@123
-- Worker 1: sunil.electric@gmail.com / worker@123
-- Worker 2: kamal.plumber@gmail.com / worker@123
-- Worker 3: nimal.ac@gmail.com / worker@123
-- Note: bcrypt hashes for admin@123, customer@123, worker@123
INSERT INTO `users` (`id`, `full_name`, `username`, `email`, `password_hash`, `role`, `phone`, `status`) VALUES
(1, 'System Administrator', 'admin', 'admin@jobkade.lk', '$2y$10$8V35MBsXkedRl0xmTCTWLOmgiXeLb8c7ad9DUOaXP3TeynrqNr41a', 'admin', '0771234567', 'active'),
(2, 'Sasmitha Customer', 'customer', 'customer@gmail.com', '$2y$10$Jb8VEfdQ5upScS1uP7VTpelgTXq1g8DO7DB4t/1vMaHjjY/A0AOCy', 'customer', '0719876543', 'active'),
(3, 'Sunil Perera (Electrician)', 'sunilelectric', 'sunil.electric@gmail.com', '$2y$10$67KCe/AKNgcKslPkzoQpGuI5n15CljfXexA/GxCCKJlxH7pdP17QG', 'worker', '0751122334', 'active'),
(4, 'Kamal Silva (Plumber)', 'kamalplumber', 'kamal.plumber@gmail.com', '$2y$10$67KCe/AKNgcKslPkzoQpGuI5n15CljfXexA/GxCCKJlxH7pdP17QG', 'worker', '0764433221', 'active'),
(5, 'Nimal Fernando (AC Tech)', 'nimalac', 'nimal.ac@gmail.com', '$2y$10$67KCe/AKNgcKslPkzoQpGuI5n15CljfXexA/GxCCKJlxH7pdP17QG', 'worker', '0789988776', 'active')
ON DUPLICATE KEY UPDATE `email`=VALUES(`email`), `password_hash`=VALUES(`password_hash`);

-- Seed Worker Profiles (Centered in Colombo/Western Province for Leaflet.js Map)
INSERT INTO `worker_profiles` (`id`, `user_id`, `bio`, `service_radius_km`, `latitude`, `longitude`, `address`, `is_verified`, `verify_status`, `rating_avg`, `reviews_count`, `working_hours`) VALUES
(1, 3, 'Certified Master Electrician with 12+ years experience in commercial & domestic wiring, fault diagnosis, and solar installation.', 20, 6.9271, 79.8612, 'Colombo 03 (Kollupitiya)', 1, 'verified', 4.90, 18, '7:30 AM - 7:00 PM'),
(2, 4, 'Licensed Plumber specialized in leak detection, bathroom sanitary plumbing, water pumps, and high-pressure water systems.', 15, 6.8950, 79.8730, 'Bambalapitiya, Colombo 04', 1, 'verified', 4.85, 14, '8:00 AM - 6:00 PM'),
(3, 5, 'HVAC & Inverter Air Conditioner specialist. Deep chemical wash, PCB repairs, refrigerant charging, and energy-saving setups.', 25, 6.9015, 79.8550, 'Colombo 07 (Cinnamon Gardens)', 1, 'verified', 4.95, 22, '8:30 AM - 8:00 PM')
ON DUPLICATE KEY UPDATE `bio`=VALUES(`bio`), `verify_status`=VALUES(`verify_status`);

-- Seed Worker Categories
INSERT INTO `worker_categories` (`worker_id`, `category_id`) VALUES
(1, 1), -- Sunil -> Electrician
(2, 2), -- Kamal -> Plumber
(3, 3)  -- Nimal -> AC Tech
ON DUPLICATE KEY UPDATE `worker_id`=VALUES(`worker_id`);

-- Seed Active Subscriptions & Receipts
INSERT INTO `worker_subscriptions` (`id`, `worker_id`, `plan_id`, `start_date`, `end_date`, `status`) VALUES
(1, 1, 2, '2026-09-01', '2026-10-31', 'active'),
(2, 2, 2, '2026-09-01', '2026-10-31', 'active'),
(3, 3, 3, '2026-08-15', '2026-11-15', 'active')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

INSERT INTO `subscription_payments` (`id`, `worker_id`, `plan_id`, `amount`, `payment_method`, `transaction_ref`, `receipt_number`, `status`) VALUES
(1, 1, 2, 3000.00, 'IPG Visa/Mastercard', 'TXN-2026-0901-8812', 'RCPT-202609-001', 'completed'),
(2, 2, 2, 3000.00, 'IPG Visa/Mastercard', 'TXN-2026-0901-8813', 'RCPT-202609-002', 'completed'),
(3, 3, 3, 5500.00, 'IPG Visa/Mastercard', 'TXN-2026-0815-4421', 'RCPT-202608-099', 'completed')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- Seed KYC Documents
INSERT INTO `kyc_documents` (`id`, `worker_id`, `document_type`, `document_name`, `document_path`, `status`, `reviewed_by`, `reviewed_at`) VALUES
(1, 1, 'nic', 'National Identity Card (Front/Back)', 'uploads/kyc/nic_sunil.pdf', 'approved', 1, NOW()),
(2, 1, 'trade_certificate', 'NVQ Level 4 Electrical Engineering Certification', 'uploads/kyc/nvq_sunil.pdf', 'approved', 1, NOW()),
(3, 2, 'nic', 'National Identity Card', 'uploads/kyc/nic_kamal.pdf', 'approved', 1, NOW()),
(4, 3, 'nic', 'National Identity Card', 'uploads/kyc/nic_nimal.pdf', 'approved', 1, NOW())
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

