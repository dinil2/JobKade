<?php
// database/update_subscription_plans.php
require_once __DIR__ . '/../config/Database.php';

$pdo = Database::getConnection();

echo "Updating subscription_plans table to Monthly (Rs. 3,000) and Yearly (Rs. 30,000)...\n";

// Clear existing plans and insert exactly Monthly (3000) and Yearly (30000)
$pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
$pdo->exec("TRUNCATE TABLE subscription_plans;");

$stmt = $pdo->prepare("INSERT INTO subscription_plans (id, name, price, duration_days, features, is_active) VALUES (?, ?, ?, ?, ?, 1)");

$plans = [
    [
        1,
        'Monthly Plan',
        3000.00,
        30,
        '5% platform commission rate (Save 50%), Unlimited customer job board access, Verified worker priority badge, In-app direct messaging'
    ],
    [
        2,
        'Yearly Plan',
        30000.00,
        365,
        '5% platform commission rate (Save 50%), 2 Months Free (Save Rs. 6,000), Top search and map ranking, Unlimited job applications, VIP support'
    ]
];

foreach ($plans as $p) {
    $stmt->execute($p);
    echo "Inserted plan #{$p[0]}: {$p[1]} - Rs. " . number_format($p[2], 2) . " ({$p[3]} days)\n";
}

$pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
echo "Subscription plans updated successfully!\n";
