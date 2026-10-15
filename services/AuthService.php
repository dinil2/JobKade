<?php
// services/AuthService.php

require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../repositories/WorkerRepository.php';
require_once __DIR__ . '/../repositories/KycRepository.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/JWT.php';

class AuthService {
    private UserRepository $userRepo;
    private WorkerRepository $workerRepo;
    private KycRepository $kycRepo;
    private const MAX_FILE_SIZE = 5242880; // 5 MB
    private const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg'];

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->workerRepo = new WorkerRepository();
        $this->kycRepo = new KycRepository();
    }

    public function register(array $data, ?array $files = null): array {
        $fullName = trim(strip_tags((string)($data['full_name'] ?? $data['name'] ?? $data['fullName'] ?? '')));
        $username = trim(strip_tags((string)($data['username'] ?? '')));
        $email    = trim(strip_tags((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');
        $role     = strtolower((string)($data['role'] ?? 'customer'));
        $phone    = trim(strip_tags((string)($data['phone'] ?? '')));

        if (!in_array($role, ['customer', 'worker'])) {
            $role = 'customer';
        }

        if (empty($fullName) || strlen($fullName) < 2) {
            throw new InvalidArgumentException("Name must be at least 2 characters.");
        }

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("Enter a valid email.");
        }

        if (strlen($password) < 6) {
            throw new InvalidArgumentException("Password must be at least 6 characters.");
        }

        if (empty($phone)) {
            throw new InvalidArgumentException("Phone number is required.");
        }

        if ($role === 'worker') {
            $nic = trim((string)($data['nic'] ?? ''));
            if (empty($nic)) {
                throw new InvalidArgumentException("NIC number is required.");
            }

            $coverAll = !empty($data['cover_all_cities']) || (!empty($data['coverage_mode']) && $data['coverage_mode'] === 'all');
            $cities = $data['cities'] ?? ($data['coverage_cities'] ?? []);
            if (is_string($cities)) {
                $decoded = json_decode($cities, true);
                $cities = is_array($decoded) ? $decoded : array_filter(array_map('trim', explode(',', $cities)));
            }
            if (!$coverAll && is_array($cities) && count($cities) > 3) {
                throw new InvalidArgumentException("Maximum 3 cities can be selected.");
            }

            // Parse and validate worker services (1 or 2 required at registration)
            $parsedServices = [];
            if (!empty($data['services'])) {
                if (is_string($data['services'])) {
                    $decodedSrv = json_decode($data['services'], true);
                    if (is_array($decodedSrv)) {
                        $parsedServices = $decodedSrv;
                    }
                } elseif (is_array($data['services'])) {
                    $parsedServices = $data['services'];
                }
            }

            // Fallback to individual fields if $data['services'] was not a list
            if (empty($parsedServices) && (!empty($data['service_1_title']) || !empty($data['service_1_category']))) {
                $parsedServices[] = [
                    'category_id' => (int)($data['service_1_category'] ?? 0),
                    'title'       => trim((string)($data['service_1_title'] ?? '')),
                    'hourly_rate' => (float)($data['service_1_rate'] ?? 0)
                ];
                if (!empty($data['has_service_2']) || !empty($data['service_2_title']) || !empty($data['service_2_category'])) {
                    $parsedServices[] = [
                        'category_id' => (int)($data['service_2_category'] ?? 0),
                        'title'       => trim((string)($data['service_2_title'] ?? '')),
                        'hourly_rate' => (float)($data['service_2_rate'] ?? 0)
                    ];
                }
            }

            // Fallback for legacy registration payload
            if (empty($parsedServices)) {
                $legacyCat = (int)($data['category_id'] ?? 0);
                if ($legacyCat <= 0 && !empty($data['service'])) {
                    $catMap = [
                        'electrical' => 1, 'plumbing' => 2, 'ac repair' => 3, 'ac-repair' => 3,
                        'painting' => 4, 'carpentry' => 5, 'masonry' => 6, 'cleaning' => 7,
                        'appliance repair' => 8, 'appliance-repair' => 8, 'other' => 9
                    ];
                    $legacyCat = $catMap[strtolower(trim((string)$data['service']))] ?? 1;
                }
                $legacyRate = (float)($data['hourly_rate'] ?? 1000.00);
                $legacyTitle = !empty($data['service']) ? (string)$data['service'] : 'General Service';
                if ($legacyCat > 0) {
                    $parsedServices[] = [
                        'category_id' => $legacyCat,
                        'title'       => $legacyTitle,
                        'hourly_rate' => $legacyRate > 0 ? $legacyRate : 1000.00
                    ];
                }
            }

            if (count($parsedServices) < 1 || count($parsedServices) > 2) {
                throw new InvalidArgumentException("Please configure 1 or 2 services for registration.");
            }

            // Validate Service 1
            $s1 = $parsedServices[0];
            $s1Cat = (int)($s1['category_id'] ?? 0);
            $s1Title = trim((string)($s1['title'] ?? ''));
            $s1Rate = (float)($s1['hourly_rate'] ?? ($s1['price'] ?? 0));

            if ($s1Cat <= 0) {
                throw new InvalidArgumentException("Please select a category for Service 1.");
            }
            if (empty($s1Title) || strlen($s1Title) < 3) {
                throw new InvalidArgumentException("Service 1 title must be at least 3 characters.");
            }
            if ($s1Rate <= 0) {
                throw new InvalidArgumentException("Service 1 hourly rate must be greater than 0.");
            }

            // Validate Service 2 if present
            if (count($parsedServices) > 1) {
                $s2 = $parsedServices[1];
                $s2Cat = (int)($s2['category_id'] ?? 0);
                $s2Title = trim((string)($s2['title'] ?? ''));
                $s2Rate = (float)($s2['hourly_rate'] ?? ($s2['price'] ?? 0));

                if ($s2Cat <= 0) {
                    throw new InvalidArgumentException("Please select a category for Service 2.");
                }
                if (empty($s2Title) || strlen($s2Title) < 3) {
                    throw new InvalidArgumentException("Service 2 title must be at least 3 characters.");
                }
                if ($s2Rate <= 0) {
                    throw new InvalidArgumentException("Service 2 hourly rate must be greater than 0.");
                }
            }
        }

        if (empty($username)) {
            $username = explode('@', $email)[0] . rand(10, 99);
        }

        if ($this->userRepo->findByEmail($email)) {
            throw new Exception("Email is already registered.");
        }

        if ($this->userRepo->findByUsername($username)) {
            $username .= rand(100, 999);
        }

        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        try {
            $passwordHash = password_hash($password, PASSWORD_BCRYPT);
            $userId = $this->userRepo->create($fullName, $username, $email, $passwordHash, $role, $phone);

            $workerProfileId = null;
            if ($role === 'worker') {
                $district = trim((string)($data['district'] ?? $data['location'] ?? $data['address'] ?? 'Colombo'));
                if (empty($district)) {
                    $district = 'Colombo';
                }

                $primaryRate = (float)($parsedServices[0]['hourly_rate'] ?? ($parsedServices[0]['price'] ?? 1000.00));
                $workerProfileId = $this->workerRepo->createProfile($userId, [
                    'bio'           => $data['bio'] ?? 'Skilled service professional.',
                    'address'       => $district,
                    'district'      => $district,
                    'working_hours' => $data['working_hours'] ?? '8:00 AM - 6:00 PM',
                    'hourly_rate'   => $primaryRate
                ]);

                try {
                    $pdo->prepare("UPDATE worker_profiles SET hourly_rate = :hr WHERE id = :wid")
                        ->execute([':hr' => $primaryRate, ':wid' => $workerProfileId]);
                } catch (Throwable $e) {}

                // Save worker coverage
                $coverAll = !empty($data['cover_all_cities']) || (!empty($data['coverage_mode']) && $data['coverage_mode'] === 'all');
                $cities = $data['cities'] ?? ($data['coverage_cities'] ?? []);
                if (is_string($cities)) {
                    $decoded = json_decode($cities, true);
                    $cities = is_array($decoded) ? $decoded : array_filter(array_map('trim', explode(',', $cities)));
                }
                if (!is_array($cities)) {
                    $cities = [];
                }
                if (!$coverAll && empty($cities)) {
                    $coverAll = true; // default fallback
                }
                $this->workerRepo->setCoverage($workerProfileId, $district, $cities, $coverAll);

                try {
                    $pdo->prepare("UPDATE users SET address = :addr WHERE id = :uid")->execute([':addr' => $district, ':uid' => $userId]);
                } catch (Throwable $e) {}

                // Save 1 or 2 services to worker_services with pricing_type = 'hourly' and rate stored in price
                $savedCatIds = [];
                $srvInsertStmt = $pdo->prepare("
                    INSERT INTO worker_services 
                    (worker_id, category_id, title, description, price, pricing_type, location, district, is_available, created_at)
                    VALUES 
                    (:wid, :cid, :title, :desc, :price, 'hourly', :loc, :dist, 1, NOW())
                ");

                foreach ($parsedServices as $srv) {
                    $srvCatId = (int)$srv['category_id'];
                    $srvTitle = trim((string)$srv['title']);
                    $srvRate = (float)($srv['hourly_rate'] ?? ($srv['price'] ?? 1000.00));

                    $catName = 'Professional Service';
                    try {
                        $cStmt = $pdo->prepare("SELECT name FROM categories WHERE id = :cid LIMIT 1");
                        $cStmt->execute([':cid' => $srvCatId]);
                        $cRow = $cStmt->fetch(PDO::FETCH_ASSOC);
                        if ($cRow && !empty($cRow['name'])) {
                            $catName = $cRow['name'];
                        }
                    } catch (Throwable $ce) {}

                    $srvDesc = "Professional {$catName} ({$srvTitle}) services in {$district} and surrounding areas.";

                    $srvInsertStmt->execute([
                        ':wid'   => $workerProfileId,
                        ':cid'   => $srvCatId,
                        ':title' => $srvTitle,
                        ':desc'  => $srvDesc,
                        ':price' => $srvRate,
                        ':loc'   => $district,
                        ':dist'  => $district
                    ]);

                    $savedCatIds[] = $srvCatId;
                }

                // Update worker categories mapping
                if (!empty($savedCatIds)) {
                    $this->workerRepo->setWorkerCategories($workerProfileId, $savedCatIds, $savedCatIds[0]);
                }

                $hasUploadedDocs = false;

                // Process Optional KYC Document (NIC) if provided
                $nicFile = $files['nic_document'] ?? $files['nic_file'] ?? null;
                $hasNicUpload = ($nicFile && isset($nicFile['error']) && $nicFile['error'] === UPLOAD_ERR_OK);
                $hasNicPath = !empty($data['nic_document']) && is_string($data['nic_document']) && str_starts_with(trim($data['nic_document']), 'uploads/kyc/') && !str_contains($data['nic_document'], '..');
                if ($hasNicUpload || $hasNicPath) {
                    $nicPath = $this->processKycUpload($nicFile, $data['nic_document'] ?? null, 'nic', $workerProfileId);
                    $this->kycRepo->createKycRecord($workerProfileId, 'nic', "National Identity Card (NIC: {$nic})", $nicPath);
                    $hasUploadedDocs = true;
                }

                // Process Optional Police Report if provided
                $policeFile = $files['police_report'] ?? $files['police_file'] ?? null;
                $hasPoliceUpload = ($policeFile && isset($policeFile['error']) && $policeFile['error'] === UPLOAD_ERR_OK);
                $hasPolicePath = !empty($data['police_report']) && is_string($data['police_report']) && str_starts_with(trim($data['police_report']), 'uploads/kyc/') && !str_contains($data['police_report'], '..');
                if ($hasPoliceUpload || $hasPolicePath) {
                    $policePath = $this->processKycUpload($policeFile, $data['police_report'] ?? null, 'police', $workerProfileId);
                    $this->kycRepo->createKycRecord($workerProfileId, 'police_report', "Police Clearance Report", $policePath);
                    $hasUploadedDocs = true;
                }

                // Process Optional Qualification / Certificate if provided
                $qualFile = $files['qualification_document'] ?? $files['qualification_file'] ?? $files['trade_certificate'] ?? null;
                $qualData = $data['qualification_document'] ?? $data['trade_certificate'] ?? null;
                if (($qualFile && isset($qualFile['error']) && $qualFile['error'] === UPLOAD_ERR_OK) || !empty($qualData)) {
                    $qualPath = $this->processKycUpload($qualFile, $qualData, 'qualification', $workerProfileId);
                    $this->kycRepo->createKycRecord($workerProfileId, 'trade_certificate', "Worker Qualification Certificate", $qualPath);
                    $hasUploadedDocs = true;
                }

                // Set worker verification status: 'pending' if docs uploaded now, or 'unverified' if documents to be added later
                $initialStatus = $hasUploadedDocs ? 'pending' : 'unverified';
                $this->workerRepo->updateVerificationStatus($workerProfileId, $initialStatus);
            }

            $pdo->commit();

            // Send registration welcome email via EmailService
            try {
                require_once __DIR__ . '/EmailService.php';
                $emailService = new EmailService();
                $subject = "Welcome to JobKade!";
                $roleTitle = ($role === 'worker') ? 'Service Professional' : 'Valued Customer';
                $htmlBody = "
                    <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">
                        <h2 style=\"color: #0284c7; margin-top: 0;\">Welcome to JobKade!</h2>
                        <p>Hi " . htmlspecialchars($fullName) . ",</p>
                        <p>Thank you for joining JobKade as a <strong>{$roleTitle}</strong>. Your account has been created successfully.</p>
                        <p>You can now log in to your account and explore verified local services across Sri Lanka.</p>
                        <div style=\"margin: 25px 0;\">
                            <a href=\"http://localhost:81/JobKade/auth/login.html\" style=\"background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;\">Log in to Your Account</a>
                        </div>
                        <p style=\"color: #64748b; font-size: 13px;\">If you have any questions or need support, reply to this email or contact us through the platform.</p>
                        <hr style=\"border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;\" />
                        <p style=\"color: #94a3b8; font-size: 12px;\">&copy; " . date('Y') . " JobKade. All rights reserved.</p>
                    </div>
                ";
                $emailService->send($email, $fullName, $subject, $htmlBody);
            } catch (Throwable $ne) {
                error_log("Failed to send registration welcome email: " . $ne->getMessage());
            }

            // Send registration welcome in-app notification via NotificationService
            try {
                require_once __DIR__ . '/NotificationService.php';
                $roleTitle = ($role === 'worker') ? 'Service Professional' : 'Valued Customer';
                NotificationService::create(
                    (int)$userId,
                    "Welcome to JobKade!",
                    "Thank you for joining JobKade as a {$roleTitle}. Your account has been created successfully.",
                    'welcome'
                );
            } catch (Throwable $ne) {
                error_log("Failed to send registration welcome notification: " . $ne->getMessage());
            }
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        // Issue JWT token
        $token = JWT::encode([
            'user_id' => $userId,
            'email'   => $email,
            'role'    => $role,
            'name'    => $fullName,
            'worker_id' => $workerProfileId
        ]);

        return [
            'status'   => 'success',
            'message'  => 'Registration successful!',
            'token'    => $token,
            'user'     => [
                'id'        => $userId,
                'name'      => $fullName,
                'username'  => $username,
                'email'     => $email,
                'role'      => $role,
                'phone'     => $phone,
                'worker_id' => $workerProfileId
            ]
        ];
    }

    private function processKycUpload(?array $file, $dataValue, string $prefix, int $workerId): string {
        $uploadDir = __DIR__ . '/../uploads/kyc';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        if ($file && isset($file['error']) && $file['error'] === UPLOAD_ERR_OK) {
            if ($file['size'] > self::MAX_FILE_SIZE) {
                throw new InvalidArgumentException("File {$file['name']} exceeds 5MB.");
            }
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, self::ALLOWED_EXTS, true)) {
                throw new InvalidArgumentException("Invalid file format for {$file['name']}. Use PDF, PNG, or JPG.");
            }
            $uniqueName = $prefix . '_' . $workerId . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $dest = $uploadDir . '/' . $uniqueName;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                return 'uploads/kyc/' . $uniqueName;
            }
        }

        if (is_string($dataValue)) {
            $trimmed = trim($dataValue);
            if (str_starts_with($trimmed, 'uploads/kyc/') && !str_contains($trimmed, '..')) {
                return $trimmed;
            }
        }

        throw new InvalidArgumentException("Valid {$prefix} file upload is required.");
    }

    public function login(string $email, string $password): array {
        if (empty($email) || empty($password)) {
            throw new InvalidArgumentException("Email and password are required.");
        }

        $user = $this->userRepo->findByEmail($email);
        if (!$user) {
            throw new Exception("Invalid email or password.");
        }

        if ($user['status'] === 'suspended') {
            throw new Exception("This account is suspended.");
        }

        $isValid = password_verify($password, $user['password_hash']);
        if (!$isValid) {
            throw new Exception("Invalid email or password.");
        }

        $workerProfile = null;
        if ($user['role'] === 'worker') {
            $workerProfile = $this->workerRepo->getProfileByUserId($user['id']);
        }

        $token = JWT::encode([
            'user_id'   => (int)$user['id'],
            'email'     => $user['email'],
            'role'      => $user['role'],
            'name'      => $user['full_name'],
            'worker_id' => $workerProfile ? (int)$workerProfile['id'] : null
        ]);

        return [
            'status'  => 'success',
            'message' => 'Login successful!',
            'token'   => $token,
            'user'    => [
                'id'              => (int)$user['id'],
                'name'            => $user['full_name'],
                'username'        => $user['username'],
                'email'           => $user['email'],
                'role'            => $user['role'],
                'phone'           => $user['phone'],
                'profile_picture' => $user['profile_picture'] ?? null,
                'avatar'          => $user['profile_picture'] ?? null,
                'worker'          => $workerProfile
            ]
        ];
    }

    public function me(int $userId): ?array {
        $user = $this->userRepo->findById($userId);
        if (!$user) return null;

        if (isset($user['profile_picture'])) {
            $user['avatar'] = $user['profile_picture'];
        }

        if ($user['role'] === 'worker') {
            $user['worker_profile'] = $this->workerRepo->getProfileByUserId($userId);
        }

        return $user;
    }

    public function updateProfile(int $userId, array $data): array {
        $clean = [];
        if (isset($data['full_name']) || isset($data['name'])) {
            $name = trim(strip_tags((string)($data['full_name'] ?? $data['name'])));
            if (empty($name) || strlen($name) < 2) {
                throw new InvalidArgumentException("Name must be at least 2 characters.");
            }
            $clean['full_name'] = $name;
        }

        if (isset($data['phone'])) {
            $phone = trim(strip_tags((string)$data['phone']));
            if (!empty($phone) && !preg_match('/^[0-9+\s-]{9,15}$/', $phone)) {
                throw new InvalidArgumentException("Enter a valid phone number.");
            }
            $clean['phone'] = $phone;
        }

        if (isset($data['address']) || isset($data['location'])) {
            $clean['address'] = trim(strip_tags((string)($data['address'] ?? $data['location'])));
        }

        if (isset($data['notification_prefs'])) {
            $clean['notification_prefs'] = $data['notification_prefs'];
        }

        $this->userRepo->updateUser($userId, $clean);
        $updatedUser = $this->userRepo->findById($userId);

        return [
            'status'  => 'success',
            'message' => 'Profile updated successfully!',
            'user'    => $updatedUser
        ];
    }

    public function changePassword(int $userId, string $oldPassword, string $newPassword): array {
        if (empty($newPassword) || strlen($newPassword) < 6) {
            throw new InvalidArgumentException("New password must be at least 6 characters.");
        }

        $currentHash = $this->userRepo->getPasswordHash($userId);
        if (!$currentHash) {
            throw new InvalidArgumentException("User account not found.");
        }

        if (empty($oldPassword) || !password_verify($oldPassword, $currentHash)) {
            throw new InvalidArgumentException("Incorrect current password.");
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $this->userRepo->updatePassword($userId, $newHash);

        return [
            'status'  => 'success',
            'message' => 'Password updated successfully!'
        ];
    }

    public function uploadProfilePicture(int $userId, ?array $file, ?string $base64Data = null): array {
        $uploadDir = __DIR__ . '/../uploads/profiles';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $relPath = null;
        $allowedExts = ['jpg', 'jpeg', 'png'];
        $maxBytes = 2 * 1024 * 1024; // 2MB

        if ($file && isset($file['error']) && $file['error'] === UPLOAD_ERR_OK) {
            if ($file['size'] > $maxBytes) {
                throw new InvalidArgumentException("File exceeds 2MB.");
            }
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $allowedExts, true)) {
                throw new InvalidArgumentException("Invalid file format. Use JPG or PNG.");
            }

            // Verify MIME type if finfo available
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mime = finfo_file($finfo, $file['tmp_name']);
                finfo_close($finfo);
                $allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
                if (!in_array($mime, $allowedMimes, true)) {
                    throw new InvalidArgumentException("Invalid image. Use JPG or PNG.");
                }
            }

            $uniqueName = 'profile_' . $userId . '_' . bin2hex(random_bytes(6)) . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
            $dest = $uploadDir . '/' . $uniqueName;
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                throw new Exception("Failed to save uploaded profile picture.");
            }
            $relPath = 'uploads/profiles/' . $uniqueName;
        } elseif (!empty($base64Data) && is_string($base64Data)) {
            $ext = 'jpg';
            if (preg_match('/^data:image\/(jpeg|jpg|png);base64,(.+)$/i', $base64Data, $matches)) {
                $ext = strtolower($matches[1]);
                $ext = ($ext === 'jpeg') ? 'jpg' : $ext;
                $decoded = base64_decode($matches[2]);
            } else {
                $cleanB64 = preg_replace('/^data:image\/[a-zA-Z0-9_-]+;base64,/', '', $base64Data);
                $decoded = base64_decode($cleanB64, true);
            }

            if (!$decoded) {
                throw new InvalidArgumentException("Invalid image data provided.");
            }

            if (strlen($decoded) > $maxBytes) {
                throw new InvalidArgumentException("Profile picture exceeds 2MB.");
            }

            $uniqueName = 'profile_' . $userId . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $dest = $uploadDir . '/' . $uniqueName;
            if (file_put_contents($dest, $decoded) === false) {
                throw new Exception("Failed to write profile image to disk.");
            }
            $relPath = 'uploads/profiles/' . $uniqueName;
        } else {
            throw new InvalidArgumentException("No profile picture uploaded.");
        }

        $this->userRepo->updateProfilePicture($userId, $relPath);

        return [
            'status'          => 'success',
            'message'         => 'Profile photo updated successfully!',
            'profile_picture' => $relPath,
            'photo_url'       => $relPath,
            'avatar'          => $relPath
        ];
    }
}
