<?php
// api/register.php
require_once __DIR__ . '/../controllers/AuthController.php';
$controller = new AuthController();
$controller->register();
