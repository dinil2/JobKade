# Job Kade: A Verified Location-Based Marketplace

**CSE5015 Computing Project — 4th Semester Group Assignment**  
*Cardiff Metropolitan University / ICBT*

---

## 👥 Project Team & Roles

| Student ID | Full Name | Role & Core Responsibilities |
| :--- | :--- | :--- |
| **CL/HDCSE/CMU/133/62** (St20345367) | **Risith Sasmitha** | **Project Manager & Backend Developer**: Core PHP 8.x RESTful APIs, JWT Auth, RBAC, KYC uploads, IPG Integration. |
| **CL/HDCSE/CMU/133/63** (St20345368) | **Dinil Bhashana** | **Frontend Developer (Code & Logic)**: Responsive Bootstrap 5.3 UI, Vanilla JS, Fetch API, Leaflet.js / OpenStreetMap, In-App Chat. |
| **CL/HDCSE/CMU/133/84** (St20345386) | **Anuprabha Eshani** | **UI/UX Designer**: User workflows, wireframes, design standards, printable receipt layout. |
| **CL/HDCSE/CMU/133/80** (St20345382) | **Trishiya Nathali** | **Database Engineer**: 3NF Normalized MySQL/MariaDB Schema, Haversine geospatial queries, indexes, and integrity. |
| **CL/HDCSE/CMU/133/74** (St20345376) | **Lakmini Wathsalya** | **QA Engineer & Documentation Lead**: Test plans, API validation with Swagger/Postman, boundary & security testing. |

---

## 🏗️ Architecture & Technology Stack

```
Controller Layer  --> Handles HTTP requests, input validation, and API routing
       │
       ▼
 Service Layer    --> Business logic (Auth, Job Lifecycle, Subscriptions, KYC, Chat)
       │
       ▼
Repository Layer  --> Data access & prepared statement queries
       │
       ▼
 Database Layer   --> MySQL / MariaDB (phpMyAdmin) with 3NF normalization
```

- **Backend**: PHP 8.x (Object-Oriented, Layered Architecture, PDO)
- **Database**: MySQL / MariaDB (Database: `jobkade_db` / `jobkade`, managed via **phpMyAdmin**)
- **Frontend**: HTML5, CSS3, Bootstrap 5.3, JavaScript (Fetch API / DOM Manipulation)
- **Mobile Experience**: Native App-Store style Mobile UI with bottom app bar, touch gestures, and responsive layouts
- **Mapping**: Leaflet.js + OpenStreetMap API
- **Security & Auth**: JWT (JSON Web Tokens) with HMAC-SHA256, bcrypt password hashing, Role-Based Access Control (RBAC: Customer, Worker, Admin)
- **Payments**: Online Payment Gateway (IPG) simulation & Printable/Downloadable Digital Receipts

---

## 📱 Mobile-First Experience (Native App UI/UX)

JobKade is designed with a **Mobile-First Native App experience** for smartphone users:
1. **Native Mobile Bottom App Bar (`.mobile-bottom-nav`)**:
   - Thumb-friendly navigation bar fixed at screen bottom with translucent glassmorphism (`backdrop-filter: blur(18px)`).
   - Dynamic 5 tabs: **Home**, **Workers**, elevated center action button (**`+ Post Job`** / **`+ Add Service`**), **Chat/Messages**, and **Account/Dashboard**.
   - Auto-hides gracefully when opening a slide-out drawer or full-screen menu.
2. **Hero Quick Category Chips**:
   - Horizontally touch-scrollable quick chips on the homepage hero (⚡ Electrician, 💧 Plumber, ❄️ AC Repair, 🔨 Carpentry, 🎨 Painting) for instant 1-tap browsing without opening the keyboard.
3. **Optimized Mobile Hero**:
   - Clean, centered single-column layout with zero horizontal overflow (`html, body { overflow-x: hidden; }`).
   - Compact 3-column statistics card (**500+ Verified Workers | 1,200+ Jobs Completed | 4.8 Rating**).
4. **Worker Cards Touch Actions**:
   - "View Profile" button paired side-by-side with 42×42px square direct contact buttons (**Chat**, **Call**, and **WhatsApp**).
5. **Mobile Collapsible Filters**:
   - Compact filter bar with a `[ Filter Options ▾ ]` accordion toggle so users immediately see worker cards without scrolling past 400px of checkboxes.
6. **Dashboard & Auth Mobile Optimization**:
   - Compact 3-column stats row for customer and worker dashboards.
   - Fluid single-column mobile authentication cards with `16px` inputs to prevent iOS Safari auto-zooming.

---

## 🚀 Quick Setup Instructions

### 1. Start WampServer
- Open **WampServer** from your Start menu or desktop shortcut.
- Wait until the tray icon turns **Green** (Apache and MySQL running).

### 2. Initialize Database (`jobkade_db`)
Choose either method:
- **Option A (Automated)**:
  Run in PowerShell:
  ```powershell
  & "C:\wamp64\bin\php\php8.2.29\php.exe" "setup_db.php"
  ```
- **Option B (phpMyAdmin)**:
  1. Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin)
  2. Click **Import**, select `database/schema.sql`, and click **Import**.

### 3. Run and Test the Application
Start the PHP server:
```powershell
& "C:\wamp64\bin\php\php8.2.29\php.exe" -S localhost:8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your web browser.

---

## 🔑 Pre-Seeded Demonstration Accounts

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@jobkade.lk` | `admin@123` | Full access to stats, KYC approvals, and user moderation. |
| **Customer** | `customer@gmail.com` | `customer@123` | Can post jobs, search map, and chat with workers. |
| **Worker (Electrician)**| `sunil.electric@gmail.com`| `worker@123` | Verified Master Electrician with Colombo map pin and active subscription. |
| **Worker (Plumber)** | `kamal.plumber@gmail.com` | `worker@123` | Verified licensed plumber in Bambalapitiya. |
| **Worker (AC Tech)** | `nimal.ac@gmail.com` | `worker@123` | Inverter AC Specialist in Cinnamon Gardens. |

