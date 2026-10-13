<?php
require_once __DIR__ . '/../config/Database.php';

$pdo = Database::getConnection();

$sqls = [
    "ALTER TABLE worker_profiles ADD COLUMN hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 1000.00",
    "ALTER TABLE worker_profiles ADD COLUMN travelling_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00",
    "ALTER TABLE job_requests ADD COLUMN worker_id INT NULL",
    "ALTER TABLE job_requests ADD COLUMN arrived_at DATETIME NULL",
    "ALTER TABLE job_requests ADD COLUMN completed_at DATETIME NULL",
    "ALTER TABLE job_invoices ADD COLUMN hours_worked DECIMAL(5,2) NULL DEFAULT NULL",
    "ALTER TABLE job_invoices ADD COLUMN travelling_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00"
];

foreach ($sqls as $sql) {
    try {
        $pdo->exec($sql);
        echo "Executed: " . $sql . PHP_EOL;
    } catch (PDOException $e) {
        // If column already exists (Error code 1060 / 42S21)
        if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
            echo "Skipped (already exists): " . $sql . PHP_EOL;
        } else {
            echo "Error executing '$sql': " . $e->getMessage() . PHP_EOL;
        }
    }
}
echo "Migration complete." . PHP_EOL;
