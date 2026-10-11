<?php
// services/MessageService.php

require_once __DIR__ . '/../repositories/MessageRepository.php';
require_once __DIR__ . '/../repositories/UserRepository.php';

class MessageService {
    private MessageRepository $msgRepo;
    private UserRepository $userRepo;

    public function __construct(?MessageRepository $msgRepo = null, ?UserRepository $userRepo = null) {
        $this->msgRepo = $msgRepo ?? new MessageRepository();
        $this->userRepo = $userRepo ?? new UserRepository();
    }

    // Send an in-app message with strict validation and sanitization.
    public function sendMessage(int $authUserId, int $receiverId, string $text, ?int $jobId = null, ?int $explicitSenderId = null): array {
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required.");
        }

        if ($explicitSenderId !== null && $explicitSenderId !== $authUserId) {
            throw new InvalidArgumentException("Forbidden: Invalid sender ID.");
        }

        $senderId = $authUserId;

        if ($receiverId <= 0) {
            throw new InvalidArgumentException("Invalid recipient user ID.");
        }

        if ($senderId === $receiverId) {
            throw new InvalidArgumentException("Cannot message yourself.");
        }

        $trimmed = trim($text);
        if ($trimmed === '' || strlen($trimmed) === 0) {
            throw new InvalidArgumentException("Message cannot be empty.");
        }

        if (mb_strlen($trimmed) > 2000) {
            throw new InvalidArgumentException("Message is too long.");
        }

        $sanitizedText = htmlspecialchars($trimmed, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $senderUser = $this->userRepo->findById($senderId);
        if (!$senderUser) {
            throw new InvalidArgumentException("Sender account does not exist.");
        }

        $receiverUser = $this->userRepo->findById($receiverId);
        if (!$receiverUser) {
            throw new InvalidArgumentException("Recipient account does not exist.");
        }

        $cleanJobId = null;
        if ($jobId !== null && (int)$jobId > 0) {
            $cleanJobId = (int)$jobId;
        }

        $msgId = $this->msgRepo->saveMessage($senderId, $receiverId, $cleanJobId, $sanitizedText);
        $messageRecord = $this->msgRepo->getMessageById($msgId);

        return [
            'status'     => 'success',
            'message'    => 'Message sent successfully.',
            'message_id' => $msgId,
            'data'       => $messageRecord
        ];
    }

    // Retrieve conversation history between the authenticated user and another user.
    public function getConversation(int $authUserId, int $otherUserId, ?int $jobId = null): array {
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required.");
        }

        if ($otherUserId <= 0) {
            throw new InvalidArgumentException("Invalid user ID.");
        }

        // Automatically mark incoming messages from $otherUserId as read
        $this->msgRepo->markAsRead($otherUserId, $authUserId);

        return $this->msgRepo->getConversation($authUserId, $otherUserId, $jobId);
    }

    // Mark incoming messages from a specific sender as read.
    public function markAsRead(int $authUserId, int $senderId): bool {
        if ($authUserId <= 0 || $senderId <= 0) {
            throw new InvalidArgumentException("Invalid user or sender ID.");
        }

        return $this->msgRepo->markAsRead($senderId, $authUserId);
    }

    // Get recent conversation threads for the current user.
    public function getUserConversations(int $authUserId): array {
        if ($authUserId <= 0) {
            throw new InvalidArgumentException("Authentication required.");
        }

        return $this->msgRepo->getUserConversations($authUserId);
    }

    // Get contact profile information for conversation header.
    public function getContactInfo(int $userId): ?array {
        if ($userId <= 0) {
            throw new InvalidArgumentException("Invalid user ID.");
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
