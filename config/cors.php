<?php
// config/cors.php

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/**
 * Send standard JSON response and terminate.
 */
function sendJsonResponse(int $statusCode, array $data): void {
    http_response_code($statusCode);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
    }
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit();
}

/**
 * Get request body as associative array (JSON or Form POST)
 */
function getRequestData(): array {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json) && !empty($json)) {
        return $json;
    }
    return $_POST;
}
