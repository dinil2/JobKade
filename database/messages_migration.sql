-- ==========================================================
-- Job Kade: In-App Customer-Worker Messaging Schema Migration
-- Standardized to Specification: CSE5015 Layered Architecture
-- ==========================================================

USE `jobkade_db`;

-- Drop old messages table if required during full migration
DROP TABLE IF EXISTS `messages`;

-- Create messages table adhering to specifications
CREATE TABLE IF NOT EXISTS `messages` (
    `msg_id` INT AUTO_INCREMENT PRIMARY KEY,
    `job_id` INT DEFAULT NULL,
    `sender_id` INT NOT NULL,
    `receiver_id` INT NOT NULL,
    `message_text` TEXT NOT NULL,
    `is_read` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_messages_job` FOREIGN KEY (`job_id`) REFERENCES `job_requests` (`id`) ON DELETE SET NULL,
    INDEX `idx_messages_sender_receiver` (`sender_id`, `receiver_id`),
    INDEX `idx_messages_receiver_sender` (`receiver_id`, `sender_id`),
    INDEX `idx_messages_job` (`job_id`),
    INDEX `idx_messages_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- Testing / Reset Snippet:
-- To wipe all messages cleanly from scratch, run:
-- TRUNCATE TABLE messages;
-- ==========================================================

-- Seed Initial Test Conversation between Customer (id: 2) and Worker (id: 3, Sunil)
INSERT INTO `messages` (`msg_id`, `job_id`, `sender_id`, `receiver_id`, `message_text`, `is_read`, `created_at`) VALUES
(1, NULL, 2, 3, 'Hello Mr. Sunil, I noticed your electrical installation profile. Are you available this Saturday for a home inspection?', 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(2, NULL, 3, 2, 'Hi Sasmitha! Yes, I am available this Saturday after 10:00 AM. Could you please share your location in Colombo?', 1, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
(3, NULL, 2, 3, 'Great! The property is near Kollupitiya Junction. I will share the exact floor plan when you arrive.', 0, DATE_SUB(NOW(), INTERVAL 5 MINUTE));
