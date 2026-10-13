<?php
// config/mail.php
// Gmail SMTP Configuration for JobKade

return [
    'host'       => getenv('MAIL_HOST') ?: 'smtp.gmail.com',
    'port'       => (int)(getenv('MAIL_PORT') ?: 587),
    'encryption' => getenv('MAIL_ENCRYPTION') ?: 'tls',
    'username'   => getenv('MAIL_USERNAME') ?: 'jobkade7@gmail.com',
    'password'   => str_replace(' ', '', getenv('MAIL_PASSWORD') ?: 'aspiduwlvnkmzgsa'),
    'from_email' => getenv('MAIL_FROM_ADDRESS') ?: 'jobkade7@gmail.com',
    'from_name'  => getenv('MAIL_FROM_NAME') ?: 'JobKade',
];
