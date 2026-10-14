<?php
require_once __DIR__ . '/config/Database.php';

try {
    $pdo = Database::getConnection();

    // 1. Create worker_coverage table
    $sql1 = "CREATE TABLE IF NOT EXISTS worker_coverage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        worker_id INT NOT NULL,
        district VARCHAR(100) NOT NULL,
        city VARCHAR(100) NOT NULL,
        CONSTRAINT fk_coverage_worker FOREIGN KEY (worker_id) REFERENCES worker_profiles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql1);
    echo "[SUCCESS] worker_coverage table created or exists.\n";

    // 2. Add city column to job_requests if not exists
    $columns = $pdo->query("SHOW COLUMNS FROM job_requests LIKE 'city'")->fetchAll();
    if (empty($columns)) {
        $pdo->exec("ALTER TABLE job_requests ADD COLUMN city VARCHAR(100) NULL AFTER district");
        echo "[SUCCESS] Added 'city' column to job_requests.\n";
    } else {
        echo "[INFO] 'city' column already exists in job_requests.\n";
    }

    // 3. For existing worker_profiles, if they have no worker_coverage row, add an 'ALL' row for their district
    $workers = $pdo->query("SELECT id, district FROM worker_profiles")->fetchAll();
    $insertStmt = $pdo->prepare("INSERT INTO worker_coverage (worker_id, district, city) VALUES (?, ?, ?)");
    $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM worker_coverage WHERE worker_id = ?");

    foreach ($workers as $w) {
        $checkStmt->execute([$w['id']]);
        if ($checkStmt->fetchColumn() == 0) {
            $dist = !empty($w['district']) ? $w['district'] : 'Colombo';
            $insertStmt->execute([$w['id'], $dist, 'ALL']);
            echo "[INFO] Added default ALL coverage for worker #{$w['id']} in {$dist}.\n";
        }
    }

    // 4. Update existing job_requests that have null city to a sensible default or extracted city
    $pdo->exec("UPDATE job_requests SET city = 'Colombo' WHERE (city IS NULL OR city = '') AND (district = 'Colombo' OR district IS NULL)");

    echo "[DONE] Coverage migration completed successfully.\n";
} catch (Exception $e) {
    echo "[ERROR] Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
