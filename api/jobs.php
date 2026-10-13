<?php
// api/jobs.php

require_once __DIR__ . '/../controllers/JobController.php';

$controller = new JobController();
$action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'create' : 'list');

switch ($action) {
    case 'create':
        $controller->create();
        break;
    case 'list':
        $controller->listOpen();
        break;
    case 'customer':
        $controller->customerJobs();
        break;
    case 'worker':
        $controller->workerJobs();
        break;
    case 'details':
        $id = (int)($_GET['id'] ?? 0);
        $controller->details($id);
        break;
    case 'apply':
        $controller->apply();
        break;
    case 'create-invoice':
    case 'create_invoice':
    case 'invoice':
        $controller->createInvoice();
        break;
    case 'pay-invoice':
    case 'pay_invoice':
        $controller->payInvoice();
        break;
    case 'take':
    case 'take-job':
        $controller->takeJob();
        break;
    case 'arrive':
    case 'confirm-arrival':
        $controller->confirmArrival();
        break;
    case 'cancel-assignment':
    case 'unassign':
        $controller->cancelAssignment();
        break;
    case 'complete':
    case 'mark-done':
        $controller->completeJob();
        break;
    case 'invoices':
        $controller->invoices();
        break;
    default:
        sendJsonResponse(400, ['status' => 'error', 'message' => "Unknown jobs action: $action"]);
}
