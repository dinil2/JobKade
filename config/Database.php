<?php
// config/Database.php
// Robust PDO Singleton for MySQL & phpMyAdmin

class Database {
    private static string $host = '127.0.0.1';
    private static string $dbName = 'jobkade_db';
    private static string $username = 'root';
    private static string $password = ''; // Default WampServer / phpMyAdmin MySQL root password
    private static string $port = '3306';
    private static ?PDO $pdo = null;

    public static function getConnection(): PDO {
        if (self::$pdo === null) {
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                $dsn = "mysql:host=" . self::$host . ";port=" . self::$port . ";dbname=" . self::$dbName . ";charset=utf8mb4";
                self::$pdo = new PDO($dsn, self::$username, self::$password, $options);
            } catch (PDOException $e) {
                // Try fallback host without port
                try {
                    $dsnFallback = "mysql:host=" . self::$host . ";dbname=" . self::$dbName . ";charset=utf8mb4";
                    self::$pdo = new PDO($dsnFallback, self::$username, self::$password, $options);
                } catch (PDOException $ex) {
                    if (!headers_sent()) {
                        http_response_code(500);
                        header('Content-Type: application/json; charset=UTF-8');
                    }
                    echo json_encode([
                        'status' => 'error',
                        'message' => 'Database connection failed. Please ensure MySQL is running in WampServer and run setup_db.php.',
                        'error' => $ex->getMessage()
                    ]);
                    exit();
                }
            }
        }

        return self::$pdo;
    }

    public static function getConfig(): array {
        return [
            'host' => self::$host,
            'port' => self::$port,
            'dbname' => self::$dbName,
            'username' => self::$username
        ];
    }
}
