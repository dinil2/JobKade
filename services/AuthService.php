<?php
// services/AuthService.php

require_once __DIR__ . '/../repositories/UserRepository.php';
require_once __DIR__ . '/../repositories/WorkerRepository.php';
require_once __DIR__ . '/../repositories/KycRepository.php';
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

        if (!in_array($role, ['customer', 'worker', 'admin'])) {
            $role = 'customer';
        }

        if (empty($fullName) || strlen($fullName) < 2) {
            throw new InvalidArgumentException("Full name is required (at least 2 characters).");
        }

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException("A valid email address is required.");
        }

        if (strlen($password) < 6) {
            throw new InvalidArgumentException("Password must be at least 6 characters long.");
        }

        if (empty($phone)) {
            throw new InvalidArgumentException("Phone number is required.");
        }

        if ($role === 'worker') {
            $nic = trim((string)($data['nic'] ?? ''));
            if (empty($nic)) {
                throw new InvalidArgumentException("National Identity Card (NIC) number is mandatory for worker registration.");
            }

            // KYC (NIC) Document is a MUST
            $nicFile = $files['nic_document'] ?? $files['nic_file'] ?? null;
            $hasNicUpload = ($nicFile && isset($nicFile['error']) && $nicFile['error'] === UPLOAD_ERR_OK);
            $hasNicPath = !empty($data['nic_document']) && is_string($data['nic_document']);
            if (!$hasNicUpload && !$hasNicPath) {
                throw new InvalidArgumentException("National Identity Card (NIC) document upload is mandatory for worker KYC verification.");
            }

            // Police Clearance Report is a MUST
            $policeFile = $files['police_report'] ?? $files['police_file'] ?? null;
            $hasPoliceUpload = ($policeFile && isset($policeFile['error']) && $policeFile['error'] === UPLOAD_ERR_OK);
            $hasPolicePath = !empty($data['police_report']) && is_string($data['police_report']);
            if (!$hasPoliceUpload && !$hasPolicePath) {
                throw new InvalidArgumentException("Police clearance report upload is mandatory for worker registration.");
            }
        }

        if (empty($username)) {
            $username = explode('@', $email)[0] . rand(10, 99);
        }

        if ($this->userRepo->findByEmail($email)) {
            throw new Exception("A user with this email address already exists.");
        }

        if ($this->userRepo->findByUsername($username)) {
            $username .= rand(100, 999);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $userId = $this->userRepo->create($fullName, $username, $email, $passwordHash, $role, $phone);

        $workerProfileId = null;
        if ($role === 'worker') {
            $workerProfileId = $this->workerRepo->createProfile($userId, [
                'bio'               => $data['bio'] ?? 'Skilled service professional.',
                'service_radius_km' => (int)($data['service_radius_km'] ?? 15),
                'latitude'          => (float)($data['latitude'] ?? 6.9271),
                'longitude'         => (float)($data['longitude'] ?? 79.8612),
                'address'           => $data['address'] ?? $data['location'] ?? 'Colombo',
                'working_hours'     => $data['working_hours'] ?? '8:00 AM - 6:00 PM'
            ]);

            // Assign category by ID or name
            $catMap = [
                'electrical' => 1, 'plumbing' => 2, 'ac repair' => 3, 'ac-repair' => 3,
                'painting' => 4, 'carpentry' => 5, 'masonry' => 6, 'cleaning' => 7,
                'appliance repair' => 8, 'appliance-repair' => 8, 'other' => 9
            ];
            $catId = (int)($data['category_id'] ?? 0);
            if ($catId <= 0 && !empty($data['service'])) {
                $slug = strtolower(trim((string)$data['service']));
                $catId = $catMap[$slug] ?? 1;
            }
            if ($catId > 0) {
                $this->workerRepo->setWorkerCategories($workerProfileId, [$catId]);
            }

            // Save Mandatory KYC Document (NIC)
            $nicPath = $this->processKycUpload($files['nic_document'] ?? $files['nic_file'] ?? null, $data['nic_document'] ?? null, 'nic', $workerProfileId);
            $this->kycRepo->createKycRecord($workerProfileId, 'nic', "National Identity Card (NIC: {$nic})", $nicPath);

            // Save Mandatory Police Report
            $policePath = $this->processKycUpload($files['police_report'] ?? $files['police_file'] ?? null, $data['police_report'] ?? null, 'police', $workerProfileId);
            $this->kycRepo->createKycRecord($workerProfileId, 'police_report', "Police Clearance Report", $policePath);

            // Save Optional Qualification / Certificate (if provided)
            $qualFile = $files['qualification_document'] ?? $files['qualification_file'] ?? $files['trade_certificate'] ?? null;
            $qualData = $data['qualification_document'] ?? $data['trade_certificate'] ?? null;
            if (($qualFile && isset($qualFile['error']) && $qualFile['error'] === UPLOAD_ERR_OK) || !empty($qualData)) {
                $qualPath = $this->processKycUpload($qualFile, $qualData, 'qualification', $workerProfileId);
                $this->kycRepo->createKycRecord($workerProfileId, 'trade_certificate', "Worker Qualification Certificate", $qualPath);
            }

            // Set worker verification status to 'pending'
            $this->workerRepo->updateVerificationStatus($workerProfileId, 'pending');
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
                throw new InvalidArgumentException("File {$file['name']} exceeds 5MB limit.");
            }
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, self::ALLOWED_EXTS, true)) {
                throw new InvalidArgumentException("Invalid file format for {$file['name']}. Allowed: PDF, PNG, JPG, JPEG.");
            }
            $uniqueName = $prefix . '_' . $workerId . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
            $dest = $uploadDir . '/' . $uniqueName;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                return 'uploads/kyc/' . $uniqueName;
            }
        }

        if (is_string($dataValue) && !empty($dataValue)) {
            return trim($dataValue);
        }

        return 'uploads/kyc/' . $prefix . '_' . $workerId . '_' . time() . '.pdf';
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
            throw new Exception("This account has been suspended by administration.");
        }

        $isValid = password_verify($password, $user['password_hash']);
        if (!$isValid && $user['password_hash'] === $password) {
            $isValid = true; // Fallback for raw seed passwords
        }

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
                'id'        => (int)$user['id'],
                'name'      => $user['full_name'],
                'username'  => $user['username'],
                'email'     => $user['email'],
                'role'      => $user['role'],
                'phone'     => $user['phone'],
                'worker'    => $workerProfile
            ]
        ];
    }

    public function me(int $userId): ?array {
        $user = $this->userRepo->findById($userId);
        if (!$user) return null;

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
                throw new InvalidArgumentException("Full name must be at least 2 characters.");
            }
            $clean['full_name'] = $name;
        }

        if (isset($data['phone'])) {
            $phone = trim(strip_tags((string)$data['phone']));
            if (!empty($phone) && !preg_match('/^[0-9+\s-]{9,15}$/', $phone)) {
                throw new InvalidArgumentException("Please provide a valid phone number (9-15 digits).");
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
            throw new InvalidArgumentException("New password must be at least 6 characters long.");
        }

        $currentHash = $this->userRepo->getPasswordHash($userId);
        if (!$currentHash) {
            throw new InvalidArgumentException("User account not found.");
        }

        if (!empty($oldPassword) && !password_verify($oldPassword, $currentHash)) {
            throw new InvalidArgumentException("Current password is incorrect.");
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $this->userRepo->updatePassword($userId, $newHash);

        return [
            'status'  => 'success',
            'message' => 'Password updated successfully!'
        ];
    }
}
