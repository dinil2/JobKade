<?php
// controllers/ReportController.php

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class ReportController {
    private PDO $db;

    private const ALLOWED_REASONS = [
        'Offensive or abusive language',
        'Fraudulent or misrepresentation',
        'Spam or misleading content',
        'Other'
    ];

    public function __construct() {
        $this->db = Database::getConnection();
    }

    private function requireAuthUser(): array {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Please log in to submit a report.']);
        }
        return $user;
    }

    private function requireAdmin(): array {
        $user = JWT::getAuthUser();
        if (!$user || ($user['role'] ?? '') !== 'admin') {
            sendJsonResponse(403, ['status' => 'error', 'message' => 'Administrator privileges required.']);
        }
        return $user;
    }

    /**
     * POST /api/reports.php?action=create
     * Any logged-in user can report a review or a worker profile.
     */
    public function create(): void {
        $user = $this->requireAuthUser();
        $userId = (int)($user['user_id'] ?? $user['id'] ?? 0);
        if ($userId <= 0) {
            sendJsonResponse(401, ['status' => 'error', 'message' => 'Invalid user session.']);
        }

        $data = getRequestData();
        $targetType = strtolower(trim((string)($data['target_type'] ?? '')));
        $targetId = (int)($data['target_id'] ?? 0);
        $reason = trim((string)($data['reason'] ?? ''));
        $details = trim((string)($data['details'] ?? ''));

        if (!in_array($targetType, ['review', 'worker'], true)) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Invalid target type. Must be review or worker.']);
        }

        if ($targetId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Invalid target ID.']);
        }

        if (!in_array($reason, self::ALLOWED_REASONS, true)) {
            sendJsonResponse(400, [
                'status' => 'error',
                'message' => 'Reason must be one of: ' . implode(', ', self::ALLOWED_REASONS)
            ]);
        }

        // Prevent duplicate reports from the same user for the same target
        $chk = $this->db->prepare("
            SELECT id FROM reports 
            WHERE reporter_id = :uid AND target_type = :type AND target_id = :tid 
            LIMIT 1
        ");
        $chk->execute([
            ':uid'  => $userId,
            ':type' => $targetType,
            ':tid'  => $targetId
        ]);

        if ($chk->fetch()) {
            // Per instructions: "One report per user per target (ignore duplicates). Returns success."
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'Report submitted. Our team will review it.'
            ]);
        }

        $stmt = $this->db->prepare("
            INSERT INTO reports (reporter_id, target_type, target_id, reason, details, status)
            VALUES (:uid, :type, :tid, :reason, :details, 'pending')
        ");
        $stmt->execute([
            ':uid'     => $userId,
            ':type'    => $targetType,
            ':tid'     => $targetId,
            ':reason'  => $reason,
            ':details' => $details !== '' ? $details : null
        ]);

        sendJsonResponse(200, [
            'status'  => 'success',
            'message' => 'Report submitted. Our team will review it.',
            'id'      => (int)$this->db->lastInsertId()
        ]);
    }

    /**
     * GET /api/reports.php?action=list
     * Admin only: returns all reports, newest first with rich summaries.
     */
    public function list(): void {
        $this->requireAdmin();

        $statusFilter = strtolower(trim((string)($_GET['status'] ?? '')));
        $allowedStatuses = ['pending', 'dismissed', 'resolved'];

        $sql = "
            SELECT r.*, u.full_name AS reporter_name, u.email AS reporter_email
            FROM reports r
            JOIN users u ON r.reporter_id = u.id
        ";

        $params = [];
        if (in_array($statusFilter, $allowedStatuses, true)) {
            $sql .= " WHERE r.status = :status";
            $params[':status'] = $statusFilter;
        }

        $sql .= " ORDER BY r.created_at DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rawReports = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $reports = [];
        foreach ($rawReports as $row) {
            $reportItem = $this->enrichReportData($row);
            $reports[] = $reportItem;
        }

        sendJsonResponse(200, [
            'status'  => 'success',
            'reports' => $reports,
            'count'   => count($reports)
        ]);
    }

    /**
     * GET /api/reports.php?action=counts
     * Admin only: pending, dismissed, and resolved counts.
     */
    public function counts(): void {
        $this->requireAdmin();

        $pending = (int)$this->db->query("SELECT COUNT(*) FROM reports WHERE status = 'pending'")->fetchColumn();
        $dismissed = (int)$this->db->query("SELECT COUNT(*) FROM reports WHERE status = 'dismissed'")->fetchColumn();
        $resolved = (int)$this->db->query("SELECT COUNT(*) FROM reports WHERE status = 'resolved'")->fetchColumn();

        sendJsonResponse(200, [
            'status' => 'success',
            'counts' => [
                'pending'   => $pending,
                'dismissed' => $dismissed,
                'resolved'  => $resolved,
                'total'     => $pending + $dismissed + $resolved
            ]
        ]);
    }

    /**
     * POST /api/reports.php?action=dismiss
     * Admin only: sets status='dismissed', resolved_at=NOW().
     */
    public function dismiss(): void {
        $this->requireAdmin();
        $data = getRequestData();
        $reportId = (int)($data['report_id'] ?? $data['id'] ?? $_GET['report_id'] ?? 0);

        if ($reportId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid report_id required.']);
        }

        $stmt = $this->db->prepare("
            UPDATE reports 
            SET status = 'dismissed', resolved_at = NOW() 
            WHERE id = :id
        ");
        $stmt->execute([':id' => $reportId]);

        if ($stmt->rowCount() === 0) {
            // Check if report exists
            $chk = $this->db->prepare("SELECT id, status FROM reports WHERE id = :id");
            $chk->execute([':id' => $reportId]);
            if (!$chk->fetch()) {
                sendJsonResponse(404, ['status' => 'error', 'message' => 'Report not found.']);
            }
        }

        sendJsonResponse(200, [
            'status'  => 'success',
            'message' => 'Report dismissed successfully.'
        ]);
    }

    /**
     * POST /api/reports.php?action=resolve
     * Admin only:
     * - If target is a review and action='remove': delete review row, set report resolved.
     * - If target is a worker and action='suspend': set users.status='suspended', set report resolved.
     * - If action='dismiss': mark dismissed.
     */
    public function resolve(): void {
        $this->requireAdmin();
        $data = getRequestData();
        $reportId = (int)($data['report_id'] ?? $data['id'] ?? 0);
        $action = strtolower(trim((string)($data['action'] ?? '')));

        if ($reportId <= 0) {
            sendJsonResponse(400, ['status' => 'error', 'message' => 'Valid report_id required.']);
        }

        // Fetch report
        $stmt = $this->db->prepare("SELECT * FROM reports WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $reportId]);
        $report = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$report) {
            sendJsonResponse(404, ['status' => 'error', 'message' => 'Report not found.']);
        }

        $targetType = $report['target_type'];
        $targetId = (int)$report['target_id'];

        if ($action === 'dismiss') {
            $upd = $this->db->prepare("UPDATE reports SET status = 'dismissed', resolved_at = NOW() WHERE id = :id");
            $upd->execute([':id' => $reportId]);
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'Report dismissed.'
            ]);
        }

        if ($targetType === 'review') {
            if ($action === 'remove' || $action === 'resolve') {
                // Delete the review row
                $del = $this->db->prepare("DELETE FROM reviews WHERE id = :id");
                $del->execute([':id' => $targetId]);

                // Mark report as resolved
                $upd = $this->db->prepare("UPDATE reports SET status = 'resolved', resolved_at = NOW() WHERE id = :id");
                $upd->execute([':id' => $reportId]);

                sendJsonResponse(200, [
                    'status'  => 'success',
                    'message' => 'Report resolved and review removed successfully.'
                ]);
            } else {
                sendJsonResponse(400, ['status' => 'error', 'message' => 'Invalid action for review report. Expected remove or dismiss.']);
            }
        } elseif ($targetType === 'worker') {
            if ($action === 'suspend' || $action === 'resolve') {
                // Find worker user_id
                $wStmt = $this->db->prepare("
                    SELECT wp.id AS profile_id, wp.user_id, u.id AS direct_user_id
                    FROM worker_profiles wp
                    JOIN users u ON wp.user_id = u.id
                    WHERE wp.id = :tid1 OR wp.user_id = :tid2
                    LIMIT 1
                ");
                $wStmt->execute([':tid1' => $targetId, ':tid2' => $targetId]);
                $wRow = $wStmt->fetch(PDO::FETCH_ASSOC);

                $targetUserId = 0;
                if ($wRow) {
                    $targetUserId = (int)$wRow['user_id'];
                } else {
                    // Check direct user row
                    $uStmt = $this->db->prepare("SELECT id FROM users WHERE id = :tid AND role = 'worker' LIMIT 1");
                    $uStmt->execute([':tid' => $targetId]);
                    $targetUserId = (int)$uStmt->fetchColumn();
                }

                if ($targetUserId > 0) {
                    $sus = $this->db->prepare("UPDATE users SET status = 'suspended' WHERE id = :uid");
                    $sus->execute([':uid' => $targetUserId]);
                }

                // Mark report resolved
                $upd = $this->db->prepare("UPDATE reports SET status = 'resolved', resolved_at = NOW() WHERE id = :id");
                $upd->execute([':id' => $reportId]);

                sendJsonResponse(200, [
                    'status'  => 'success',
                    'message' => 'Report resolved and worker account suspended.'
                ]);
            } else {
                sendJsonResponse(400, ['status' => 'error', 'message' => 'Invalid action for worker report. Expected suspend or dismiss.']);
            }
        }

        sendJsonResponse(400, ['status' => 'error', 'message' => 'Unsupported target type or action.']);
    }

    /**
     * Enrich report with human-readable target title, content snippet, and worker context.
     */
    private function enrichReportData(array $r): array {
        $targetType = $r['target_type'];
        $targetId = (int)$r['target_id'];

        $targetTitle = 'Report #' . $r['id'];
        $contentSnippet = 'No additional content snippet.';
        $workerName = 'Unknown Worker';
        $workerProfileId = null;
        $workerUserId = null;
        $reviewId = null;

        if ($targetType === 'review') {
            $reviewId = $targetId;
            $revStmt = $this->db->prepare("
                SELECT r.*, 
                       u_cust.full_name AS customer_name,
                       u_work.full_name AS worker_name,
                       wp.id AS worker_profile_id,
                       wp.user_id AS worker_user_id
                FROM reviews r
                JOIN users u_cust ON r.customer_id = u_cust.id
                JOIN worker_profiles wp ON r.worker_id = wp.id
                JOIN users u_work ON wp.user_id = u_work.id
                WHERE r.id = :rid
                LIMIT 1
            ");
            $revStmt->execute([':rid' => $targetId]);
            $rev = $revStmt->fetch(PDO::FETCH_ASSOC);

            if ($rev) {
                $workerName = $rev['worker_name'] ?? 'Worker';
                $workerProfileId = (int)($rev['worker_profile_id'] ?? 0);
                $workerUserId = (int)($rev['worker_user_id'] ?? 0);
                $comment = trim((string)($rev['comment'] ?? ''));
                $targetTitle = 'Review on ' . $workerName;
                $contentSnippet = $comment !== '' ? '"' . $comment . '"' : '(Rating: ' . ($rev['rating'] ?? 5) . ' stars, no comment)';
            } else {
                $targetTitle = 'Review #' . $targetId . ' (Already Removed)';
                $contentSnippet = '[This review was deleted or no longer exists in the database.]';
            }
        } elseif ($targetType === 'worker') {
            $wStmt = $this->db->prepare("
                SELECT wp.id AS profile_id, wp.user_id, wp.address, u.full_name AS worker_name, u.status AS user_status,
                       (SELECT c.name FROM worker_categories wc JOIN categories c ON wc.category_id = c.id WHERE wc.worker_id = wp.id ORDER BY wc.is_primary DESC LIMIT 1) AS category_name
                FROM worker_profiles wp
                JOIN users u ON wp.user_id = u.id
                WHERE wp.id = :wid1 OR wp.user_id = :wid2
                LIMIT 1
            ");
            $wStmt->execute([':wid1' => $targetId, ':wid2' => $targetId]);
            $w = $wStmt->fetch(PDO::FETCH_ASSOC);

            if ($w) {
                $workerName = $w['worker_name'] ?? 'Worker';
                $workerProfileId = (int)($w['profile_id'] ?? $targetId);
                $workerUserId = (int)($w['user_id'] ?? 0);
                $cat = $w['category_name'] ?: 'General Services';
                $loc = $w['address'] ?: 'Sri Lanka';
                $uStatus = ucfirst((string)($w['user_status'] ?? 'Active'));

                $targetTitle = 'Worker: ' . $workerName;
                $contentSnippet = "Trade: {$cat} · Location: {$loc} · Account: {$uStatus}";
            } else {
                $targetTitle = 'Worker Profile #' . $targetId;
                $contentSnippet = '[Worker profile could not be located in database.]';
            }
        }

        return [
            'id'              => (int)$r['id'],
            'reporter_id'     => (int)$r['reporter_id'],
            'reporter_name'   => $r['reporter_name'] ?? 'Anonymous User',
            'reporter_email'  => $r['reporter_email'] ?? '',
            'target_type'     => $targetType,
            'target_id'       => $targetId,
            'reason'          => $r['reason'],
            'details'         => $r['details'] ?? '',
            'status'          => $r['status'],
            'created_at'      => $r['created_at'],
            'created_date'    => date('M j, Y', strtotime($r['created_at'])),
            'resolved_at'     => $r['resolved_at'],
            'target_title'    => $targetTitle,
            'content_snippet' => $contentSnippet,
            'worker_name'     => $workerName,
            'worker_id'       => $workerProfileId,
            'worker_user_id'  => $workerUserId,
            'review_id'       => $reviewId
        ];
    }
}
