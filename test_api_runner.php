<?php
// test_api_runner.php
$action = $argv[1] ?? 'list';
$token = $argv[2] ?? '';
$getRaw = $argv[3] ?? '';
$postRaw = $argv[4] ?? '';

$get = !empty($getRaw) ? (json_decode(base64_decode($getRaw), true) ?: json_decode($getRaw, true) ?: []) : [];
$post = !empty($postRaw) ? (json_decode(base64_decode($postRaw), true) ?: json_decode($postRaw, true) ?: []) : [];

$_GET = $get;
$_GET['action'] = $action;
if (!empty($token)) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
}
if (!empty($post)) {
    $_POST = $post;
    $_SERVER['REQUEST_METHOD'] = 'POST';
} else {
    $_SERVER['REQUEST_METHOD'] = 'GET';
}

register_shutdown_function(function() {
    echo "\n__HTTP_STATUS__:" . http_response_code();
});

require __DIR__ . '/api/jobs.php';
