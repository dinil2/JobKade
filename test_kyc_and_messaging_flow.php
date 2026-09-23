<?php
// test_kyc_and_messaging_flow.php
// End-to-End Integration Test Suite for:
// 1. Purge of hourly_rate
// 2. Worker KYC Upload -> Admin Review & Approval -> Profile Verification
// 3. Customer Messaging to Verified Worker -> Worker Receipt, Mark-as-Read & Reply
// 4. KYC Rejection Workflow & Feedback Notification

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/JWT.php';
require_once __DIR__ . '/repositories/KycRepository.php';
require_once __DIR__ . '/repositories/WorkerRepository.php';
require_once __DIR__ . '/repositories/MessageRepository.php';
require_once __DIR__ . '/services/KycService.php';
require_once __DIR__ . '/services/AdminService.php';
require_once __DIR__ . '/services/MessageService.php';

function assertTest(bool $condition, string $message): void {
    if ($condition) {
        echo " [PASS] " . $message . PHP_EOL;
    } else {
        echo " [FAIL] " . $message . PHP_EOL;
        exit(1);
    }
}

echo "==================================================" . PHP_EOL;
echo " Running Job Kade Full-Stack Integration Test Flow" . PHP_EOL;
echo "==================================================" . PHP_EOL;

$db = Database::getConnection();

// ----------------------------------------------------
// Step 1: Verify Schema & Purge of hourly_rate
// ----------------------------------------------------
echo "\n--- [Step 1: Database Schema & hourly_rate Purge] ---" . PHP_EOL;
$cols = $db->query("SHOW COLUMNS FROM `worker_profiles` LIKE 'hourly_rate'")->fetchAll();
assertTest(empty($cols), "hourly_rate column is completely absent from worker_profiles table");

$verifyStatusCol = $db->query("SHOW COLUMNS FROM `worker_profiles` LIKE 'verify_status'")->fetchAll();
assertTest(!empty($verifyStatusCol), "verify_status ENUM column exists in worker_profiles table");

$filePathCol = $db->query("SHOW COLUMNS FROM `kyc_documents` LIKE 'file_path'")->fetchAll();
assertTest(!empty($filePathCol), "file_path column exists in kyc_documents table");

$adminNotesCol = $db->query("SHOW COLUMNS FROM `kyc_documents` LIKE 'admin_notes'")->fetchAll();
assertTest(!empty($adminNotesCol), "admin_notes column exists in kyc_documents table");

// ----------------------------------------------------
// Step 2: Reset Test Environment State
// ----------------------------------------------------
echo "\n--- [Step 2: Resetting Test State] ---" . PHP_EOL;
$db->exec("DELETE FROM kyc_documents WHERE worker_id = 1");
$db->exec("UPDATE worker_profiles SET is_verified = 0, verify_status = 'unverified' WHERE id = 1");
$db->exec("DELETE FROM messages WHERE (sender_id = 2 AND receiver_id = 3) OR (sender_id = 3 AND receiver_id = 2)");
$db->exec("DELETE FROM notifications WHERE user_id IN (2, 3)");
assertTest(true, "Reset test worker (ID: 1, User: 3) to unverified and cleared previous messages/KYC");

// ----------------------------------------------------
// Step 3: Worker KYC Submission Flow
// ----------------------------------------------------
echo "\n--- [Step 3: Worker KYC Document Submission] ---" . PHP_EOL;
$kycService = new KycService();

// Worker 1 submits NIC document
$submissionData = [
    'document_type' => 'nic',
    'document_name' => 'National Identity Card (198512345678)',
    'file_path'     => 'uploads/kyc/test_sunil_nic.pdf'
];
$uploadResult = $kycService->submitDocument(1, $submissionData);
assertTest($uploadResult['status'] === 'success', "Worker KYC submission returned status: success");
assertTest(!empty($uploadResult['kyc_id']) && $uploadResult['kyc_id'] > 0, "Returned valid KYC Document ID: " . $uploadResult['kyc_id']);

$kycId = (int)$uploadResult['kyc_id'];

