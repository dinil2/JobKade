# JobKade — Developer Code Guide & Architecture Manual

> **Purpose:** This developer guide explains the inner workings of the JobKade full-stack codebase line-by-line and section-by-section. It is written to help you and your teammates understand the backend architecture, client-side REST communication, and mobile-first UI systems.

---

## 📋 Table of Contents
1. [Core Architecture & Data Flow](#-core-architecture--data-flow)
2. [Backend Layered Architecture (OOP PHP 8.x)](#-backend-layered-architecture-oop-php-8x)
3. [REST API Layer & JWT Authentication](#-rest-api-layer--jwt-authentication)
4. [JavaScript Code Breakdown](#-javascript-code-breakdown)
   - [js/main.js (Global Infrastructure, apiFetch, Mobile Bottom Nav)](#1-jsmainjs-global-infrastructure-apifetch-mobile-bottom-nav)
   - [js/auth.js (Login, Signup, JWT & Redirection Logic)](#2-jsauthjs-login-signup-jwt--redirection-logic)
   - [js/messages.js (Real-Time Polling & In-App Chat)](#3-jsmessagesjs-real-time-polling--in-app-chat)
   - [js/kyc.js (Document Validation & Preview)](#4-jskycjs-document-validation--preview)
   - [js/customer.js (Customer Tickets & Leaflet GPS Map)](#5-jscustomerjs-customer-tickets--leaflet-gps-map)
   - [js/worker.js (Worker Services & Lead Actions)](#6-jsworkerjs-worker-services--lead-actions)
5. [CSS Architecture & Mobile-First Design System](#-css-architecture--mobile-first-design-system)
6. [Automated Testing & Quality Assurance](#-automated-testing--quality-assurance)

---

## 🏗️ Core Architecture & Data Flow

JobKade is structured as a **Full-Stack Decoupled Application** following the **Layered Architecture (Separation of Concerns — SoC)** pattern:

```
+-----------------------------------------------------------------------------------+
|                                Presentation Tier                                  |
|   HTML5 Pages | Vanilla JS (ES6+) | CSS3 Design System | Leaflet.js | Lucide Icons|
+-----------------------------------------------------------------------------------+
                                         │
                         HTTP REST Requests (JSON / JWT)
                                         ▼
+-----------------------------------------------------------------------------------+
|                                 REST API Router                                   |
|   /api/auth.php | /api/workers.php | /api/jobs.php | /api/messages.php | admin.php|
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                Controller Layer                                   |
|   Input Sanitization | JWT Verification | Status Code & JSON Response Formatting  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                  Service Layer                                    |
|   Business Logic | Anti-Spoofing | Password Hashing (bcrypt) | Status Workflows   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                Repository Layer                                   |
|   Data Access | PDO Prepared Statements | 100% Parameterized SQL Queries          |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                                 Database Tier                                     |
|   MySQL 8.x / MariaDB (Database: jobkade_db) | 14 Normalized Tables | Foreign Keys|
+-----------------------------------------------------------------------------------+
```

---

## ⚙️ Backend Layered Architecture (OOP PHP 8.x)

### 1. `config/`
- **`Database.php`:** Singleton pattern returning a shared `PDO` instance connected to MySQL (`localhost:3306`, DB: `jobkade_db`). Disables emulated prepares for SQL injection safety.
- **`JWT.php`:** HMAC-SHA256 stateless token encoding and decoding. Extracts authenticated `user_id` and `role` directly from the Bearer header.
- **`cors.php`:** Sends preflight CORS headers, provides `getRequestData()` to parse JSON request bodies, and provides `sendJsonResponse($data, $statusCode)`.

### 2. `controllers/`
- **`AuthController.php`:** Handles `login()`, `register()`, and `me()` user profile retrieval.
- **`WorkerController.php`:** Handles `search()` (with category, location, and Haversine distance parameters), `profile()`, and `update()`.
- **`JobController.php`:** Handles `create()`, `list()`, and `myJobs()`.
- **`MessageController.php`:** Handles `send()`, `conversation()`, `read()`, `conversations()`, and `contactInfo()`.
- **`AdminController.php`:** Handles `stats()`, `verifyKyc()`, and user management actions.

### 3. `services/`
- **`AuthService.php`:** Validates emails, hashes passwords with `PASSWORD_BCRYPT`, validates credentials, and mints signed JWTs.
- **`MessageService.php`:** Enforces anti-spoofing (sender must match token ID), sanitizes HTML entities against XSS, checks conversation authorization, and validates message existence.
- **`KycService.php`:** Validates file MIME types, file sizes (max 5MB), manages upload paths, and handles verification status transitions.
- **`WorkerService.php`:** Manages worker profile data (note: `hourly_rate` has been completely purged in favor of transparent quote-based job billing).

### 4. `repositories/`
- **`UserRepository.php`:** Database queries for user accounts, role-based filtering, and credential checks.
- **`MessageRepository.php`:** `saveMessage()`, `getConversation()`, `markAsRead()`, `getUserConversations()`. Uses composite indexes `(sender_id, receiver_id)` for sub-millisecond retrieval.
- **`WorkerRepository.php`:** Queries verified workers with category joins and average rating calculations.
- **`KycRepository.php`:** Queries and updates worker KYC verification documents.

---

## 💻 JavaScript Code Breakdown

### 1. `js/main.js` (Global Infrastructure, apiFetch, Mobile Bottom Nav)

This file runs globally across every page.

#### Universal API Client (`apiFetch`):
```javascript
async function apiFetch(endpoint, options) {
  options = options || {};
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  const url = endpoint.startsWith('http') ? endpoint : (baseUrl + cleanEndpoint);

  const headers = Object.assign({}, options.headers || {});
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = localStorage.getItem('jobkade_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  const res = await fetch(url, Object.assign({}, options, { headers: headers }));
  const data = await res.json();
  return { ok: res.ok, status: res.status, data: data };
}
```
- **Base URL Calculation:** Automatically figures out whether the page is at the root or inside a subfolder (`/customer/`, `/worker/`, `/admin/`, `/auth/`) and targets the correct `/api/` path.
- **JWT Attachment:** Automatically appends the Bearer token from `localStorage.getItem('jobkade_token')`.

#### Native Mobile Bottom Navigation Bar (`initMobileBottomNav`):
```javascript
function initMobileBottomNav() {
  // Exclude auth pages (login, register)
  if (path.includes('/auth/') || document.body.classList.contains('is-auth-page')) return;
  ...
  // Injects 5 app-style tabs with active path highlighting
}
```
- Creates an iOS/Android style bottom navigation bar with 5 tabs (**Home**, **Workers**, center elevated **`+ Post Job` / `+ Add Service`**, **Chat**, and **Account/Dashboard**).
- Listens to drawer state: smoothly hides (`transform: translateY(100%)`) whenever the slide-out menu or sidebar drawer is active.

#### Global Navbar Authentication Sync (`updateGlobalNavbarAuth`):
- Reads active user session from `localStorage.getItem('jodkade_logged_user')`.
- Replaces generic "Login / Sign Up" buttons with an active user avatar, name, and direct Dashboard button on desktop and mobile.

#### Logout Handler (`logoutUser`):
```javascript
function logoutUser() {
  localStorage.removeItem('jobkade_token');
  localStorage.removeItem('jodkade_logged_user');
  localStorage.removeItem('jobkade_user');
  showToast('Logged out successfully.', 'info');
  setTimeout(function() {
    window.location.href = (isSubfolder ? '../' : '') + 'index.html';
  }, 600);
}
```
- Clears tokens and redirects back to `index.html`.

---

### 2. `js/auth.js` (Login, Signup, JWT & Redirection Logic)

- **Login Form Handler:** Sends `POST /api/auth.php?action=login`. On success, stores token and user profile via `setLoggedInSession(token, user)`.
- **Redirection Logic:** Default post-login destination is **`index.html`** (discovery home). If a `?redirect=` query parameter is present (e.g. from clicking "Message Worker" or "Post Job"), it seamlessly resumes the user's intended action.
- **One-Click Quick Role Switchers:** Auto-fills credentials for Admin, Customer, or Worker for instant testing during degree demonstrations.

---

### 3. `js/messages.js` (Real-Time Polling & In-App Chat)

- **Pure Database Backed:** Zero dummy messages. Connects to `/api/messages.php`.
- **Dynamic Polling:** Auto-fetches new incoming messages every **3.5 seconds** when a conversation thread is open.
- **Memory Safety:** Uses `AbortController` to cancel pending polling requests when switching between chat contacts.
- **Read Receipts:** Automatically posts `markAsRead` when a thread is viewed, updating single checkmarks to blue double checkmarks.

---

### 4. `js/kyc.js` (Document Validation & Preview)

- **Client Validation:** Enforces 5MB file limits and validates supported extensions (`.jpg`, `.jpeg`, `.png`, `.pdf`).
- **Interactive Preview:** Renders thumbnails for image files or PDF icons before upload.
- **Status Badges:** Displays live database verification state (`Verified`, `Pending Approval`, `Action Required`).

---

## 🎨 CSS Architecture & Mobile-First Design System

JobKade uses a pure CSS3 design system organized into modular stylesheets:

1. **`css/style.css` (Core Design System & Mobile UX):**
   - **CSS Variables:** Consistent design tokens for primary blues, status colors, border-radii, and shadow depths.
   - **Section 31 (Native App Experience):**
     - `.mobile-bottom-nav`: Translucent frosted glassmorphism bar (`backdrop-filter: blur(18px)`), safe-area bottom padding.
     - `.mobile-quick-chips`: Horizontally touch-scrollable category chips on the mobile hero.
     - Center elevated action button with gradient glow (`.mobile-nav-action .action-circle`).
     - Global `overflow-x: hidden; max-width: 100vw;` to prevent horizontal page clipping.
     - Worker card footers: Side-by-side "View Profile" + 42×42px square direct contact buttons (**Chat**, **Call**, **WhatsApp**).
     - Dashboard stats: Compact 3-column row for smartphone viewports.
     - Form input auto-zoom prevention: Enforced `font-size: 16px !important;` on inputs, selects, and textareas.
2. **`css/auth.css`:** Responsive single-column auth card with fluid height, removing internal scrollbars and hiding desktop illustrations on mobile.
3. **`css/messages.css`:** Zero-scroll fixed viewport layout with mobile conversation list / thread back-button navigation.

---

## 🧪 Automated Testing & Quality Assurance

JobKade includes dedicated automated test scripts:

1. **Messaging Architecture Tests (`test_messages_flow.php`):**
   ```powershell
   & "C:\wamp64\bin\php\php8.2.29\php.exe" test_messages_flow.php
   ```
   - Tests table truncation, JWT token generation, XSS sanitization, anti-spoofing validation, conversation retrieval, chronological sorting, and read receipts (14/14 tests passing).

2. **Full-Stack KYC & Messaging Flow Tests (`test_kyc_and_messaging_flow.php`):**
   ```powershell
   & "C:\wamp64\bin\php\php8.2.29\php.exe" test_kyc_and_messaging_flow.php
   ```
   - Validates the purge of `hourly_rate`, tests worker KYC submission, admin approval queue, status transition to `verified`, in-app notifications, and customer-worker messaging (100% passing).
