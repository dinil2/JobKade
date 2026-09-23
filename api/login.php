<?php
// api/login.php
require_once __DIR__ . '/../controllers/AuthController.php';
$controller = new AuthController();
$controller->login();
