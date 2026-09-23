<?php
// setup_db.php
// Automates database creation and migration for Job Kade

$host = '127.0.0.1';
$user = 'root';
$pass = '';
$port = '3306';
$dbname = 'jobkade_db';

$isCli = (php_sapi_name() === 'cli');

if (!$isCli) {
    echo "<!DOCTYPE html><html><head><title>Job Kade Database Setup</title><style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 680px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
        h1 { color: #38bdf8; margin-top: 0; font-size: 1.6rem; }
        .step { padding: 10px 14px; margin: 8px 0; border-radius: 8px; font-size: 0.95rem; }
        .success { background: #064e3b; color: #6ee7b7; border-left: 4px solid #10b981; }
        .info { background: #1e3a8a; color: #93c5fd; border-left: 4px solid #3b82f6; }
        .error { background: #450a0a; color: #fca5a5; border-left: 4px solid #ef4444; }
        .btn { display: inline-block; margin-top: 18px; padding: 10px 20px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; }
        .btn:hover { background: #0369a1; }
    </style></head><body><div class='card'><h1>🛠️ Job Kade Database Auto-Migration</h1>";
}

function logMsg($msg, $type = 'info') {
    global $isCli;
    if ($isCli) {
        $prefix = ($type === 'success') ? '[SUCCESS] ' : (($type === 'error') ? '[ERROR] ' : '[INFO] ');
        echo $prefix . strip_tags($msg) . PHP_EOL;
    } else {
        echo "<div class='step $type'>$msg</div>";
    }
}

try {
    // 1. Connect to MySQL server
    $pdo = null;
    try {
        $pdo = new PDO("mysql:host=$host;port=$port", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
    } catch (PDOException $e) {
        try {
            $pdo = new PDO("mysql:host=$host", $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
        } catch (PDOException $e2) {
            throw new Exception("Unable to connect to MySQL server. Please ensure WampServer MySQL service is running.");
        }
    }

    logMsg("Connected to MySQL server on host <strong>$host</strong>.", 'success');

    // 2. Read schema.sql
    $sqlFile = __DIR__ . '/database/schema.sql';
    if (!file_exists($sqlFile)) {
        throw new Exception("File database/schema.sql not found!");
    }

    $sql = file_get_contents($sqlFile);

    // 3. Execute multi-query
    $pdo->exec($sql);

    logMsg("Database <strong>`$dbname`</strong> and all 14 tables created and seeded successfully!", 'success');
    logMsg("Seeded Accounts:<br>&bull; <strong>Admin</strong>: admin@jobkade.lk (admin@123)<br>&bull; <strong>Customer</strong>: customer@gmail.com (customer@123)<br>&bull; <strong>Worker</strong>: sunil.electric@gmail.com (worker@123)", 'info');
    logMsg("Ready for use! View database at <a href='http://localhost/phpmyadmin' target='_blank' style='color:#38bdf8;'>phpMyAdmin</a>.", 'success');

    if (!$isCli) {
        echo "<a class='btn' href='index.html'>Launch Job Kade Portal &rarr;</a>";
    }

} catch (Exception $e) {
    logMsg("Setup Error: " . $e->getMessage(), 'error');
    if (!$isCli) {
        echo "<p style='color: #94a3b8;'>Ensure WampServer (Apache + MySQL) is running (green icon in taskbar).</p>";
    }
}

if (!$isCli) {
    echo "</div></body></html>";
}
