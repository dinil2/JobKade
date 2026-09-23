<?php
require_once __DIR__ . '/../config/Database.php';

$db = Database::getConnection();
$cols = $db->query('DESCRIBE worker_profiles')->fetchAll(PDO::FETCH_ASSOC);
echo "worker_profiles columns:\n";
foreach ($cols as $c) {
    echo " - " . $c['Field'] . " (" . $c['Type'] . ")\n";
}

$kcols = $db->query('DESCRIBE kyc_documents')->fetchAll(PDO::FETCH_ASSOC);
echo "kyc_documents columns:\n";
foreach ($kcols as $c) {
    echo " - " . $c['Field'] . " (" . $c['Type'] . ")\n";
}
