<?php
// database/apply_messages_migration.php
require_once __DIR__ . '/../config/Database.php';

try {
    $pdo = Database::getConnection();
    $sql = file_get_contents(__DIR__ . '/messages_migration.sql');
    $pdo->exec($sql);
    echo "SUCCESS: Messages migration applied successfully.\n";

    // Verify columns
    $stmt = $pdo->query("SHOW COLUMNS FROM messages");
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Columns in messages: " . implode(', ', $columns) . "\n";
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
