<?php
// api/locations.php
// Returns Sri Lanka districts and their corresponding cities as JSON.

header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/cors.php';

$locations = require __DIR__ . '/../config/locations.php';

$district = $_GET['district'] ?? null;

if ($district) {
    if (isset($locations[$district])) {
        echo json_encode([
            'status' => 'success',
            'district' => $district,
            'cities' => $locations[$district]
        ]);
    } else {
        http_response_code(404);
        echo json_encode([
            'status' => 'error',
            'message' => "District '{$district}' not found."
        ]);
    }
    exit();
}

echo json_encode([
    'status' => 'success',
    'districts' => array_keys($locations),
    'locations' => $locations
]);
