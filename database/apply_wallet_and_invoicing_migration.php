<?php
// database/apply_wallet_and_invoicing_migration.php
require_once __DIR__ . "/../config/Database.php";

try {
    $db = Database::getConnection();
    echo "Connected to MySQL successfully.\n";

    // 1. Add wallet and job access columns to worker_profiles if they do not exist
    $cols = $db->query("SHOW COLUMNS FROM worker_profiles")->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array("has_job_access", $cols)) {
        $db->exec("ALTER TABLE worker_profiles ADD COLUMN has_job_access TINYINT(1) DEFAULT 0 AFTER verify_status");
        echo "Added has_job_access to worker_profiles.\n";
    }

    if (!in_array("wallet_balance", $cols)) {
        $db->exec("ALTER TABLE worker_profiles ADD COLUMN wallet_balance DECIMAL(10,2) DEFAULT 0.00 AFTER has_job_access");
        echo "Added wallet_balance to worker_profiles.\n";
    }

    if (!in_array("total_earnings", $cols)) {
        $db->exec("ALTER TABLE worker_profiles ADD COLUMN total_earnings DECIMAL(10,2) DEFAULT 0.00 AFTER wallet_balance");
        echo "Added total_earnings to worker_profiles.\n";
    }

    if (!in_array("total_commission_paid", $cols)) {
        $db->exec("ALTER TABLE worker_profiles ADD COLUMN total_commission_paid DECIMAL(10,2) DEFAULT 0.00 AFTER total_earnings");
        echo "Added total_commission_paid to worker_profiles.\n";
    }

    // 2. Create job_invoices table
    $db->exec("
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
            CONSTRAINT `fk_inv_customer` FOREIGN KEY (`customer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
            INDEX `idx_inv_job` (`job_id`),
            INDEX `idx_inv_worker` (`worker_id`),
            INDEX `idx_inv_customer` (`customer_id`),
            INDEX `idx_inv_status` (`payment_status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "Created/verified job_invoices table.\n";

    // 3. Create wallet_transactions table
    $db->exec("
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
            CONSTRAINT `fk_tx_inv` FOREIGN KEY (`invoice_id`) REFERENCES `job_invoices` (`id`) ON DELETE SET NULL,
            INDEX `idx_tx_worker` (`worker_id`),
            INDEX `idx_tx_type` (`type`),
            INDEX `idx_tx_created` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "Created/verified wallet_transactions table.\n";

    echo "Migration completed successfully!\n";
} catch (Exception $e) {
    echo "Migration error: " . $e->getMessage() . "\n";
    exit(1);
}

