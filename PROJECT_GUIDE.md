# JobKade — Final Degree Project Guide & Technical Documentation

> **Project Name:** JobKade (Verified Location-Based Skilled Worker Marketplace Platform)  
> **Academic Reference:** Cardiff Metropolitan University / ICBT Computing Project CSE5015  
> **Architecture:** Full-Stack Layered Architecture (Presentation -> Controller -> Service -> Repository -> MySQL Database)  
> **Status:** Production-Ready Beta with Native Mobile-First Experience  

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features by User Role](#-key-features-by-user-role)
3. [Mobile-First Native App Architecture](#-mobile-first-native-app-architecture)
4. [File & Directory Structure](#-file--directory-structure)
5. [HTML Pages Guide (A to Z)](#-html-pages-guide-a-to-z)
6. [CSS Architecture & Styling](#-css-architecture--styling)
7. [JavaScript Logic & REST API Integration](#-javascript-logic--rest-api-integration)
8. [Backend Architecture & Database Layer](#-backend-architecture--database-layer)
9. [How to Run & Present Locally](#-how-to-run--present-locally)

---

## 🌟 Project Overview

**JobKade** solves a major local challenge in Sri Lanka: connecting households, vehicle owners, and commercial properties with verified, background-checked skilled tradesmen and technicians (electricians, plumbers, carpenters, AC technicians, painters, masonry workers, and cleaners).

The platform supports **3 distinct user roles**:
1. **Customers:** Search verified workers by location/category, view portfolios & transparent reviews, post job tickets with Leaflet GPS map markers, and chat directly in-app.
2. **Workers:** Create profile portfolios, upload KYC identity documents (NIC, trade certificates), apply for customer job tickets, manage subscriptions, and communicate with clients.
3. **Administrators:** Review uploaded worker KYC documents, verify or reject credentials with feedback, moderate jobs and accounts, and monitor revenue and analytics.

---

## 👥 Key Features by User Role

### 1. 🛒 Customer Portal
- **Location-Based Search:** Find verified workers sorted by rating, category, and city with Haversine distance calculations.
- **Transparent Profiles:** Worker portfolios with verified badge, client reviews, contact channels (Call, WhatsApp, In-App Chat).
- **Interactive Job Posting:** Post maintenance tickets with preferred date/time, description, image attachments, and an interactive **Leaflet.js OpenStreetMap GPS picker**.
- **Real-Time In-App Chat:** Dedicated two-column messaging center with dynamic 3.5s polling, read receipts, and zero mock data.
- **Saved Workers:** Bookmark favorite professionals for instant re-hiring.

### 2. 🛠️ Worker Portal
- **Identity & KYC Verification Desk:** Upload National Identity Card (NIC) and technical certificates for administrator verification.
- **Service Listings:** Manage offered service categories and specialties.
- **Customer Job Requests:** Browse open customer tickets and submit proposals/quotes.
- **Subscriptions & Billing:** Starter, Pro, and Elite tiers with simulated Online Payment Gateway (IPG) and digital receipt generation.
- **Profile Management:** Edit bio, skills, service areas, and update login security credentials.

### 3. 🛡️ Admin Portal
- **KYC Document Moderation:** Review high-resolution worker NICs and certifications with 1-click **Approve** or **Reject with Reason** modals.
- **Account Moderation:** Track and manage registered customer and worker accounts.
- **Job Ticket Moderation:** Review and moderate platform-wide customer postings.
- **Analytics Dashboard:** Visual charts powered by **Chart.js** displaying monthly revenue, user growth, and top trades.

---

## 📱 Mobile-First Native App Architecture

Recognizing that over 80% of local customers and tradesmen access the platform via mobile smartphones, JobKade incorporates an **App-Store Style Native Mobile UI**:

1. **Persistent Mobile Bottom App Bar (`.mobile-bottom-nav`)**:
   - Translucent glassmorphism bar (`backdrop-filter: blur(18px)`) fixed to the bottom viewport on all devices $\le 768\text{px}$.
   - 5 Touch-Friendly Tabs:
     - **Home** (`index.html`): Instant return to discovery homepage.
     - **Workers** (`workers.html`): Search and browse technicians.
     - **Elevated Center Action Button (`+`)**: Prominent action button (**"Post Job"** for customers/guests, **"Add Service"** for workers).
     - **Chat** (`messages.html`): Direct client-worker messaging thread.
     - **Account / Dashboard**: Direct route to Customer, Worker, or Admin dashboard.
   - **Smart Auto-Hide:** When a user opens a slide-out drawer or full-screen menu, the bottom bar smoothly slides down off-screen (`transform: translateY(100%)`).
2. **Hero Quick Category Chips**:
   - Touch-scrollable horizontal slider under the search bar (⚡ Electrician, 💧 Plumber, ❄️ AC Repair, 🔨 Carpentry, 🎨 Painting) allowing 1-tap filtering without typing.
3. **Centered Mobile Hero with Zero Page Overflow**:
   - Single-column layout with `overflow-x: hidden` preventing horizontal page drift or clipped text.
   - Compact 3-column statistics badge row (**500+ Verified Workers | 1,200+ Jobs Completed | 4.8 Rating**).
4. **Ergonomic Worker Card Footers**:
   - "View Profile" button paired side-by-side with 42×42px square direct contact buttons (**Chat**, **Call**, and **WhatsApp**).
5. **Mobile Collapsible Filters**:
   - Compact `[ Filter Options ▾ ]` accordion header on `workers.html` so mobile users see technician listings immediately.
6. **Dashboard & Auth Mobile Optimization**:
   - Compact 3-column stats row for customer and worker dashboards.
   - Fluid single-column mobile authentication cards with `16px` inputs to prevent iOS Safari auto-zooming.

---

## 📁 File & Directory Structure

```
JobKade/
├── index.html                 # Main Landing Page (Hero, Search, Categories, Stats, Reviews)
├── services.html              # Service Categories Directory
├── workers.html               # Public Worker Directory & Interactive Filtering
├── worker-profile.html        # Public Worker Profile & Review Breakdown
├── how-it-works.html          # Step-by-Step Platform Guide
├── messages.html              # Dedicated Real-Time In-App Messaging Client
├── setup_db.php               # Automated WampServer Database Initialization Script
├── README.md                  # Project Overview & Setup Instructions
├── PROJECT_STATUS.md          # Comprehensive Architecture Audit & Test Report
├── PROJECT_GUIDE.md           # Degree Project Guide (This Document)
├── DEVELOPER_GUIDE.md         # Full-Stack Code Breakdown & Architecture Manual
│
├── api/                       # RESTful API Endpoints (JSON)
│   ├── auth.php               # Login, Register, Profile Check
│   ├── workers.php            # Worker Directory Search & Profile Details
│   ├── jobs.php               # Job Requests List & Create
│   ├── messages.php           # In-App Chat Send, Retrieve, & Conversations
│   ├── subscriptions.php      # Subscription Plans & IPG Payment Simulation
│   └── admin.php              # KYC Moderation & Platform Analytics
│
├── config/                    # Backend Configuration
│   ├── Database.php           # PDO Singleton Connection to MySQL
│   ├── JWT.php                # Stateless Token Encoding & HMAC-SHA256 Decoding
│   └── cors.php               # CORS Headers & Response Formatting
│
├── controllers/               # HTTP Request Handling & Parameter Validation
│   ├── AuthController.php
│   ├── WorkerController.php
│   ├── JobController.php
│   ├── MessageController.php
│   └── AdminController.php
│
├── services/                  # Core Business Logic & Sanitization
│   ├── AuthService.php
│   ├── WorkerService.php
│   ├── JobService.php
│   ├── MessageService.php
│   ├── KycService.php
│   └── PaymentService.php
│
├── repositories/              # Prepared Statement Data Access (PDO)
│   ├── UserRepository.php
│   ├── WorkerRepository.php
│   ├── JobRepository.php
│   ├── MessageRepository.php
│   ├── KycRepository.php
│   ├── CategoryRepository.php
│   ├── SubscriptionRepository.php
│   ├── PromotionRepository.php
│   └── ReviewRepository.php
│
├── database/                  # SQL Schemas & Seed Data
│   ├── schema.sql             # 14 3NF Normalized Tables
│   └── reset_and_seed_messages.sql
│
├── css/                       # Stylesheets
│   ├── style.css              # Core Design System, Variables, Components & Section 31 Mobile
│   ├── auth.css               # Authentication Pages Styling
│   ├── customer.css           # Customer Dashboard Layout & Components
│   ├── worker.css             # Worker Dashboard Layout & KYC Styles
│   ├── admin.css              # Admin Control Panel Layout & Data Tables
│   └── messages.css           # Fixed-Viewport Zero-Scroll Chat Layout
│
├── js/                        # Client-Side Logic
│   ├── main.js                # Core Infrastructure, apiFetch(), Dynamic Bottom Nav, Navbar Auth
│   ├── auth.js                # Login, Signup, Role Switching & JWT Storage
│   ├── customer.js            # Customer Dashboard Interactions & Leaflet Map
│   ├── worker.js              # Worker Service Creation & Bidding Logic
│   ├── admin.js               # Admin Verification Desk & Chart.js Visuals
│   ├── messages.js            # Real-Time Dynamic Polling Chat Controller
│   └── kyc.js                 # Worker KYC File Upload & Preview Handler
│
├── auth/                      # Authentication Pages
│   ├── login.html             # Login Portal (with Quick Role Fill Buttons)
│   └── register.html          # Dual Role Sign Up Portal (Customer / Worker)
│
├── customer/                  # Customer Portal
│   ├── dashboard.html         # Customer Overview & Quick Actions
│   ├── jobs.html              # Customer's Posted Jobs & Status Tracker
│   ├── post-job.html          # Job Request Creation with Leaflet GPS Map
│   ├── profile.html           # Customer Profile Settings
│   └── saved-workers.html     # Saved/Bookmarked Workers Directory
│
└── worker/                    # Worker Portal
    ├── dashboard.html         # Worker Overview, Metrics & Status Badges
    ├── jobs.html              # Customer Jobs Open for Bidding
    ├── my-services.html       # Active Worker Service Listings
    ├── add-service.html       # Create New Service Listing Form
    ├── kyc.html               # Identity & KYC Document Upload Desk
    ├── profile-edit.html      # Edit Profile, Bio, Location & Security
    ├── wallet.html            # Wallet & Commission Breakdown
    └── subscription.html      # Subscription Plans & IPG Payment Modal
```

---

## 🎨 CSS Architecture & Styling

1. **`css/style.css` (Core Design System):**
   - **Color Tokens:** `--primary` (`#5996FF`), `--primary-hover` (`#4082F0`), `--success` (`#66BB6A`), `--warning` (`#FFA726`), `--danger` (`#EF5350`), `--text-primary` (`#1E293B`).
   - **Typography:** Google Fonts **Inter** (400, 500, 600, 700, 800).
   - **Reusability:** Global classes for `.btn`, `.card`, `.badge`, `.avatar`, `.form-input`, `.data-table`, `.modal-overlay`, and `.toast`.
   - **Section 31 (Native App Experience):** Persistent bottom nav styles, quick chips, horizontal touch scrolling, and zero-overflow mobile media queries.
2. **`css/auth.css`:** Responsive single-card auth layout, 48px touch inputs, and hidden desktop side graphics on mobile.
3. **`css/messages.css`:** Zero-scroll fixed viewport chat window with mobile conversation list / active thread switching.
4. **`css/customer.css` & `css/worker.css`:** Dashboard sidebar drawers, metric cards, and responsive forms.

---

## ⚡ JavaScript Logic & REST API Integration

1. **`apiFetch(endpoint, options)` in `js/main.js`:**
   - Universal fetch wrapper dynamically calculating the base URL based on deployment path.
   - Automatically attaches `Authorization: Bearer <token>` when a JWT exists in `localStorage`.
2. **Dynamic Navbar & Bottom Bar Sync:**
   - `updateGlobalNavbarAuth()`: Detects login state, replacing generic Login buttons with user initial avatar and Dashboard button.
   - `initMobileBottomNav()`: Injects and highlights the 5-tab native app bottom navigation bar across all non-auth pages.
3. **Authentication & Redirection (`js/auth.js`):**
   - Handles password hashing via server API.
   - Default login destination routes to `index.html` with authenticated session active in navbar; honors `?redirect=` query parameter for protected actions.
4. **In-App Messaging (`js/messages.js`):**
   - Pure database-backed messaging using `/api/messages.php`.
   - Active thread polling every 3.5s using `AbortController` to prevent memory leaks.

---

## 🚀 How to Run & Present Locally

### 1. Start WampServer
- Start **WampServer** and ensure the tray icon is **Green** (Apache & MySQL active).

### 2. Initialize the Database
- Open PowerShell in the project directory and execute:
  ```powershell
  & "C:\wamp64\bin\php\php8.2.29\php.exe" "setup_db.php"
  ```
- This creates the `jobkade_db` schema, 14 tables, composite indexes, and seeds test accounts.

### 3. Start the PHP Built-In Server
```powershell
& "C:\wamp64\bin\php\php8.2.29\php.exe" -S localhost:8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

### 4. Key Demo Walkthrough Steps for Presentation
1. **Homepage Discovery (`index.html`):** Demonstrate the hero search bar, quick category chips, verified worker cards, and mobile bottom navigation bar.
2. **Worker Directory (`workers.html`):** Demonstrate live filtering by trade, city, and verification badge. Show direct contact buttons (Call, WhatsApp, Chat).
3. **In-App Messaging (`messages.html`):** Log in as Customer (`customer@gmail.com` / `customer@123`), open chat with Sunil Perera, and exchange real-time messages.
4. **Customer Job Posting (`customer/post-job.html`):** Show the interactive Leaflet.js GPS map marker picker and ticket creation.
5. **Worker Portal & KYC (`worker/kyc.html`):** Log in as Worker (`sunil.electric@gmail.com` / `worker@123`), view verification badge and submitted KYC documents.
6. **Admin Moderation (`admin/dashboard.html`):** Log in as Admin (`admin@jobkade.lk` / `admin@123`), inspect analytics charts and pending KYC queue.
