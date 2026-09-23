<?php
// controllers/MessageController.php
// Strictly handles HTTP Requests, JWT Bearer Token validation, and RESTful JSON responses

require_once __DIR__ . '/../services/MessageService.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/JWT.php';

class MessageController {
    private MessageService $msgService;

    public function __construct(?MessageService $msgService = null) {
        $this->msgService = $msgService ?? new MessageService();
    }

    /**
     * Authenticate request and extract user ID and role from JWT payload.
     *
     * @return array
     */
    private function authenticate(): array {
        $user = JWT::getAuthUser();
        if (!$user) {
            sendJsonResponse(401, [
                'status'  => 'error',
                'message' => 'Unauthorized. A valid JWT Bearer token is required to access messaging services.'
            ]);
        }

        $userId = (int)($user['id'] ?? $user['user_id'] ?? 0);
        if ($userId <= 0) {
            sendJsonResponse(401, [
                'status'  => 'error',
                'message' => 'Unauthorized. Invalid user payload inside JWT token.'
            ]);
        }

        return [
            'user_id' => $userId,
            'role'    => $user['role'] ?? 'customer',
            'email'   => $user['email'] ?? ''
        ];
    }

    /**
     * POST /api/messages/send
     * Accepts JSON: { receiver_id, job_id, message_text }
     */
    public function send(): void {
        $authUser = $this->authenticate();
        $authUserId = $authUser['user_id'];

        $data = getRequestData();
        $receiverId = (int)($data['receiver_id'] ?? 0);
        $messageText = (string)($data['message_text'] ?? $data['text'] ?? '');
        $jobId = (isset($data['job_id']) && $data['job_id'] !== '') ? (int)$data['job_id'] : null;
        $explicitSenderId = isset($data['sender_id']) ? (int)$data['sender_id'] : null;

        try {
            $response = $this->msgService->sendMessage(
                $authUserId,
                $receiverId,
                $messageText,
                $jobId,
                $explicitSenderId
            );
            sendJsonResponse(201, $response);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => $e->getMessage()
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Internal server error while processing message: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * GET /api/messages/conversation?with_user_id={id}&job_id={id}
     * Returns chronological messages in JSON format.
     */
    public function conversation(): void {
        $authUser = $this->authenticate();
        $authUserId = $authUser['user_id'];

        // Accept with_user_id, recipient_id, or user_id for client convenience
        $withUserId = (int)($_GET['with_user_id'] ?? $_GET['recipient_id'] ?? $_GET['user_id'] ?? 0);
        $jobId = (isset($_GET['job_id']) && $_GET['job_id'] !== '') ? (int)$_GET['job_id'] : null;

        if ($withUserId <= 0) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => 'Valid with_user_id or recipient_id query parameter is required.'
            ]);
        }

        try {
            $messages = $this->msgService->getConversation($authUserId, $withUserId, $jobId);
            sendJsonResponse(200, [
                'status'   => 'success',
                'messages' => $messages
            ]);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => $e->getMessage()
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Error retrieving conversation: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * Legacy alias for conversation() to support existing callers.
     */
    public function thread(): void {
        $this->conversation();
    }

    /**
     * POST /api/messages/read
     * Marks incoming messages from this user as read.
     * Accepts JSON: { sender_id } or { with_user_id }
     */
    public function read(): void {
        $authUser = $this->authenticate();
        $authUserId = $authUser['user_id'];

        $data = getRequestData();
        $senderId = (int)($data['sender_id'] ?? $data['with_user_id'] ?? $data['recipient_id'] ?? $_GET['sender_id'] ?? $_GET['with_user_id'] ?? $_GET['recipient_id'] ?? $_GET['user_id'] ?? 0);

        if ($senderId <= 0) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => 'Valid sender_id, with_user_id, or recipient_id is required.'
            ]);
        }

        try {
            $success = $this->msgService->markAsRead($authUserId, $senderId);
            sendJsonResponse(200, [
                'status'  => 'success',
                'message' => 'Messages marked as read successfully.',
                'updated' => $success
            ]);
        } catch (InvalidArgumentException $e) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => $e->getMessage()
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Error marking messages as read: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * GET /api/messages/conversations
     * Returns list of recent conversation threads with unread counts.
     */
    public function conversations(): void {
        $authUser = $this->authenticate();
        $authUserId = $authUser['user_id'];

        try {
            $conversations = $this->msgService->getUserConversations($authUserId);
            sendJsonResponse(200, [
                'status'        => 'success',
                'conversations' => $conversations
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Error retrieving conversations: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * GET /api/messages/contact_info?user_id={id}
     * Returns contact metadata for the chat header.
     */
    public function contactInfo(): void {
        $this->authenticate();

        $targetUserId = (int)($_GET['user_id'] ?? $_GET['with_user_id'] ?? $_GET['recipient_id'] ?? 0);
        if ($targetUserId <= 0) {
            sendJsonResponse(400, [
                'status'  => 'error',
                'message' => 'Valid user_id or recipient_id query parameter is required.'
            ]);
        }

        try {
            $contact = $this->msgService->getContactInfo($targetUserId);
            if (!$contact) {
                sendJsonResponse(404, [
                    'status'  => 'error',
                    'message' => 'User profile not found.'
                ]);
            }

            sendJsonResponse(200, [
                'status'  => 'success',
                'contact' => $contact
            ]);
        } catch (Exception $e) {
            sendJsonResponse(500, [
                'status'  => 'error',
                'message' => 'Error retrieving contact details: ' . $e->getMessage()
            ]);
        }
    }
}
