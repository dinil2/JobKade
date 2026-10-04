<?php
// database/seed_5_workers.php
// Reset workers and seed exactly 5 verified workers with all database details

require_once __DIR__ . '/../config/Database.php';

try {
    $db = Database::getConnection();
    echo "Connected to database successfully.\n";

    // 1. Prepare KYC uploads directory with realistic sample files
    $kycDir = __DIR__ . '/../uploads/kyc';
    if (!is_dir($kycDir)) {
        mkdir($kycDir, 0777, true);
    }

    // Copy sample selfies from assets
    $workerImgMap = [
        1 => 'worker-kasun.png',
        2 => 'worker-amal.png',
        3 => 'worker-nimal.png',
        4 => 'worker-tharindu.png',
        5 => 'hero-worker.png'
    ];

    foreach ($workerImgMap as $wId => $imgName) {
        $src = __DIR__ . '/../assets/images/' . $imgName;
        $dest = $kycDir . '/selfie_worker_' . $wId . '.png';
        if (file_exists($src)) {
            copy($src, $dest);
        }
    }

    // Create sample SVG files for NIC, Police Report, and NVQ Trade Certificate
    $nicSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
        <rect width="600" height="380" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"/>
        <rect x="0" y="0" width="600" height="60" rx="16" fill="#1e3a8a"/>
        <rect x="0" y="40" width="600" height="20" fill="#1e3a8a"/>
        <text x="300" y="38" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">DEMOCRATIC SOCIALIST REPUBLIC OF SRI LANKA</text>
        <text x="300" y="85" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a" text-anchor="middle">NATIONAL IDENTITY CARD / ජාතික හැඳුනුම්පත</text>
        <rect x="40" y="110" width="130" height="160" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
        <circle cx="105" cy="165" r="35" fill="#64748b"/>
        <path d="M60 250 Q105 210 150 250" fill="#64748b"/>
        <text x="200" y="135" font-family="Arial, sans-serif" font-size="14" fill="#64748b">Identity No / හැඳුනුම් අංකය:</text>
        <text x="200" y="160" font-family="Courier New, monospace" font-size="18" font-weight="bold" fill="#0f172a">198523401928 V</text>
        <text x="200" y="195" font-family="Arial, sans-serif" font-size="14" fill="#64748b">Full Name / සම්පූර්ණ නම:</text>
        <text x="200" y="220" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">REGISTERED CITIZEN / SKILLED PROFESSIONAL</text>
        <text x="200" y="255" font-family="Arial, sans-serif" font-size="14" fill="#64748b">Date of Birth: 1985-08-22 | Sex: M</text>
        <rect x="40" y="300" width="520" height="50" rx="6" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="55" y="330" font-family="Courier New, monospace" font-size="13" fill="#334155">&lt;&lt;IDLKA1985234019284&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;VERIFIED&lt;JOBKADE&lt;&lt;</text>
    </svg>';
    file_put_contents($kycDir . '/sample_nic.svg', $nicSvg);

    $policeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500" viewBox="0 0 600 500">
        <rect width="600" height="500" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="0" y="0" width="600" height="50" rx="12" fill="#047857"/>
        <rect x="0" y="35" width="600" height="15" fill="#047857"/>
        <text x="300" y="32" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">SRI LANKA POLICE HEADQUARTERS — CLEARANCE DIVISION</text>
        <text x="300" y="85" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a" text-anchor="middle">POLICE CLEARANCE CERTIFICATE / පොලිස් සහතිකය</text>
        <text x="300" y="110" font-family="Arial, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Reference: POL/HQ/CLEAR/2026/88921B | Issued Date: 2026-08-15</text>
        <line x1="40" y1="125" x2="560" y2="125" stroke="#e2e8f0" stroke-width="2"/>
        <text x="60" y="160" font-family="Arial, sans-serif" font-size="14" fill="#334155">This is to certify that the applicant has no adverse criminal record or pending legal</text>
        <text x="60" y="185" font-family="Arial, sans-serif" font-size="14" fill="#334155">proceedings registered under the jurisdiction of the Colombo Metropolitan Division.</text>
        <rect x="60" y="215" width="480" height="120" rx="8" fill="#f0fdf4" stroke="#86efac"/>
        <text x="80" y="250" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#166534">CLEARANCE STATUS: APPROVED / NO CRIMINAL RECORD</text>
        <text x="80" y="280" font-family="Arial, sans-serif" font-size="13" fill="#15803d">Fingerprint Verification: Matched &amp; Verified</text>
        <text x="80" y="305" font-family="Arial, sans-serif" font-size="13" fill="#15803d">Background Investigation: Satisfactory for Commercial Skilled Work</text>
        <circle cx="480" cy="410" r="45" fill="none" stroke="#047857" stroke-width="3" stroke-dasharray="6,4"/>
        <text x="480" y="415" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#047857" text-anchor="middle">POLICE DEPT</text>
        <text x="480" y="430" font-family="Arial, sans-serif" font-size="10" fill="#047857" text-anchor="middle">OFFICIAL SEAL</text>
        <text x="60" y="430" font-family="Arial, sans-serif" font-size="12" fill="#64748b">Senior Superintendent of Police (Clearance Unit)</text>
    </svg>';
    file_put_contents($kycDir . '/sample_police_report.svg', $policeSvg);

    $tradeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420">
        <rect width="600" height="420" rx="12" fill="#fffbeb" stroke="#fcd34d" stroke-width="3"/>
        <rect x="20" y="20" width="560" height="380" rx="8" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="8,4"/>
        <text x="300" y="65" font-family="Georgia, serif" font-size="22" font-weight="bold" fill="#78350f" text-anchor="middle">TERTIARY AND VOCATIONAL EDUCATION COMMISSION</text>
        <text x="300" y="95" font-family="Arial, sans-serif" font-size="14" fill="#92400e" text-anchor="middle">NATIONAL VOCATIONAL QUALIFICATION (NVQ) OF SRI LANKA</text>
        <text x="300" y="150" font-family="Arial, sans-serif" font-size="14" fill="#451a03" text-anchor="middle">This credential confirms that the candidate has successfully attained</text>
        <text x="300" y="185" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#b45309" text-anchor="middle">NVQ LEVEL 4 — CERTIFIED PROFESSIONAL TRADESMAN</text>
        <text x="300" y="225" font-family="Arial, sans-serif" font-size="14" fill="#78350f" text-anchor="middle">Authorized by NAITA / VTA Sri Lanka &bull; Registered Competency Standard</text>
        <circle cx="300" cy="310" r="40" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
        <text x="300" y="315" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#b45309" text-anchor="middle">NVQ L4</text>
        <text x="300" y="330" font-family="Arial, sans-serif" font-size="10" fill="#92400e" text-anchor="middle">VERIFIED</text>
    </svg>';
    file_put_contents($kycDir . '/sample_trade_certificate.svg', $tradeSvg);

    // Disable foreign key checks to safely purge and rebuild cleanly
    $db->exec("SET FOREIGN_KEY_CHECKS = 0;");

    // 2. Clear out existing workers data
    $db->exec("DELETE FROM kyc_documents;");
    $db->exec("DELETE FROM worker_categories;");
    $db->exec("DELETE FROM worker_services;");
    $db->exec("DELETE FROM worker_subscriptions;");
    $db->exec("DELETE FROM subscription_payments;");
    $db->exec("DELETE FROM wallet_transactions;");
    $db->exec("DELETE FROM reviews;");
    $db->exec("DELETE FROM job_applications;");
    $db->exec("DELETE FROM job_invoices;");
    $db->exec("DELETE FROM wallet_payout_requests;");
    $db->exec("DELETE FROM promotions;");
    $db->exec("DELETE FROM worker_profiles;");

    // Delete existing worker users (keep admin user 1 and customer user 2)
    $db->exec("DELETE FROM users WHERE role = 'worker' OR id > 2;");

    // 3. Ensure Admin and Customer Users exist with correct details
    $adminHash = password_hash('admin@123', PASSWORD_BCRYPT);
    $customerHash = password_hash('customer@123', PASSWORD_BCRYPT);
    $workerHash = password_hash('worker@123', PASSWORD_BCRYPT);

    $db->prepare("
        INSERT INTO users (id, full_name, username, email, password_hash, role, phone, address, status)
        VALUES (1, 'System Administrator', 'admin', 'admin@jobkade.lk', :pass, 'admin', '0771234567', 'Colombo 01', 'active')
        ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password_hash=VALUES(password_hash), role='admin'
    ")->execute([':pass' => $adminHash]);

    $db->prepare("
        INSERT INTO users (id, full_name, username, email, password_hash, role, phone, address, status)
        VALUES (2, 'Dinil Sandaruwan', 'customer', 'customer@gmail.com', :pass, 'customer', '0719876543', 'Colombo 05 (Havelock Town)', 'active')
        ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password_hash=VALUES(password_hash), role='customer'
    ")->execute([':pass' => $customerHash]);

    // 4. Insert Exactly 5 Workers
    $workersData = [
        [
            'user_id'           => 3,
            'worker_id'         => 1,
            'full_name'         => 'Sunil Perera (Electrician)',
            'username'          => 'sunilelectric',
            'email'             => 'sunil.electric@gmail.com',
            'phone'             => '0751122334',
            'address'           => 'Colombo 03 (Kollupitiya)',
            'category_id'       => 1, // Electrician
            'bio'               => 'Certified Master Electrician with 12+ years experience in commercial & domestic wiring, fault diagnosis, circuit breaker panels, lighting automation, and solar inverter installations.',
            'service_radius_km' => 20,
            'latitude'          => 6.9271000,
            'longitude'         => 79.8612000,
            'is_verified'       => 1,
            'verify_status'     => 'verified',
            'has_job_access'    => 1,
            'wallet_balance'    => 4500.00,
            'total_earnings'    => 45000.00,
            'total_commission'  => 4500.00,
            'rating_avg'        => 4.95,
            'reviews_count'     => 24,
            'working_hours'     => '7:30 AM - 7:00 PM',
            'plan_id'           => 1 // Monthly
        ],
        [
            'user_id'           => 4,
            'worker_id'         => 2,
            'full_name'         => 'Kamal Silva (Plumber)',
            'username'          => 'kamalplumber',
            'email'             => 'kamal.plumber@gmail.com',
            'phone'             => '0764433221',
            'address'           => 'Bambalapitiya, Colombo 04',
            'category_id'       => 2, // Plumber
            'bio'               => 'Licensed Master Plumber specialized in leak detection, bathroom sanitary plumbing, water pumps, overhead water tanks, pipe welding, and high-pressure drainage systems.',
            'service_radius_km' => 15,
            'latitude'          => 6.8950000,
            'longitude'         => 79.8730000,
            'is_verified'       => 1,
            'verify_status'     => 'verified',
            'has_job_access'    => 1,
            'wallet_balance'    => 3200.00,
            'total_earnings'    => 32000.00,
            'total_commission'  => 3200.00,
            'rating_avg'        => 4.85,
            'reviews_count'     => 19,
            'working_hours'     => '8:00 AM - 6:00 PM',
            'plan_id'           => 1 // Monthly
        ],
        [
            'user_id'           => 5,
            'worker_id'         => 3,
            'full_name'         => 'Nimal Fernando (AC Tech)',
            'username'          => 'nimalac',
            'email'             => 'nimal.ac@gmail.com',
            'phone'             => '0789988776',
            'address'           => 'Colombo 07 (Cinnamon Gardens)',
            'category_id'       => 3, // AC Tech
            'bio'               => 'HVAC & Inverter Air Conditioner specialist. Deep chemical wash, inverter PCB repairs, refrigerant gas charging (R32 / R410A), and commercial chiller maintenance.',
            'service_radius_km' => 25,
            'latitude'          => 6.9015000,
            'longitude'         => 79.8550000,
            'is_verified'       => 1,
            'verify_status'     => 'verified',
            'has_job_access'    => 1,
            'wallet_balance'    => 6000.00,
            'total_earnings'    => 60000.00,
            'total_commission'  => 6000.00,
            'rating_avg'        => 4.92,
            'reviews_count'     => 28,
            'working_hours'     => '8:30 AM - 8:00 PM',
            'plan_id'           => 2 // Yearly
        ],
        [
            'user_id'           => 6,
            'worker_id'         => 4,
            'full_name'         => 'Tharindu Jayasinghe (Carpenter)',
            'username'          => 'tharinducarpenter',
            'email'             => 'tharindu.carpenter@gmail.com',
            'phone'             => '0712345678',
            'address'           => 'Nugegoda & Colombo',
            'category_id'       => 5, // Carpenter
            'bio'               => 'Professional wood craftsman and carpenter with 14 years experience. Specializing in modern pantry cupboards, custom teak and mahogany furniture repairs, door lock fitting, and timber roof frame construction.',
            'service_radius_km' => 20,
            'latitude'          => 6.8649000,
            'longitude'         => 79.8997000,
            'is_verified'       => 1,
            'verify_status'     => 'verified',
            'has_job_access'    => 1,
            'wallet_balance'    => 2800.00,
            'total_earnings'    => 28000.00,
            'total_commission'  => 2800.00,
            'rating_avg'        => 4.88,
            'reviews_count'     => 16,
            'working_hours'     => '8:00 AM - 6:00 PM',
            'plan_id'           => 1 // Monthly
        ],
        [
            'user_id'           => 7,
            'worker_id'         => 5,
            'full_name'         => 'Ruwan Samarasinghe (Painter)',
            'username'          => 'ruwanpainter',
            'email'             => 'ruwan.painter@gmail.com',
            'phone'             => '0779988112',
            'address'           => 'Dehiwala - Mount Lavinia',
            'category_id'       => 4, // Painter
            'bio'               => 'Professional interior and exterior painting contractor. Expert in weather-shield coatings, smooth wall putty application, epoxy floor finishing, and wood varnishing.',
            'service_radius_km' => 18,
            'latitude'          => 6.8400000,
            'longitude'         => 79.8700000,
            'is_verified'       => 0,
            'verify_status'     => 'pending', // Pending KYC so admin can review in KYC Moderation!
            'has_job_access'    => 1,
            'wallet_balance'    => 3500.00,
            'total_earnings'    => 35000.00,
            'total_commission'  => 3500.00,
            'rating_avg'        => 4.80,
            'reviews_count'     => 15,
            'working_hours'     => '8:00 AM - 5:30 PM',
            'plan_id'           => 1 // Monthly
        ]
    ];

    // Prepare insert statements
    $stmtUser = $db->prepare("
        INSERT INTO users (id, full_name, username, email, password_hash, role, phone, address, status)
        VALUES (:id, :name, :username, :email, :pass, 'worker', :phone, :address, 'active')
    ");

    $stmtProfile = $db->prepare("
        INSERT INTO worker_profiles (id, user_id, bio, service_radius_km, latitude, longitude, address, is_verified, verify_status, has_job_access, wallet_balance, total_earnings, total_commission_paid, rating_avg, reviews_count, working_hours)
        VALUES (:id, :user_id, :bio, :service_radius, :lat, :lng, :address, :is_verified, :verify_status, :has_job_access, :wallet_balance, :total_earnings, :total_comm, :rating, :reviews, :hours)
    ");

    $stmtCat = $db->prepare("
        INSERT INTO worker_categories (worker_id, category_id)
        VALUES (:worker_id, :category_id)
    ");

    $stmtKyc = $db->prepare("
        INSERT INTO kyc_documents (worker_id, document_type, document_name, document_path, file_path, status, reviewed_by, reviewed_at)
        VALUES (:worker_id, :doc_type, :doc_name, :doc_path, :file_path, :status, :reviewed_by, :reviewed_at)
    ");

    $stmtSub = $db->prepare("
        INSERT INTO worker_subscriptions (id, worker_id, plan_id, start_date, end_date, status)
        VALUES (:id, :worker_id, :plan_id, :start, :end, 'active')
    ");

    $stmtPay = $db->prepare("
        INSERT INTO subscription_payments (worker_id, plan_id, amount, payment_method, transaction_ref, receipt_number, status)
        VALUES (:worker_id, :plan_id, :amount, 'Online IPG (Card/Visa/Master)', :txn, :rcpt, 'completed')
    ");

    $stmtService = $db->prepare("
        INSERT INTO worker_services (worker_id, category_id, title, description, price, pricing_type, location, is_available)
        VALUES (:worker_id, :cat_id, :title, :desc, :price, :type, :loc, 1)
    ");

    $stmtReview = $db->prepare("
        INSERT INTO reviews (customer_id, worker_id, rating, comment)
        VALUES (2, :worker_id, :rating, :comment)
    ");

    $stmtTx = $db->prepare("
        INSERT INTO wallet_transactions (worker_id, type, amount, balance_after, payment_method, description, transaction_ref)
        VALUES (:worker_id, :type, :amount, :balance, :method, :desc, :ref)
    ");

    // Services per worker
    $servicesList = [
        1 => [
            ['Complete House Electrical Wiring & Inspection', 'Full safety audit, short circuit diagnosis, conduit wiring, and earthing installation.', 4500.00, 'fixed'],
            ['Circuit Breaker & Main DB Box Panel Repair', 'Diagnosis of tripping switches, circuit breaker replacement, and surge protector installation.', 2500.00, 'fixed'],
            ['Ceiling Fan, Chandelier & LED Lighting Installation', 'Precision mounting of ceiling fans, wall lamps, chandeliers, and smart ambient lighting.', 1500.00, 'fixed']
        ],
        2 => [
            ['Water Pump, Pressure Booster & Automatic Switch Setup', 'Complete diagnosis of water pumps, impellers, capacitors, and automatic pressure controls.', 3500.00, 'fixed'],
            ['Bathroom Sanitary Fitting & Commode Replacement', 'Precision installation of sinks, hot water showers, commodes, mixers, and drains.', 4000.00, 'fixed'],
            ['Concealed Pipeline Leak Detection & Drain Cleaning', 'Acoustic leak pinpointing and motorized snake blockage clearing without unnecessary wall damage.', 2000.00, 'fixed']
        ],
        3 => [
            ['Inverter AC Full Chemical Deep Cleaning & Servicing', 'High-pressure foam coil flush, indoor blower decontamination, drain tray clearing, and filter wash.', 3500.00, 'fixed'],
            ['Refrigerant Gas Leak Repair & Full R32/R410A Refill', 'Nitrogen pressure testing, brazing leak repair, vacuuming, and exact weight refrigerant charging.', 5500.00, 'fixed'],
            ['Split AC Unit New Installation & Outdoor Bracket Mounting', 'Professional mounting, insulated copper piping, vacuuming, and test run with safety breaker.', 8000.00, 'fixed']
        ],
        4 => [
            ['Custom Kitchen Pantry Cupboard Design & Fitting', 'High quality moisture-resistant MDF/Mahogany cabinetry, soft-close hinges, and granite top alignment.', 15000.00, 'starting_at'],
            ['Teak Wood Door Fitting, Locksets & Frame Alignment', 'Solid wood door planing, mortise lock installation, deadbolt fitting, and weather sealing.', 3500.00, 'fixed'],
            ['Antique & Modern Wood Furniture Restoration', 'Structural joint re-gluing, sanding, French polishing, and veneer repairs for valuable furniture.', 4500.00, 'fixed']
        ],
        5 => [
            ['Interior Wall Putty Finishing & Emulsion Painting', 'Surface scraping, dual-coat acrylic wall putty application, fine sanding, and premium emulsion topcoats.', 6500.00, 'fixed'],
            ['Weather-Shield Exterior Waterproof Coating', 'High durability anti-fungal exterior wall coating with crack-bridging elastomeric paint.', 12000.00, 'fixed'],
            ['Timber Staining, Wood Sealant & Polyurethane Varnish', 'Deep grain staining, sanding sealer coat, and UV-resistant gloss or matte polyurethane coat.', 4000.00, 'fixed']
        ]
    ];

    // Reviews per worker
    $reviewsList = [
        1 => [
            ['rating' => 5, 'comment' => 'Sunil did exceptional electrical work at my house in Kollupitiya. Very punctual, identified a hidden short circuit in 20 minutes, and resolved it neatly.'],
            ['rating' => 5, 'comment' => 'Highly certified electrician. Installed our solar changeover switch with great attention to safety codes. Highly recommended!']
        ],
        2 => [
            ['rating' => 5, 'comment' => 'Kamal resolved our booster pump pressure issue promptly. Clean work, reasonable rates, and brought all the necessary pipe fittings.'],
            ['rating' => 4, 'comment' => 'Great plumbing job fixing our bathroom concealed mixer leak. Very polite and knowledgeable tradesman.']
        ],
        3 => [
            ['rating' => 5, 'comment' => 'Nimal performed a chemical deep clean on two inverter AC units. Both are now cooling like brand new. Very tidy technician.'],
            ['rating' => 5, 'comment' => 'Very knowledgeable on inverter PCB diagnostics. Saved me from having to buy a whole new outdoor unit. Excellent service!']
        ],
        4 => [
            ['rating' => 5, 'comment' => 'Tharindu is a true craftsman. Repaired our dining chairs and fitted three heavy teak doors perfectly without any squeaks.'],
            ['rating' => 5, 'comment' => 'Superb workmanship on our kitchen cupboard hinges and sliding drawers. Very honest and meticulous carpenter.']
        ],
        5 => [
            ['rating' => 5, 'comment' => 'Ruwan and his assistant painted our living room and master bedroom. Smooth putty work and razor sharp edges along the ceiling border.'],
            ['rating' => 4, 'comment' => 'Quality exterior weather-shield painting. Arrived on time each morning and cleaned up the site thoroughly.']
        ]
    ];

    foreach ($workersData as $w) {
        // Insert User
        $stmtUser->execute([
            ':id'       => $w['user_id'],
            ':name'     => $w['full_name'],
            ':username' => $w['username'],
            ':email'    => $w['email'],
            ':pass'     => $workerHash,
            ':phone'    => $w['phone'],
            ':address'  => $w['address']
        ]);

        // Insert Worker Profile
        $stmtProfile->execute([
            ':id'             => $w['worker_id'],
            ':user_id'        => $w['user_id'],
            ':bio'            => $w['bio'],
            ':service_radius' => $w['service_radius_km'],
            ':lat'            => $w['latitude'],
            ':lng'            => $w['longitude'],
            ':address'        => $w['address'],
            ':is_verified'    => $w['is_verified'],
            ':verify_status'  => $w['verify_status'],
            ':has_job_access' => $w['has_job_access'],
            ':wallet_balance' => $w['wallet_balance'],
            ':total_earnings' => $w['total_earnings'],
            ':total_comm'     => $w['total_commission'],
            ':rating'         => $w['rating_avg'],
            ':reviews'        => $w['reviews_count'],
            ':hours'          => $w['working_hours']
        ]);

        // Insert Category Link
        $stmtCat->execute([
            ':worker_id'   => $w['worker_id'],
            ':category_id' => $w['category_id']
        ]);

        // Insert KYC Documents (NIC, Police Report, Selfie, Trade Certificate)
        $isRuwanPending = ($w['worker_id'] === 5);
        $kycStatus = $isRuwanPending ? 'pending' : 'approved';
        $reviewedBy = $isRuwanPending ? null : 1;
        $reviewedAt = $isRuwanPending ? null : date('Y-m-d H:i:s');

        // 1. NIC
        $stmtKyc->execute([
            ':worker_id'   => $w['worker_id'],
            ':doc_type'    => 'nic',
            ':doc_name'    => 'National Identity Card (Front & Back)',
            ':doc_path'    => 'uploads/kyc/sample_nic.svg',
            ':file_path'   => 'uploads/kyc/sample_nic.svg',
            ':status'      => $kycStatus,
            ':reviewed_by' => $reviewedBy,
            ':reviewed_at' => $reviewedAt
        ]);

        // 2. Police Report
        $stmtKyc->execute([
            ':worker_id'   => $w['worker_id'],
            ':doc_type'    => 'police_report',
            ':doc_name'    => 'Police Clearance Certificate (HQ Clearance Division)',
            ':doc_path'    => 'uploads/kyc/sample_police_report.svg',
            ':file_path'   => 'uploads/kyc/sample_police_report.svg',
            ':status'      => $kycStatus,
            ':reviewed_by' => $reviewedBy,
            ':reviewed_at' => $reviewedAt
        ]);

        // 3. Selfie
        $selfieFile = 'uploads/kyc/selfie_worker_' . $w['worker_id'] . '.png';
        $stmtKyc->execute([
            ':worker_id'   => $w['worker_id'],
            ':doc_type'    => 'selfie',
            ':doc_name'    => 'Live Identity Verification Selfie',
            ':doc_path'    => $selfieFile,
            ':file_path'   => $selfieFile,
            ':status'      => $kycStatus,
            ':reviewed_by' => $reviewedBy,
            ':reviewed_at' => $reviewedAt
        ]);

        // 4. Trade Certificate
        $stmtKyc->execute([
            ':worker_id'   => $w['worker_id'],
            ':doc_type'    => 'trade_certificate',
            ':doc_name'    => 'National Vocational Qualification (NVQ Level 4) Certificate',
            ':doc_path'    => 'uploads/kyc/sample_trade_certificate.svg',
            ':file_path'   => 'uploads/kyc/sample_trade_certificate.svg',
            ':status'      => $kycStatus,
            ':reviewed_by' => $reviewedBy,
            ':reviewed_at' => $reviewedAt
        ]);

        // Subscriptions & Receipts
        $stmtSub->execute([
            ':id'        => $w['worker_id'],
            ':worker_id' => $w['worker_id'],
            ':plan_id'   => $w['plan_id'],
            ':start'     => '2026-09-01',
            ':end'       => '2026-11-30'
        ]);

        $stmtPay->execute([
            ':worker_id' => $w['worker_id'],
            ':plan_id'   => $w['plan_id'],
            ':amount'    => ($w['plan_id'] == 2 ? 30000.00 : 3000.00),
            ':txn'       => 'TXN-2026-0901-88' . str_pad($w['worker_id'], 2, '0', STR_PAD_LEFT),
            ':rcpt'      => 'RCPT-202609-0' . str_pad($w['worker_id'], 2, '0', STR_PAD_LEFT)
        ]);

        // Custom Services
        if (isset($servicesList[$w['worker_id']])) {
            foreach ($servicesList[$w['worker_id']] as $srv) {
                $stmtService->execute([
                    ':worker_id' => $w['worker_id'],
                    ':cat_id'    => $w['category_id'],
                    ':title'     => $srv[0],
                    ':desc'      => $srv[1],
                    ':price'     => $srv[2],
                    ':type'      => $srv[3],
                    ':loc'       => $w['address']
                ]);
            }
        }

        // Reviews
        if (isset($reviewsList[$w['worker_id']])) {
            foreach ($reviewsList[$w['worker_id']] as $rev) {
                $stmtReview->execute([
                    ':worker_id' => $w['worker_id'],
                    ':rating'    => $rev['rating'],
                    ':comment'   => $rev['comment']
                ]);
            }
        }

        // Wallet Transactions
        $stmtTx->execute([
            ':worker_id' => $w['worker_id'],
            ':type'      => 'online_credit',
            ':amount'    => $w['total_earnings'],
            ':balance'   => $w['wallet_balance'],
            ':method'    => 'online',
            ':desc'      => 'Customer completed jobs settlement credit',
            ':ref'       => 'TX-SETTLE-00' . $w['worker_id'] . '-' . time()
        ]);
    }

    // 5. Seed Clean In-App Messages between Customer (User ID 2) and the 5 Workers
    $db->exec("DELETE FROM messages;");
    $stmtMsg = $db->prepare("
        INSERT INTO messages (job_id, sender_id, receiver_id, message_text, is_read, created_at)
        VALUES (NULL, :sender, :receiver, :text, :is_read, :created_at)
    ");

    $conversations = [
        // Sunil (Electrician)
        [
            ['sender' => 2, 'receiver' => 3, 'text' => 'Hello Sunil, are you available tomorrow morning for a main trip switch inspection in Kollupitiya?', 'read' => 1, 'time' => '2026-10-04 10:15:00'],
            ['sender' => 3, 'receiver' => 2, 'text' => 'Hi Dinil, yes certainly! I have an opening at 9:30 AM. Please share the exact apartment location.', 'read' => 1, 'time' => '2026-10-04 10:20:00'],
            ['sender' => 2, 'receiver' => 3, 'text' => 'Great, it is No. 42 Marine Drive, Kollupitiya. See you at 9:30 AM.', 'read' => 0, 'time' => '2026-10-04 10:25:00']
        ],
        // Kamal (Plumber)
        [
            ['sender' => 2, 'receiver' => 4, 'text' => 'Hi Kamal, can you check our overhead water tank float valve and pressure pump?', 'read' => 1, 'time' => '2026-10-03 14:10:00'],
            ['sender' => 4, 'receiver' => 2, 'text' => 'Hello! Yes, I can visit today around 4:30 PM on my way from Bambalapitiya.', 'read' => 1, 'time' => '2026-10-03 14:25:00']
        ],
        // Nimal (AC Tech)
        [
            ['sender' => 2, 'receiver' => 5, 'text' => 'Hi Nimal, our master bedroom Panasonic inverter AC is leaking water and not cooling enough.', 'read' => 1, 'time' => '2026-10-02 11:00:00'],
            ['sender' => 5, 'receiver' => 2, 'text' => 'Hello Dinil! That sounds like a choked drain line and dirty indoor evaporator coil. A full chemical service will fix it completely.', 'read' => 1, 'time' => '2026-10-02 11:15:00']
        ],
        // Tharindu (Carpenter)
        [
            ['sender' => 2, 'receiver' => 6, 'text' => 'Hello Tharindu, do you do teak wood pantry cupboard hinge repairs?', 'read' => 1, 'time' => '2026-10-01 16:30:00'],
            ['sender' => 6, 'receiver' => 2, 'text' => 'Yes Dinil, I specialize in pantry hinges, drawer channels, and wood alignment. Happy to help.', 'read' => 1, 'time' => '2026-10-01 16:45:00']
        ],
        // Ruwan (Painter)
        [
            ['sender' => 2, 'receiver' => 7, 'text' => 'Hi Ruwan, looking for a quote to paint two bedrooms with weather-shield exterior touch up.', 'read' => 1, 'time' => '2026-09-30 09:00:00'],
            ['sender' => 7, 'receiver' => 2, 'text' => 'Good morning! I can do a free site visit to take measurements and provide an itemized quote.', 'read' => 1, 'time' => '2026-09-30 09:20:00']
        ]
    ];

    foreach ($conversations as $conv) {
        foreach ($conv as $m) {
            $stmtMsg->execute([
                ':sender'     => $m['sender'],
                ':receiver'   => $m['receiver'],
                ':text'       => $m['text'],
                ':is_read'    => $m['read'],
                ':created_at' => $m['time']
            ]);
        }
    }

    // 6. Re-enable foreign key checks
    $db->exec("SET FOREIGN_KEY_CHECKS = 1;");

    echo "\n=== Database successfully seeded with EXACTLY 5 workers! ===\n";
    $count = $db->query("SELECT COUNT(*) FROM worker_profiles")->fetchColumn();
    echo "Total Worker Profiles in DB: " . $count . "\n";

    $workers = $db->query("
        SELECT wp.id, u.full_name, c.name AS category, wp.address, wp.verify_status, wp.rating_avg 
        FROM worker_profiles wp 
        JOIN users u ON wp.user_id = u.id 
        LEFT JOIN worker_categories wc ON wp.id = wc.worker_id 
        LEFT JOIN categories c ON wc.category_id = c.id
        ORDER BY wp.id ASC
    ")->fetchAll();

    foreach ($workers as $w) {
        echo "Worker #{$w['id']}: {$w['full_name']} | {$w['category']} | {$w['address']} | Status: {$w['verify_status']} | Rating: {$w['rating_avg']}\n";
    }

} catch (Exception $e) {
    echo "Error during seeding: " . $e->getMessage() . "\n";
    exit(1);
}
