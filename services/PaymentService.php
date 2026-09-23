<?php
// services/PaymentService.php

require_once __DIR__ . '/../repositories/SubscriptionRepository.php';

class PaymentService {
    private SubscriptionRepository $subRepo;

    public function __construct() {
        $this->subRepo = new SubscriptionRepository();
    }

    public function getPlans(): array {
        return $this->subRepo->getAllPlans();
    }

    public function processPayment(int $workerId, int $planId, string $method = 'IPG Visa/Mastercard'): array {
        return $this->subRepo->processPaymentAndSubscribe($workerId, $planId, $method);
    }

    public function getReceipt(string $receiptNumber): ?array {
        return $this->subRepo->getReceiptByNumber($receiptNumber);
    }

    public function getWorkerPayments(int $workerId): array {
        return $this->subRepo->getWorkerPaymentHistory($workerId);
    }
}
