-- ==========================================================
-- Job Kade: Reset & Re-Seed In-App Messages
-- Quick one-command wipe & test script
-- ==========================================================

USE `jobkade_db`;

-- 1. Wipe all test messages cleanly
TRUNCATE TABLE `messages`;

-- 2. Seed Test Accounts & Messages
-- Customer: User #2 (Sasmitha Customer / customer@gmail.com)
-- Worker: User #3 (Sunil Perera / sunil.electric@gmail.com / Verified Master Electrician)

INSERT INTO `messages` (`msg_id`, `job_id`, `sender_id`, `receiver_id`, `message_text`, `is_read`, `created_at`) VALUES
(1, NULL, 2, 3, 'Hello Mr. Sunil, I need assistance with circuit breaker tripping in my apartment.', 1, DATE_SUB(NOW(), INTERVAL 45 MINUTE)),
(2, NULL, 3, 2, 'Hello Sasmitha! I can inspect the distribution board and diagnose the leakage today afternoon.', 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(3, NULL, 2, 3, 'That would be excellent! What is your diagnostic inspection fee?', 1, DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
(4, NULL, 3, 2, 'My base callout & inspection fee is Rs. 1,500. If repair work is needed, parts will be billed at actuals.', 0, DATE_SUB(NOW(), INTERVAL 5 MINUTE));

-- Verify
SELECT 
    m.msg_id,
    s.full_name AS sender,
    r.full_name AS receiver,
    m.message_text,
    m.is_read,
    m.created_at
FROM `messages` m
JOIN `users` s ON m.sender_id = s.id
JOIN `users` r ON m.receiver_id = r.id
ORDER BY m.created_at ASC;