// Verify Worker Profile transitioned to pending
$wp = $db->query("SELECT is_verified, verify_status FROM worker_profiles WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
assertTest($wp['verify_status'] === 'pending', "Worker profile verify_status transitioned to 'pending'");
assertTest((int)$wp['is_verified'] === 0, "Worker is_verified remains 0 during pending state");

// Verify Worker status summary from service
$workerStatus = $kycService->getWorkerStatus(1);
assertTest($workerStatus['verify_status'] === 'pending', "KycService->getWorkerStatus reports pending");
assertTest($workerStatus['status_label'] === 'Pending Approval', "KycService status_label is 'Pending Approval'");
assertTest(count($workerStatus['documents']) >= 1, "Worker documents list contains submitted record");

// ----------------------------------------------------
// Step 4: Admin KYC Review & Approval Flow
// ----------------------------------------------------
echo "\n--- [Step 4: Admin Moderation & Approval] ---" . PHP_EOL;
$adminService = new AdminService();

// Admin retrieves pending list
$pendingList = $adminService->getPendingKycList();
assertTest(!empty($pendingList), "Admin pending KYC list contains records");
$foundDoc = false;
foreach ($pendingList as $item) {
    if ((int)$item['id'] === $kycId) {
        $foundDoc = true;
        break;
    }
}
assertTest($foundDoc, "Submitted document #{$kycId} is present in admin moderation queue");

// Admin approves the document
$adminId = 1; // System Administrator
$reviewResult = $adminService->verifyKyc($kycId, 'approved', 'NIC matches official registry records.', $adminId);
assertTest($reviewResult['status'] === 'success', "Admin approval returned success response");
assertTest($reviewResult['review_status'] === 'approved', "Document review_status is 'approved'");
assertTest($reviewResult['worker_status'] === 'verified', "Worker status is 'verified'");

// Verify in DB that worker profile is updated to verified
$wpAfter = $db->query("SELECT is_verified, verify_status FROM worker_profiles WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
assertTest((int)$wpAfter['is_verified'] === 1, "worker_profiles.is_verified is now 1 (True)");
assertTest($wpAfter['verify_status'] === 'verified', "worker_profiles.verify_status is now 'verified'");

// Verify notification was dispatched to worker user (ID 3)
$notif = $db->query("SELECT * FROM notifications WHERE user_id = 3 ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($notif) && str_contains($notif['title'], 'Approved'), "In-app approval notification sent to worker (User ID 3)");

// ----------------------------------------------------
// Step 5: Customer Messages Verified Worker
// ----------------------------------------------------
echo "\n--- [Step 5: Customer Messaging Verified Worker] ---" . PHP_EOL;
$msgService = new MessageService();

// Customer inspects worker contact info
$contact = $msgService->getContactInfo(3);
assertTest(!empty($contact), "Retrieved contact metadata for Worker (User ID: 3)");
assertTest(!isset($contact['hourly_rate']), "hourly_rate is NOT present in contact info payload");
assertTest((int)$contact['is_verified'] === 1, "Contact profile confirms worker is verified");

// Customer (User 2) sends initial inquiry
$customerUserId = 2;
$workerUserId = 3;
$sendRes = $msgService->sendMessage(
    $customerUserId,
    $workerUserId,
    "Hello Sunil, I need electrical inspection for circuit breaker tripping in Colombo 03."
);
assertTest($sendRes['status'] === 'success', "Customer successfully sent message to verified worker");
assertTest(!empty($sendRes['message_id']), "Message saved with message_id: " . $sendRes['message_id']);
$initialMsgId = (int)$sendRes['message_id'];

// ----------------------------------------------------
// Step 6: Worker Receives, Marks Read & Replies
// ----------------------------------------------------
echo "\n--- [Step 6: Worker Receives, Auto-Read & Reply] ---" . PHP_EOL;

// Verify initial unread state via repository
$msgRepo = new MessageRepository();
$savedMsg = $msgRepo->getMessageById($initialMsgId);
assertTest((int)$savedMsg['is_read'] === 0, "New message initially has is_read = 0 (Delivered / Unread)");

// Worker retrieves active thread (which triggers auto markAsRead)
$thread = $msgService->getConversation($workerUserId, $customerUserId);
assertTest(count($thread) === 1, "Worker retrieved conversation thread with 1 message");
assertTest($thread[0]['message_text'] === "Hello Sunil, I need electrical inspection for circuit breaker tripping in Colombo 03.", "Message text matches customer input");
assertTest((int)$thread[0]['is_read'] === 1, "Opening conversation automatically marked message as is_read = 1 (Read receipt)");

// Worker also calls explicit markAsRead
$markSuccess = $msgService->markAsRead($workerUserId, $customerUserId);
assertTest($markSuccess === true, "Worker markAsRead executed successfully");

// Worker sends reply
$replyRes = $msgService->sendMessage(
    $workerUserId,
    $customerUserId,
    "Hello Sasmitha! Yes, I can inspect your breaker panel tomorrow at 10:00 AM."
);
assertTest($replyRes['status'] === 'success', "Worker successfully sent reply message");

// Customer retrieves conversation and verifies chronology
$customerThread = $msgService->getConversation($customerUserId, $workerUserId);
assertTest(count($customerThread) === 2, "Customer retrieved complete 2-message thread");
assertTest((int)$customerThread[0]['sender_id'] === 2, "Message 1 sender is Customer (User 2)");
assertTest((int)$customerThread[1]['sender_id'] === 3, "Message 2 sender is Worker (User 3)");
assertTest(str_contains($customerThread[1]['message_text'], "10:00 AM"), "Message 2 text contains worker's schedule reply");

// ----------------------------------------------------
// Step 7: KYC Rejection & Feedback Loop
// ----------------------------------------------------
echo "\n--- [Step 7: KYC Rejection & Feedback Workflow] ---" . PHP_EOL;

// Worker submits a second document
$doc2 = $kycService->submitDocument(1, [
    'document_type' => 'trade_certificate',
    'document_name' => 'Expired Electrician Certificate',
    'file_path'     => 'uploads/kyc/expired_cert.pdf'
]);
$kycId2 = (int)$doc2['kyc_id'];

// Admin rejects document with constructive feedback
$rejectFeedback = "Uploaded trade certification expired in 2024. Please re-upload current NVQ Level 4 certificate.";
$rejectRes = $adminService->verifyKyc($kycId2, 'rejected', $rejectFeedback, $adminId);
assertTest($rejectRes['status'] === 'success', "Admin rejection processed successfully");
assertTest($rejectRes['review_status'] === 'rejected', "Document status is 'rejected'");
assertTest($rejectRes['worker_status'] === 'rejected', "Worker profile status is 'rejected'");

$kycRecord = (new KycRepository())->getDocumentById($kycId2);
assertTest($kycRecord['status'] === 'rejected', "kyc_documents.status is 'rejected'");
assertTest($kycRecord['admin_notes'] === $rejectFeedback, "kyc_documents.admin_notes holds constructive feedback");

// Verify rejection notification was sent to worker
$notif2 = $db->query("SELECT * FROM notifications WHERE user_id = 3 ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest(!empty($notif2) && str_contains($notif2['message'], 'expired in 2024'), "Worker received in-app notification with admin feedback");

echo "\n==================================================" . PHP_EOL;
echo " ALL INTEGRATION TESTS PASSED CLEANLY! (100%)     " . PHP_EOL;
echo "==================================================" . PHP_EOL;
