<?php
// services/MessageService.php
// Strictly encapsulates Business Logic, Sanitization, and Validation rules

require_once __DIR__ . '/../repositories/MessageRepository.php';
require_once __DIR__ . '/../repositories/UserRepository.php';

class MessageService {
    private MessageRepository $msgRepo;
    private UserRepository $userRepo;

    public function __construct(?MessageRepository $msgRepo = null, ?UserRepository $userRepo = null) {
        $this->msgRepo = $msgRepo ?? new MessageRepository();
        $this->userRepo = $userRepo ?? new UserRepository();
    }

    /**
     * Send an in-app message with strict validation and sanitization.
     *
     * @param int $authUserId Authenticated user ID from JWT
     * @param int $receiverId Target recipient user ID
     * @param string $text Message content
     * @param int|null $jobId Optional associated job ID
     * @param int|null $explicitSenderId Optional sender_id parameter to verify against auth user
     * @return array Created message details
     * @throws InvalidArgumentException|Exception
     */
    public function sendMessage(int $authUserId, int $receiverId, string $text, ?int $jobId = null, ?int $explicitSenderId = null): array {
        // 1. Business Logic Check: Verify authenticated sender
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required. Invalid sender identity.");
        }

        if ($explicitSenderId !== null && $explicitSenderId !== $authUserId) {
            throw new InvalidArgumentException("Forbidden: Sender ID does not match the authenticated user token.");
        }

        $senderId = $authUserId;

        // 2. Validate recipient
        if ($receiverId <= 0) {
            throw new InvalidArgumentException("A valid recipient user ID is required.");
        }

        // 3. Self-messaging restriction
        if ($senderId === $receiverId) {
            throw new InvalidArgumentException("You cannot send a message to yourself.");
        }

        // 4. Sanitize and validate message text
        $trimmed = trim($text);
        if ($trimmed === '' || strlen($trimmed) === 0) {
            throw new InvalidArgumentException("Message text cannot be empty.");
        }

        if (mb_strlen($trimmed) > 2000) {
            throw new InvalidArgumentException("Message length exceeds the maximum allowed limit of 2,000 characters.");
        }

        // Convert special characters to HTML entities to prevent XSS attacks while preserving text
        $sanitizedText = htmlspecialchars($trimmed, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // 5. Validate that both users actually exist in the database
        $senderUser = $this->userRepo->findById($senderId);
        if (!$senderUser) {
            throw new InvalidArgumentException("Sender account does not exist.");
        }

        $receiverUser = $this->userRepo->findById($receiverId);
        if (!$receiverUser) {
            throw new InvalidArgumentException("Recipient account does not exist.");
        }

        // Validate job_id if provided
        $cleanJobId = null;
        if ($jobId !== null && (int)$jobId > 0) {
            $cleanJobId = (int)$jobId;
        }

        // 6. Persist message via repository layer
        $msgId = $this->msgRepo->saveMessage($senderId, $receiverId, $cleanJobId, $sanitizedText);
        $messageRecord = $this->msgRepo->getMessageById($msgId);

        return [
            'status'     => 'success',
            'message'    => 'Message sent successfully.',
            'message_id' => $msgId,
            'data'       => $messageRecord
        ];
    }

    /**
     * Retrieve conversation history between the authenticated user and another user.
     * Automatically marks incoming messages as read.
     *
     * @param int $authUserId Authenticated user ID
     * @param int $otherUserId Target conversation partner
     * @param int|null $jobId Optional job context filter
     * @return array Chronological messages
     * @throws InvalidArgumentException
     */
    public function getConversation(int $authUserId, int $otherUserId, ?int $jobId = null): array {
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required.");
        }

        if ($otherUserId <= 0) {
            throw new InvalidArgumentException("A valid user_id is required.");
        }

        // Automatically mark incoming messages from $otherUserId as read
        $this->msgRepo->markAsRead($otherUserId, $authUserId);

        return $this->msgRepo->getConversation($authUserId, $otherUserId, $jobId);
    }

    /**
     * Mark incoming messages from a specific sender as read.
     *
     * @param int $authUserId The authenticated receiver
     * @param int $senderId The user who sent the messages
     * @return bool
     */
    public function markAsRead(int $authUserId, int $senderId): bool {
        if ($authUserId <= 0 || $senderId <= 0) {
            throw new InvalidArgumentException("Valid authenticated user and sender ID are required.");
        }

        return $this->msgRepo->markAsRead($senderId, $authUserId);
    }

    /**
     * Get recent conversation threads for the current user.
     *
     * @param int $authUserId
     * @return array
     */
    public function getUserConversations(int $authUserId): array {
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required.");
        }

        return $this->msgRepo->getUserConversations($authUserId);
    }

    /**
     * Get contact profile information for conversation header.
     *
     * @param int $userId
     * @return array|null
     */
    public function getContactInfo(int $userId): ?array {
        if ($userId <= 0) {
            throw new InvalidArgumentException("A valid user ID is required.");
        }

        return $this->msgRepo->getContactInfo($userId);
    }

    // Legacy method aliases for backward compatibility
    public function getThread(int $user1, int $user2): array {
        return $this->getConversation($user1, $user2);
    }

    public function getConversations(int $userId): array {
        return $this->getUserConversations($userId);
    }
}
