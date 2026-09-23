<?php
// api/test_db.php

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../config/Database.php';

try {
    $pdo = Database::getConnection();
    
    // Check MySQL version
    $versionStmt = $pdo->query("SELECT VERSION() as version");
    $version = $versionStmt->fetch()['version'] ?? 'Unknown';

    // Check users table count
    $countStmt = $pdo->query("SELECT COUNT(*) as user_count FROM users");
    $userCount = (int)($countStmt->fetch()['user_count'] ?? 0);

    echo json_encode([
        'status' => 'success',
        'message' => 'Connected to MySQL successfully! phpMyAdmin and PHP backend are properly configured.',
        'database' => Database::getConfig()['dbname'],
        'mysql_version' => $version,
        'users_in_db' => $userCount,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Could not connect to database: ' . $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
