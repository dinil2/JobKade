# JodKade — Final Degree Project Guide & Technical Documentation

> **Project Name:** JodKade (Local Skilled Worker Marketplace Platform)  
> **Purpose:** A complete full-stack styled front-end platform connecting Sri Lankan households and businesses with verified local skilled workers (electricians, plumbers, carpenters, technicians, etc.).

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features by User Role](#-key-features-by-user-role)
3. [File & Directory Structure](#-file--directory-structure)
4. [HTML Pages Guide (A to Z)](#-html-pages-guide-a-to-z)
5. [CSS Architecture & Styling](#-css-architecture--styling)
6. [JavaScript Logic & Functionality](#-javascript-logic--functionality)
7. [How to Run & Present Locally](#-how-to-run--present-locally)

---

## 🌟 Project Overview

**JodKade** solves a major local challenge: finding reliable, verified local handymen and skilled service providers quickly and securely.

The platform supports **3 distinct user roles**:
1. **Customers:** People looking to hire skilled workers or post job requests.
2. **Workers:** Skilled professionals offering services, applying for jobs, and managing subscriptions.
3. **Administrators:** Platform moderators managing worker NIC identity verifications, user accounts, content reports, and system analytics.

---

## 👥 Key Features by User Role

### 1. 🛒 Customer Portal
- Browse workers by service category, district/city, and star rating.
- View detailed worker profiles with reviews and past work history.
- Post job requests with details (title, description, budget, urgency, location).
- Save favorite workers for quick access.
- Direct messaging simulation with workers.

### 2. 🛠️ Worker Portal
- Create and manage service listings (gigs).
- Browse customer job postings and apply/bid.
- Edit worker profile (bio, hourly rates, skills, location).
- Manage subscription plans (Free, Monthly, Annual) required to respond to customer leads.
- Real-time notification simulation and job tracking.

### 3. 🛡️ Admin Portal
- **NIC Verification System:** Review uploaded National Identity Cards to grant verified badges.
- **Worker & Customer Management:** View registered users, track activity, and suspend accounts if necessary.
- **Job Request Moderation:** Monitor all active platform postings.
- **Content Moderation:** Handle flagged reviews and reported content.
- **Analytics Dashboard:** Visualize platform growth, revenue, and top requested service categories using **Chart.js**.

---

## 📁 File & Directory Structure

The project follows a clean, modular folder layout:

```
jodkade/
├── index.html                 # Main Landing Page
├── services.html              # Service Categories Directory
├── workers.html               # Public Worker Directory & Search
├── worker-profile.html        # Public Worker Profile Details
├── how-it-works.html          # Platform Guide & How-It-Works
├── messages.html              # Messages & Chat Interface
├── PROJECT_GUIDE.md           # Project Documentation (This File)
│
├── css/                       # Stylesheets
│   ├── style.css              # Core Design System (Variables, Navbar, Cards, Modals, Toasts)
│   ├── auth.css               # Authentication Pages Styling
│   ├── customer.css           # Customer Dashboard Layout & Components
│   ├── worker.css             # Worker Dashboard Layout & Components
│   └── admin.css              # Admin Control Panel Layout & Data Tables
│
├── js/                        # JavaScript Functionality
│   ├── main.js                # Core App Logic, State, Toast Notifications, Dynamic Navbar
│   ├── auth.js                # Login, Signup & Demo Credential Switching Logic
│   ├── customer.js            # Customer Dashboard Interactions & Form Handlers
│   ├── worker.js              # Worker Service Creation & Bidding Logic
│   └── admin.js               # Admin Verification Modals & Chart.js Analytics
│
├── auth/                      # Authentication Pages
│   ├── login.html             # Login Page (with Quick Demo Credentials)
│   └── register.html          # User Registration Page (Customer / Worker Choice)
│
├── customer/                  # Customer Dashboard Pages
│   ├── dashboard.html         # Customer Overview & Quick Actions
│   ├── jobs.html              # Customer's Posted Jobs & Status Tracker
│   ├── post-job.html          # Job Request Creation Form
│   ├── profile.html           # Customer Profile Settings
│   └── saved-workers.html     # Saved/Bookmarked Workers Directory
│
├── worker/                    # Worker Dashboard Pages
│   ├── dashboard.html         # Worker Overview, Earnings & Stats
│   ├── jobs.html              # Customer Jobs Open for Applications
│   ├── my-services.html       # Active Worker Service Listings
│   ├── add-service.html       # Create New Service Listing Form
│   ├── profile-edit.html      # Edit Skill Details, Rates & Location
│   ├── settings.html          # Worker Account Settings
│   └── subscription.html      # Subscription Plans & Payment Modal
│
└── admin/                     # Admin Portal Pages
    ├── dashboard.html         # Admin Summary & Urgent Verification Alerts
    ├── verification.html      # Worker NIC Document Verification Desk
    ├── workers.html           # Manage Registered Worker Accounts
    ├── customers.html         # Manage Registered Customer Accounts
    ├── jobs.html              # Platform-Wide Job Moderation
    ├── moderation.html        # Content Reports & Moderation
    └── analytics.html         # Platform Analytics & Chart Visualizations
```

---

## 📄 HTML Pages Guide (A to Z)

### Public Pages (Root Directory)

| File Name | Purpose & Features |
| :--- | :--- |
| `index.html` | **Landing Page:** Features a hero banner, search bar, service category grid, featured verified workers, how-it-works breakdown, testimonials, and footer. |
| `services.html` | **Services Directory:** Browse all service categories (Electrician, Plumber, Carpenter, AC Repair, Painter, Cleaner, etc.) with category counts. |
| `workers.html` | **Worker Search Page:** Filterable directory of workers with search bar, category dropdown, location filter, star rating filter, and worker cards. |
| `worker-profile.html` | **Public Worker Profile:** Detailed view of an individual worker (e.g., Kasun Perera) displaying bio, rating breakdown, badges, skills, service offerings, and customer reviews. |
| `how-it-works.html` | **Guide Page:** Explains step-by-step how customers post jobs and how workers receive leads and complete work. |
| `messages.html` | **Messaging Center:** Interactive chat view to communicate between customers and workers with message history and input form. |

---

### Authentication Pages (`auth/`)

| File Name | Purpose & Features |
| :--- | :--- |
| `auth/login.html` | **Login Portal:** Sign in form with quick **Demo Account Buttons** (Customer, Worker, Admin) that fill credentials and auto-login with one click. |
| `auth/register.html` | **Sign Up Portal:** Account creation form allowing users to select whether they want to register as a Customer or a Worker. |

---

### Customer Portal (`customer/`)

| File Name | Purpose & Features |
| :--- | :--- |
| `customer/dashboard.html` | **Customer Home:** Shows overview stats (Total Jobs, Active Jobs, Spent), quick action buttons, and recent job activity. |
| `customer/jobs.html` | **My Job Postings:** List of jobs posted by the customer with status tags (*Open*, *In Progress*, *Completed*, *Cancelled*) and option to cancel jobs. |
| `customer/post-job.html` | **Post a Job Form:** Interactive form to describe required work, category, location, budget, and deadline. |
| `customer/profile.html` | **Customer Account:** View and update contact info, address, and notification preferences. |
| `customer/saved-workers.html` | **Saved Workers:** Grid of bookmarked worker profiles for quick re-hiring. |

---

### Worker Portal (`worker/`)

| File Name | Purpose & Features |
| :--- | :--- |
| `worker/dashboard.html` | **Worker Home:** Shows earnings summary, jobs completed, active subscription badge, and quick access to new customer leads. |
| `worker/jobs.html` | **Browse Jobs:** View active job postings submitted by customers in Sri Lanka and submit quotes/proposals. |
| `worker/my-services.html` | **My Service Listings:** Manage offered service gigs with options to edit or delete listings. |
| `worker/add-service.html` | **Add New Service:** Form to create a new service listing with title, category, pricing, and description. |
| `worker/profile-edit.html` | **Edit Profile:** Update skills tags, bio, hourly rate, work experience, and location. |
| `worker/settings.html` | **Worker Settings:** Account settings, payout methods, and password change. |
| `worker/subscription.html` | **Subscription Plans:** Choose between *Free Trial*, *Pro Monthly*, or *Enterprise Annual* plans with interactive dummy credit card payment modal. |

---

### Admin Portal (`admin/`)

| File Name | Purpose & Features |
| :--- | :--- |
| `admin/dashboard.html` | **Admin Control Panel:** High-level platform metrics, system health, quick links, and urgent verification notices. |
| `admin/verification.html` | **Worker NIC Verification:** Review uploaded NIC documents (front & back) with action buttons to **Approve Verification** or **Reject**. |
| `admin/workers.html` | **Manage Workers:** Complete list of all registered workers with account status and suspension controls. |
| `admin/customers.html` | **Manage Customers:** Registered customer directory with job history count and account moderation. |
| `admin/jobs.html` | **Job Request Moderation:** Platform-wide view of all customer postings with removal capabilities for non-compliant jobs. |
| `admin/moderation.html` | **Content Moderation:** Review user reports regarding bad behavior or spam with action modals to remove reported items. |
| `admin/analytics.html` | **Platform Analytics:** Interactive charts rendered using **Chart.js** displaying monthly revenue, user registration growth, and top service categories. |

---

## 🎨 CSS Architecture & Styling

The CSS is designed cleanly using modern CSS custom properties (variables), Flexbox, and CSS Grid:

1. **`css/style.css` (Core Design System):**
   - **Colors:** Modern cohesive palette (`--primary`: `#5996FF`, `--success`: `#66BB6A`, `--warning`: `#FFA726`, `--danger`: `#EF5350`, `--dark`: `#1A202C`).
   - **Typography:** Uses Google Font **Inter** (clean, readable UI font).
   - **Reusability:** Provides global styles for buttons (`.btn`), badges (`.badge`), cards (`.card`), avatar initial bubbles (`.avatar`), search bars, modals (`.modal`), and toast notifications (`.toast`).

2. **Role Specific CSS Files:**
   - **`css/customer.css` & `css/worker.css`:** Sidebar layouts (`.dashboard-layout`, `.sidebar`), metric grid cards (`.stat-card`), and form inputs.
   - **`css/admin.css`:** Darker sidebar theme for administrative distinction, data tables (`.table`), badge tags, and chart containers.
   - **`css/auth.css`:** Centered split-screen authentication cards and interactive role switcher buttons.

---

## ⚡ JavaScript Logic & Functionality

The JavaScript logic is divided into modular scripts without requiring heavy external dependencies (pure Vanilla JS + Lucide Icons + Chart.js):

1. **`js/main.js` (Global Infrastructure):**
   - **Lucide Icons:** Initializes modern vector icons automatically on page load (`lucide.createIcons()`).
   - **State Persistence:** Uses browser `localStorage` (`jodkade_logged_user`) to store user sessions (role, name, email).
   - **Dynamic Navbar:** Automatically renders user initial avatar and Dashboard button on navbar when logged in.
   - **Toast System:** `showToast(message, type)` triggers animated success, error, or info popups in the corner.
   - **Modal System:** Standardized logic to open and close modals when buttons with `data-dismiss="modal"` or modal triggers are clicked.

2. **`js/auth.js` (Login & Signup Handlers):**
   - Implements one-click demo login buttons for instant demo switching between **Customer**, **Worker**, and **Admin**.
   - Handles form validation and redirects users to their appropriate role dashboard upon login/signup.

3. **`js/customer.js` (Customer Dashboard Actions):**
   - Controls job posting form submission, toast notifications, and redirects to `customer/jobs.html`.
   - Handles job cancellation modals.

4. **`js/worker.js` (Worker Dashboard Actions):**
   - Handles adding new services, deleting service listings with confirmation modals.
   - Simulates subscription plan upgrading and credit card payments.

5. **`js/admin.js` (Admin Dashboard & Analytics):**
   - Handles NIC document inspection preview modal.
   - Triggers worker verification approvals and account suspensions.
   - Initializes **Chart.js** dynamic line and doughnut charts on `admin/analytics.html`.

---

## 🚀 How to Run & Present Locally

1. **Start Local Server:**
   Open terminal inside the project directory and run:
   ```bash
   python -m http.server 8000
   ```
   *Alternatively, use `npx serve .` or Live Server extension in VS Code.*

2. **Open in Browser:**
   Navigate to:
   ```
   http://localhost:8000
   ```

3. **Demo Walkthrough Steps for Presentation:**
   - **Landing Page (`index.html`):** Show the hero section, worker cards, and category grid.
   - **Worker Search (`workers.html`):** Demonstrate filtering workers by location and category.
   - **Worker Detail (`worker-profile.html`):** Show Kasun Perera's profile, ratings, and reviews.
   - **One-Click Demo Logins (`auth/login.html`):**
     - Click **"Demo Customer"** -> Redirects to Customer Dashboard (`customer/dashboard.html`).
     - Click **"Demo Worker"** -> Redirects to Worker Dashboard (`worker/dashboard.html`).
     - Click **"Demo Admin"** -> Redirects to Admin Panel (`admin/dashboard.html`).
   - **Admin NIC Verification (`admin/verification.html`):** Show how admins inspect NIC documents and verify workers.
   - **Admin Analytics (`admin/analytics.html`):** Display platform growth and revenue charts.

---

*Documentation compiled for final degree project presentation.*
