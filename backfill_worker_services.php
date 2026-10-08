<?php
/**
 * Backfill missing initial services for existing workers in JobKade.
 *
 * Finds every worker in worker_profiles who has NO rows in worker_services,
 * reads their primary category from worker_categories (where is_primary = 1,
 * or the first category if none is marked primary), and inserts one service
 * record into worker_services with the category name as title, a default description,
 * price 0, pricing_type 'fixed', location and district from the worker's profile,
 * and is_available = 1.
 *
 * Safe to run multiple times (idempotent) and safe to delete after running.
 */

// Support execution via CLI or browser
if (php_sapi_name() !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

require_once __DIR__ . '/config/Database.php';

try {
    $db = Database::getConnection();

    echo "====================================================\n";
    echo " JobKade — Backfill Initial Services for Workers\n";
    echo "====================================================\n\n";

    // 1. Find all worker_profiles who have NO rows in worker_services
    $query = "
        SELECT wp.id AS worker_id, wp.user_id, wp.address, wp.district, u.full_name
        FROM worker_profiles wp
        LEFT JOIN users u ON wp.user_id = u.id
        WHERE NOT EXISTS (
            SELECT 1 FROM worker_services ws WHERE ws.worker_id = wp.id
        )
        ORDER BY wp.id ASC
    ";

    $stmt = $db->query($query);
    $workersToBackfill = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $totalEligible = count($workersToBackfill);
    echo "Found {$totalEligible} worker(s) without any services in worker_services.\n\n";

    if ($totalEligible === 0) {
        echo "No workers need backfilling. All existing workers already have services!\n";
        exit(0);
    }

    // 2. Prepare category lookup: reads primary category where is_primary = 1,
    // or the first category if none is marked primary.
    $catStmt = $db->prepare("
        SELECT c.id, c.name 
        FROM worker_categories wc
        JOIN categories c ON wc.category_id = c.id
        WHERE wc.worker_id = :wid
        ORDER BY wc.is_primary DESC, wc.category_id ASC
        LIMIT 1
    ");

    // Fallback category if worker has no rows in worker_categories (e.g. Electrical: 1)
    $fallbackCatStmt = $db->query("SELECT id, name FROM categories ORDER BY id ASC LIMIT 1");
    $fallbackCat = $fallbackCatStmt->fetch(PDO::FETCH_ASSOC) ?: ['id' => 1, 'name' => 'General Service'];

    // 3. Prepare insert statement for worker_services
    $insertStmt = $db->prepare("
        INSERT INTO worker_services (
            worker_id,
            category_id,
            title,
            description,
            price,
            pricing_type,
            location,
            district,
            is_available,
            created_at
        ) VALUES (
            :worker_id,
            :category_id,
            :title,
            :description,
            :price,
            :pricing_type,
            :location,
            :district,
            :is_available,
            NOW()
        )
    ");

    // Double-check statement for idempotence check before insert
    $checkExistingStmt = $db->prepare("SELECT COUNT(*) FROM worker_services WHERE worker_id = :wid");

    $backfilledCount = 0;
    $skippedCount = 0;

    foreach ($workersToBackfill as $w) {
        $workerId = (int)$w['worker_id'];
        $workerName = $w['full_name'] ?: "Worker #{$workerId}";

        // Idempotence safeguard: skip worker if they already have services
        $checkExistingStmt->execute([':wid' => $workerId]);
        if ((int)$checkExistingStmt->fetchColumn() > 0) {
            echo "[SKIP] Worker #{$workerId} ({$workerName}) already has services.\n";
            $skippedCount++;
            continue;
        }

        // Read primary category (is_primary = 1 or first category)
        $catStmt->execute([':wid' => $workerId]);
        $primaryCat = $catStmt->fetch(PDO::FETCH_ASSOC);

        if (!$primaryCat) {
            $catId = (int)$fallbackCat['id'];
            $catName = $fallbackCat['name'];
            try {
                $db->prepare("INSERT IGNORE INTO worker_categories (worker_id, category_id, is_primary) VALUES (:wid, :cid, 1)")
                   ->execute([':wid' => $workerId, ':cid' => $catId]);
            } catch (Throwable $e) {}
        } else {
            $catId = (int)$primaryCat['id'];
            $catName = $primaryCat['name'];
        }

        // District and location from worker's profile
        $district = trim((string)($w['district'] ?? ''));
        if (empty($district)) {
            $district = trim((string)($w['address'] ?? ''));
        }
        if (empty($district)) {
            $district = 'Colombo';
        }

        $location = !empty($w['address']) ? $w['address'] : $district;
        $title = $catName;
        $description = "Professional {$catName} services in {$district} and surrounding areas.";
        $price = 0.00;
        $pricingType = 'fixed';
        $isAvailable = 1;

        $insertStmt->execute([
            ':worker_id'    => $workerId,
            ':category_id'  => $catId,
            ':title'        => $title,
            ':description'  => $description,
            ':price'        => $price,
            ':pricing_type' => $pricingType,
            ':location'     => $location,
            ':district'     => $district,
            ':is_available' => $isAvailable
        ]);

        $backfilledCount++;
        echo "[OK] Backfilled Worker #{$workerId} ({$workerName}) -> Category: '{$catName}' (ID: {$catId}), District: '{$district}', Price: Rs. 0.00\n";
    }

    echo "\n----------------------------------------------------\n";
    echo "Backfill finished successfully!\n";
    echo "  Total examined: {$totalEligible}\n";
    echo "  Successfully inserted: {$backfilledCount}\n";
    echo "  Skipped: {$skippedCount}\n";
    echo "----------------------------------------------------\n";

} catch (Throwable $e) {
    echo "\n[ERROR] An error occurred during backfill:\n" . $e->getMessage() . "\n";
    exit(1);
}
