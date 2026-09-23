<?php
// database/reset_messages.php
// Quick CLI or browser reset runner for test data

require_once __DIR__ . '/../config/Database.php';

try {
    $pdo = Database::getConnection();
    $sql = file_get_contents(__DIR__ . '/reset_and_seed_messages.sql');
    $pdo->exec($sql);

    $count = (int)$pdo->query("SELECT COUNT(*) FROM messages")->fetchColumn();

    if (php_sapi_name() === 'cli') {
        echo "SUCCESS: messages table reset and seeded with {$count} test records.\n";
    } else {
        header('Content-Type: application/json');
        echo json_encode([
            'status' => 'success',
            'message' => "messages table reset and seeded successfully with {$count} records."
        ], JSON_PRETTY_PRINT);
    }
} catch (Exception $e) {
    if (php_sapi_name() === 'cli') {
        echo "ERROR: " . $e->getMessage() . "\n";
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit(1);
}
