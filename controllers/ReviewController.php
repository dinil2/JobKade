<?php
// controllers/ReviewController.php

require_once __DIR__ . '/../repositories/ReviewRepository.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class ReviewController {
    private ReviewRepository $revRepo;

    public function __construct() {
        $this->revRepo = new ReviewRepository();
    }

    public function create(): void {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Unauthorized.']);
        }

        $data = getRequestData();
        $workerId = (int)($data['worker_id'] ?? 0);
        $jobId = isset($data['job_id']) ? (int)$data['job_id'] : null;
        $rating = (int)($data['rating'] ?? 5);
        $comment = trim($data['comment'] ?? '');

        if ($workerId <= 0 || $rating < 1 || $rating > 5) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Invalid worker ID or rating (must be 1-5).']);
        }

        $id = $this->revRepo->createReview((int)$user['user_id'], $workerId, $jobId, $rating, $comment);
        sendJsonResponse(201, [
            'status' => 'success',
            'message' => 'Review submitted successfully!',
            'review_id' => $id
        ]);
    }

    public function workerReviews(): void {
        $workerId = (int)($_GET['worker_id'] ?? 0);
        $reviews = $this->revRepo->getWorkerReviews($workerId);
        sendJsonResponse(200, ['status' => 'success', 'reviews' => $reviews]);
    }
}
