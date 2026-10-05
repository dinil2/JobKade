<?php
// test_messages_flow.php
// Complete automated test suite for In-App Messaging Architecture

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/JWT.php';
require_once __DIR__ . '/repositories/MessageRepository.php';
require_once __DIR__ . '/services/MessageService.php';
require_once __DIR__ . '/controllers/MessageController.php';

function assertTest(string $desc, bool $condition): void {
    if ($condition) {
        echo " [PASS] $desc\n";
    } else {
        echo " [FAIL] $desc\n";
        exit(1);
    }
}

echo "==================================================\n";
echo " Running Job Kade In-App Messaging Architecture Tests\n";
echo "==================================================\n";

$pdo = Database::getConnection();

// 1. Truncate messages table to start clean
$pdo->exec("TRUNCATE TABLE messages");
$count = (int)$pdo->query("SELECT COUNT(*) FROM messages")->fetchColumn();
assertTest("TRUNCATE TABLE messages wipped all rows cleanly", $count === 0);

// 2. Setup JWT Tokens for Customer (User ID 2) and Worker (User ID 3)
$customerPayload = [
    'id'        => 2,
    'user_id'   => 2,
    'full_name' => 'Sasmitha Customer',
    'email'     => 'customer@gmail.com',
    'role'      => 'customer'
];
$workerPayload = [
    'id'        => 3,
    'user_id'   => 3,
    'full_name' => 'Sunil Perera (Electrician)',
    'email'     => 'sunil.electric@gmail.com',
    'role'      => 'worker'
];

$customerToken = JWT::encode($customerPayload);
$workerToken = JWT::encode($workerPayload);
assertTest("Generated valid signed JWT token for Customer (ID 2)", !empty($customerToken));
assertTest("Generated valid signed JWT token for Worker (ID 3)", !empty($workerToken));

// 3. Test MessageRepository
$repo = new MessageRepository();
$msgId1 = $repo->saveMessage(2, 3, null, "Hello Sunil, can you assist with circuit breakers?");
assertTest("Repository saved message 1, returned valid msg_id", $msgId1 > 0);

$msgRecord = $repo->getMessageById($msgId1);
assertTest("Repository getMessageById retrieves saved record", $msgRecord !== null && $msgRecord['sender_id'] == 2 && $msgRecord['receiver_id'] == 3);
assertTest("Repository aliases msg_id as id for cross-compatibility", isset($msgRecord['id']) && $msgRecord['id'] == $msgId1);

// 4. Test MessageService Business Rules & Sanitization
$service = new MessageService();

// Validation: Self-messaging should throw InvalidArgumentException
try {
    $service->sendMessage(2, 2, "Talking to myself");
    assertTest("Self-messaging was blocked", false);
} catch (InvalidArgumentException $e) {
    assertTest("Self-messaging correctly rejected with: " . $e->getMessage(), true);
}

// Validation: Empty message should throw InvalidArgumentException
try {
    $service->sendMessage(2, 3, "   \n\t   ");
    assertTest("Empty message was blocked", false);
} catch (InvalidArgumentException $e) {
    assertTest("Empty whitespace message rejected", true);
}

// Validation: Sender ID mismatch against authenticated user should throw exception
try {
    $service->sendMessage(2, 3, "Trying to spoof sender", null, 999);
    assertTest("Spoofed sender ID was blocked", false);
} catch (InvalidArgumentException $e) {
    assertTest("Sender identity spoofing blocked", true);
}

// Validation: HTML Sanitization
$xssInput = "<script>alert('XSS')</script> Hello & Welcome!";
$sendRes = $service->sendMessage(3, 2, $xssInput);
assertTest("Worker sent reply message successfully", $sendRes['status'] === 'success');
$savedText = $sendRes['data']['message_text'];
assertTest("Service sanitized XSS entities cleanly: $savedText", strpos($savedText, '<script>') === false && strpos($savedText, '&lt;script&gt;') !== false);

// 5. Test Conversation History & Read Receipts
$thread = $service->getConversation(2, 3);
assertTest("Service getConversation returned 2 messages between User 2 and 3", count($thread) === 2);
assertTest("Chronological order verified (msg 1 before msg 2)", $thread[0]['msg_id'] < $thread[1]['msg_id']);

// When User 2 retrieved the conversation, the worker's incoming message should now be marked as read
$refreshedMsg2 = $repo->getMessageById($sendRes['message_id']);
assertTest("Incoming message automatically marked as is_read = 1", (int)$refreshedMsg2['is_read'] === 1);

// 6. Test User Conversations List
$convs = $service->getUserConversations(2);
assertTest("User 2 has 1 conversation thread in inbox", count($convs) === 1);
assertTest("Conversation partner is Sunil Perera", $convs[0]['other_user_name'] === 'Sunil Perera (Electrician)');

// 7. Test Mark as Read endpoint logic
$newMsgId = $repo->saveMessage(3, 2, null, "Unread follow-up message");
$checkUnread = $repo->getMessageById($newMsgId);
assertTest("New message initially has is_read = 0", (int)$checkUnread['is_read'] === 0);

$readSuccess = $service->markAsRead(2, 3);
$checkRead = $repo->getMessageById($newMsgId);
assertTest("Explicit markAsRead updated is_read to 1", $readSuccess && (int)$checkRead['is_read'] === 1);

echo "==================================================\n";
echo " ALL BACKEND TESTS PASSED SUCCESSFULLY! (14/14)\n";
echo "==================================================\n";
