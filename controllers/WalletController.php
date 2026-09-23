<?php
// controllers/WalletController.php

require_once __DIR__ . "/../services/WalletService.php";
require_once __DIR__ . "/../config/cors.php";
require_once __DIR__ . "/../config/JWT.php";
require_once __DIR__ . "/../config/Database.php";

class WalletController {
    private WalletService $walletService;
    private PDO $db;

    public function __construct() {
        $this->walletService = new WalletService();
        $this->db = Database::getConnection();
    }

    private function resolveWorkerId(array $user): int {
        if (!empty($user["worker_id"])) {
            return (int)$user["worker_id"];
        }

        $stmt = $this->db->prepare("SELECT id FROM worker_profiles WHERE user_id = :uid LIMIT 1");
        $stmt->execute([":uid" => $user["user_id"] ?? $user["id"]]);
        $workerId = $stmt->fetchColumn();

        if (!$workerId) {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker profile not found."]);
        }

        return (int)$workerId;
    }

    public function balance(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user["role"] !== "worker") {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker authentication required."]);
        }

        $workerId = $this->resolveWorkerId($user);
        try {
            $details = $this->walletService->getWorkerWalletDetails($workerId);
            sendJsonResponse(200, [
                "status" => "success",
                "wallet" => $details
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, ["status" => "error", "message" => $e->getMessage()]);
        }
    }

    public function transactions(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user["role"] !== "worker") {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker authentication required."]);
        }

        $workerId = $this->resolveWorkerId($user);
        try {
            $details = $this->walletService->getWorkerWalletDetails($workerId);
            sendJsonResponse(200, [
                "status"       => "success",
                "transactions" => $details["transactions"]
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, ["status" => "error", "message" => $e->getMessage()]);
        }
    }

    public function activateAccess(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user["role"] !== "worker") {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker authentication required."]);
        }

        $workerId = $this->resolveWorkerId($user);
        $data = getRequestData();
        $method = $data["payment_method"] ?? "Online IPG (Card/Visa/Master)";

        try {
            $result = $this->walletService->activateJobAccess($workerId, $method);
            sendJsonResponse(200, $result);
        } catch (Exception $e) {
            sendJsonResponse(500, ["status" => "error", "message" => $e->getMessage()]);
        }
    }

    public function requestPayout(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user["role"] !== "worker") {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker authentication required."]);
        }

        $workerId = $this->resolveWorkerId($user);
        $data = getRequestData();

        try {
            $result = $this->walletService->requestPayout($workerId, $data);
            sendJsonResponse(200, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ["status" => "error", "message" => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ["status" => "error", "message" => $e->getMessage()]);
        }
    }

    public function topUp(): void {
        $user = JWT::getAuthUser();
        if (!$user || $user["role"] !== "worker") {
            sendJsonResponse(403, ["status" => "error", "message" => "Worker authentication required."]);
        }

        $workerId = $this->resolveWorkerId($user);
        $data = getRequestData();
        $amount = (float)($data['amount'] ?? 0);
        $method = (string)($data['payment_method'] ?? 'online');

        try {
            $result = $this->walletService->topUp($workerId, $amount, $method);
            sendJsonResponse(200, $result);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, ["status" => "error", "message" => $e->getMessage()]);
        } catch (Exception $e) {
            sendJsonResponse(500, ["status" => "error", "message" => $e->getMessage()]);
        }
    }
}

