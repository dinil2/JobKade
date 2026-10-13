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
     * Send an HTML email via PHPMailer and Gmail SMTP.
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

        try {
            $mail = new PHPMailer(true);

            // Server settings
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

            // CharSet
            $mail->CharSet = 'UTF-8';

            // Recipients
            $fromEmail = !empty($this->config['from_email']) ? $this->config['from_email'] : $this->config['username'];
            $fromName  = !empty($this->config['from_name']) ? $this->config['from_name'] : 'JobKade';
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($toEmail, $toName ?: $toEmail);

            // Content
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $htmlBody;
            $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $htmlBody));

            $mail->send();
            return true;
        } catch (Throwable $e) {
            error_log("EmailService failure sending to {$toEmail} [Subject: {$subject}]: " . $e->getMessage());
            return false;
        }
    }
}
