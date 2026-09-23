<?php
// database/apply_enhancements_migration.php
// Creates worker_services, wallet_payout_requests, and adds user preferences support.

require_once __DIR__ . '/../config/Database.php';

try {
    $pdo = Database::getConnection();
    echo "Connecting to MySQL database...\n";

    // 1. worker_services table for custom gigs / service listings
    $pdo->exec("
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
    ");
    echo "[OK] worker_services table created or verified.\n";

    // 2. wallet_payout_requests table for bank withdrawals
    $pdo->exec("
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
    ");
    echo "[OK] wallet_payout_requests table created or verified.\n";

    // 3. Add notification_prefs and address columns to users table if missing
    $cols = $pdo->query("SHOW COLUMNS FROM users LIKE 'notification_prefs'")->fetchAll();
    if (empty($cols)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `notification_prefs` JSON DEFAULT NULL AFTER `status`");
        echo "[OK] Added notification_prefs to users table.\n";
    }

    $cols = $pdo->query("SHOW COLUMNS FROM users LIKE 'address'")->fetchAll();
    if (empty($cols)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `address` VARCHAR(255) DEFAULT 'Colombo' AFTER `phone`");
        echo "[OK] Added address to users table.\n";
    }

    echo "\nAll enhancements applied to database successfully!\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
