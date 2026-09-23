<?php
// controllers/AuthController.php

require_once __DIR__ . '/../services/AuthService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class AuthController {
    private AuthService $authService;

    public function __construct() {
        $this->authService = new AuthService();
    }

    public function register(): void {
        $data = getRequestData();
        if (!empty($_POST)) {
            $data = array_merge($data, $_POST);
        }
        $files = !empty($_FILES) ? $_FILES : null;

        try {
            $res = $this->authService->register($data, $files);
            sendJsonResponse(201, $res);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(409, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function login(): void {
        $data = getRequestData();
        $email = $data['email'] ?? $data['Email'] ?? '';
        $password = $data['password'] ?? $data['Password'] ?? '';

        try {
            $res = $this->authService->login($email, $password);
            sendJsonResponse(200, $res);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(401, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function me(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Unauthorized. Please provide a valid Bearer token.']);
        }
        $fullUser = $this->authService->me($user['user_id']);
        sendJsonResponse(200, ['status' => 'success', 'user' => $fullUser]);
    }

    public function updateProfile(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Unauthorized. Please login first.']);
        }

        $data = getRequestData();
        try {
            $res = $this->authService->updateProfile((int)$user['user_id'], $data);
            sendJsonResponse(200, $res);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    public function changePassword(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Unauthorized. Please login first.']);
        }

        $data = getRequestData();
        $oldPassword = (string)($data['old_password'] ?? $data['current_password'] ?? '');
        $newPassword = (string)($data['new_password'] ?? $data['password'] ?? '');

        try {
            $res = $this->authService->changePassword((int)$user['user_id'], $oldPassword, $newPassword);
            sendJsonResponse(200, $res);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ['status' => 'error', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
}
