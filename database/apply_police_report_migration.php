<?php
require_once __DIR__ . "/../config/Database.php";

try {
    $db = Database::getConnection();
    echo "Connected to database successfully.`n";

    $sql = "ALTER TABLE kyc_documents 
            MODIFY COLUMN document_type ENUM('nic', 'driving_license', 'trade_certificate', 'police_report') NOT NULL";
    
    $db->exec($sql);
    echo "Successfully updated kyc_documents.document_type ENUM to include police_report.`n";

    $stmt = $db->query("SHOW COLUMNS FROM kyc_documents LIKE 'document_type'");
    $col = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Current column definition: " . $col["Type"] . "`n";

} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "`n";
    exit(1);
}

