<?php
// config/db.php

class Database {
    private static string $host = '127.0.0.1';
    private static string $dbName = 'jobkade_db';
    private static string $username = 'root';
    private static string $password = ''; // Default WampServer / phpMyAdmin MySQL root password is empty
    private static string $port = '3306';  // Default MySQL port in WampServer
    private static ?PDO $pdo = null;

    /**
     * Get a PDO database connection instance.
     *
     * @return PDO
     * @throws PDOException
     */
    public static function getConnection(): PDO {
        if (self::$pdo === null) {
            $dsn = "mysql:host=" . self::$host . ";port=" . self::$port . ";dbname=" . self::$dbName . ";charset=utf8mb4";
            
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                self::$pdo = new PDO($dsn, self::$username, self::$password, $options);
            } catch (PDOException $e) {
                // If connecting to port 3306 fails, also try standard default without port in case of socket
                try {
                    $dsnFallback = "mysql:host=" . self::$host . ";dbname=" . self::$dbName . ";charset=utf8mb4";
                    self::$pdo = new PDO($dsnFallback, self::$username, self::$password, $options);
                } catch (PDOException $ex) {
                    http_response_code(500);
                    echo json_encode([
                        'status' => 'error',
                        'message' => 'Database connection failed. Please ensure MySQL is running in WampServer and the database "logindemo_db" exists.',
                        'error' => $ex->getMessage()
                    ]);
                    exit();
                }
            }
        }

        return self::$pdo;
    }

    /**
     * Helper to get database connection configuration
     */
    public static function getConfig(): array {
        return [
            'host' => self::$host,
            'port' => self::$port,
            'dbname' => self::$dbName,
            'username' => self::$username
        ];
    }
}
