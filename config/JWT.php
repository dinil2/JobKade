<?php
// config/JWT.php
// Pure PHP JSON Web Token (JWT) implementation (HMAC-SHA256)

class JWT {
    private static string $secretKey = '';

    private static function getSecretKey(): string {
        if (self::$secretKey === '') {
            self::$secretKey = (string)(getenv('JOBKADE_JWT_SECRET') ?: 'JobKade_Super_Secure_Secret_Key_2026_ICBT_CSE5015!');
        }
        return self::$secretKey;
    }

    /**
     * Generate a signed JWT token.
     *
     * @param array $payload
     * @param int $expirySeconds Default 24 hours
     * @return string
     */
    public static function encode(array $payload, int $expirySeconds = 86400): string {
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $now = time();
        $payload['iat'] = $now;
        $payload['exp'] = $now + $expirySeconds;

        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::getSecretKey(), true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    /**
     * Decode and verify a signed JWT token.
     *
     * @param string $token
     * @return array|null Returns payload on success, null on invalid/expired
     */
    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($headerB64, $payloadB64, $signatureB64) = $parts;

        $expectedSig = hash_hmac('sha256', $headerB64 . "." . $payloadB64, self::getSecretKey(), true);
        $expectedSigB64 = self::base64UrlEncode($expectedSig);

        if (!hash_equals($expectedSigB64, $signatureB64)) {
            return null; // Invalid signature
        }

        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
            return null; // Expired or malformed
        }

        return $payload;
    }

    /**
     * Extract Bearer token from HTTP Authorization header.
     *
     * @return string|null
     */
    public static function getBearerToken(): ?string {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
        if (!$authHeader && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        }

        if ($authHeader && preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Get authenticated user payload from current request.
     *
     * @return array|null
     */
    public static function getAuthUser(): ?array {
        $token = self::getBearerToken();
        if (!$token) {
            return null;
        }
        return self::decode($token);
    }

    private static function base64UrlEncode(string $data): string {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
    }

    private static function base64UrlDecode(string $data): string {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
    }
}
