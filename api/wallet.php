<?php
// api/wallet.php

require_once __DIR__ . "/../controllers/WalletController.php";

$controller = new WalletController();
$action = $_GET["action"] ?? "balance";

switch ($action) {
    case "balance":
        $controller->balance();
        break;
    case "transactions":
        $controller->transactions();
        break;
    case "activate-access":
    case "pay-access":
    case "pay-access-fee":
        $controller->activateAccess();
        break;
    case "request-payout":
    case "withdraw":
    case "payout":
        $controller->requestPayout();
        break;
    case "top-up":
    case "topup":
        $controller->topUp();
        break;
    default:
        sendJsonResponse(400, ["status" => "error", "message" => "Unknown wallet action: $action"]);
}

