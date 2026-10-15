<?php
// services/EmailService.php

if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    require_once __DIR__ . '/../vendor/autoload.php';
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

class EmailService {
    private array $config;

    public function __construct() {
        $configFile = __DIR__ . '/../config/mail.php';
        if (file_exists($configFile)) {
            $this->config = require $configFile;
        } else {
            $this->config = [
                'host'       => 'smtp.gmail.com',
                'port'       => 587,
                'encryption' => 'tls',
                'username'   => 'jobkade7@gmail.com',
                'password'   => '',
                'from_email' => 'jobkade7@gmail.com',
                'from_name'  => 'JobKade',
            ];
        }
    }

    /**
     * Create and configure a PHPMailer instance with SMTP settings.
     */
    private function createMailer(): PHPMailer {
        $mail = new PHPMailer(true);

        $mail->isSMTP();
        $mail->Host       = $this->config['host'] ?: 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = trim((string)$this->config['username']);
        $mail->Password   = str_replace(' ', '', (string)$this->config['password']);

        $encryption = strtolower((string)($this->config['encryption'] ?? 'tls'));
        if ($encryption === 'ssl') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }
        $mail->Port       = (int)($this->config['port'] ?: 587);
        $mail->CharSet    = 'UTF-8';

        $fromEmail = !empty($this->config['from_email']) ? $this->config['from_email'] : $this->config['username'];
        $fromName  = !empty($this->config['from_name']) ? $this->config['from_name'] : 'JobKade';
        $mail->setFrom($fromEmail, $fromName);

        return $mail;
    }

    /**
     * Send an HTML email via PHPMailer and Gmail SMTP with retry mechanism (up to 3 attempts).
     * Never throws exceptions; catches all errors, logs them, and returns false on failure.
     *
     * @param string $toEmail
     * @param string $toName
     * @param string $subject
     * @param string $htmlBody
     * @return bool
     */
    public function send(string $toEmail, string $toName, string $subject, string $htmlBody): bool {
        if (empty($toEmail) || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            error_log("EmailService: Invalid recipient email address '{$toEmail}'");
            return false;
        }

        if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            error_log("EmailService: PHPMailer class not found. Ensure composer dependencies are installed.");
            return false;
        }

        // If credentials are empty placeholders, log and gracefully return false without throwing
        if (empty($this->config['username']) || empty($this->config['password'])) {
            error_log("EmailService: SMTP credentials (username/password) are not set in config/mail.php. Email to '{$toEmail}' logged but not sent.");
            return false;
        }

        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            $mail = null;
            try {
                $mail = $this->createMailer();
                $mail->addAddress($toEmail, $toName ?: $toEmail);
                $mail->isHTML(true);
                $mail->Subject = $subject;
                $mail->Body    = $htmlBody;
                $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $htmlBody));

                $mail->send();
                return true;
            } catch (Throwable $e) {
                if ($attempt < $maxAttempts) {
                    error_log("EmailService attempt {$attempt}/{$maxAttempts} failed sending to {$toEmail} [Subject: {$subject}]: " . $e->getMessage() . ". Retrying in 2 seconds...");
                    sleep(2);
                } else {
                    error_log("EmailService failure sending to {$toEmail} [Subject: {$subject}]: " . $e->getMessage());
                    return false;
                }
            } finally {
                if ($mail) {
                    try {
                        $mail->smtpClose();
                    } catch (Throwable $ce) {}
                }
            }
        }

        return false;
    }

    /**
     * Send multiple HTML emails reusing a single SMTP connection with SMTPKeepAlive = true.
     * Includes a 1-second delay between emails to protect against Gmail throttling,
     * and retry mechanism on failure (up to 3 attempts per email).
     *
     * @param array $emails Array of email descriptors, each with keys: 'to' (or 'to_email'), 'name' (or 'to_name'), 'subject', 'body'
     * @return array Array of bool results indicating success/failure per email
     */
    public function sendMultiple(array $emails): array {
        if (empty($emails)) {
            return [];
        }

        if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            error_log("EmailService: PHPMailer class not found. Ensure composer dependencies are installed.");
            return array_fill(0, count($emails), false);
        }

        if (empty($this->config['username']) || empty($this->config['password'])) {
            error_log("EmailService: SMTP credentials (username/password) are not set in config/mail.php. Multiple emails logged but not sent.");
            return array_fill(0, count($emails), false);
        }

        $results = [];
        $mail = null;

        try {
            $mail = $this->createMailer();
            $mail->SMTPKeepAlive = true;
        } catch (Throwable $initEx) {
            error_log("EmailService sendMultiple: Failed to initialize mailer: " . $initEx->getMessage());
            return array_fill(0, count($emails), false);
        }

        $index = 0;
        foreach ($emails as $key => $item) {
            if ($index > 0) {
                sleep(1); // 1-second delay between emails for extra throttle protection
            }
            $index++;

            $toEmail = $item['to'] ?? $item['to_email'] ?? '';
            $toName  = $item['name'] ?? $item['to_name'] ?? '';
            $subject = $item['subject'] ?? '';
            $body    = $item['body'] ?? $item['html'] ?? $item['htmlBody'] ?? $item['html_body'] ?? '';

            if (empty($toEmail) || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
                error_log("EmailService: Invalid recipient email address '{$toEmail}' in sendMultiple");
                $results[$key] = false;
                continue;
            }

            $itemSuccess = false;
            $maxAttempts = 3;

            for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
                try {
                    $mail->clearAddresses();
                    $mail->clearAttachments();
                    $mail->clearCustomHeaders();
                    $mail->clearReplyTos();

                    $mail->addAddress($toEmail, $toName ?: $toEmail);
                    $mail->isHTML(true);
                    $mail->Subject = $subject;
                    $mail->Body    = $body;
                    $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $body));

                    $mail->send();
                    $itemSuccess = true;
                    break;
                } catch (Throwable $e) {
                    try {
                        $mail->smtpClose();
                    } catch (Throwable $ce) {}

                    if ($attempt < $maxAttempts) {
                        error_log("EmailService sendMultiple attempt {$attempt}/{$maxAttempts} failed sending to {$toEmail} [Subject: {$subject}]: " . $e->getMessage() . ". Retrying in 2 seconds...");
                        sleep(2);
                    } else {
                        error_log("EmailService sendMultiple failure sending to {$toEmail} [Subject: {$subject}]: " . $e->getMessage());
                    }
                }
            }

            $results[$key] = $itemSuccess;
        }

        if ($mail) {
            try {
                $mail->smtpClose();
            } catch (Throwable $ce) {}
        }

        return $results;
    }
}
