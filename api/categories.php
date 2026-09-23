<?php
// api/categories.php

require_once __DIR__ . '/../repositories/CategoryRepository.php';
require_once __DIR__ . '/../config/cors.php';

$repo = new CategoryRepository();
$categories = $repo->getAll();

sendJsonResponse(200, [
    'status'     => 'success',
    'categories' => $categories
]);
