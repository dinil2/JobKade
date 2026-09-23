# JodKade — Developer Code Guide & Architecture Manual

> **Purpose:** This developer guide explains the inner workings of the JodKade code line-by-line and section-by-section. It is written to help you and your teammates understand the codebase, make manual edits without AI, and easily connect a real backend database (Node.js, Express, PHP, MySQL, MongoDB, Firebase, etc.).

---

## 📋 Table of Contents
1. [Core Architecture & Data Flow](#-core-architecture--data-flow)
2. [JavaScript Code Breakdown (Line-by-Line Concepts)](#-javascript-code-breakdown-line-by-line-concepts)
   - [js/main.js (Global Infrastructure & State)](#1-jsmainjs-global-infrastructure--state)
   - [js/auth.js (Login, Signup & Demo Credentials)](#2-jsauthjs-login-signup--demo-credentials)
   - [js/customer.js (Customer Actions & Jobs)](#3-jscustomerjs-customer-actions--jobs)
   - [js/worker.js (Worker Gigs & Subscriptions)](#4-jsworkerjs-worker-gigs--subscriptions)
   - [js/admin.js (Verification Desk & Chart.js Analytics)](#5-jsadminjs-verification-desk--chartjs-analytics)
3. [CSS Customization & Styling Guide](#-css-customization--styling-guide)
4. [How to Connect a Real Database & Backend API](#-how-to-connect-a-real-database--backend-api)
   - [Step 1: Suggested Database Schemas (SQL / NoSQL)](#step-1-suggested-database-schemas-sql--nosql)
   - [Step 2: Replacing `localStorage` with `fetch()` API calls](#step-2-replacing-localstorage-with-fetch-api-calls)
   - [Step 3: Sample Backend Code (Node.js / Express Example)](#step-3-sample-backend-code-nodejs--express-example)
5. [Manual Editing Cheatsheet (Quick Customization)](#-manual-editing-cheatsheet-quick-customization)

---

## 🏗️ Core Architecture & Data Flow

JodKade currently runs as a **single-page stateful front-end application** utilizing browser `localStorage` for session storage and mock data persistence.

```
+-----------------------------------------------------------------------+
|                             Browser UI                                |
|   (HTML Files in root, auth/, customer/, worker/, admin/ subfolders)  |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                           JavaScript Layer                            |
|                                                                       |
|  main.js       --->  Icons, Toast Engine, Modals, LocalStorage Auth    |
|  auth.js       --->  Role Switching, Demo Buttons, Form Validation    |
|  customer.js   --->  Job Posting Form, Job Cancellation               |
|  worker.js     --->  Service Gigs, Subscription Payment Modal         |
|  admin.js      --->  NIC Verification Preview, Chart.js Visuals      |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                      State & Mock Data Layer                          |
|         localStorage.getItem('jodkade_logged_user')                   |
|         { role: 'customer'|'worker'|'admin', name: '...', email: '...' } |
+-----------------------------------------------------------------------+
```

---

## 💻 JavaScript Code Breakdown (Line-by-Line Concepts)

### 1. `js/main.js` (Global Infrastructure & State)

This script is included on **every single HTML page**. It handles application startup, icons, toasts, modals, and global authentication states.

#### Key Functions Explained:

1. **Lucide Icons Initialization:**
   ```javascript
   if (typeof lucide !== 'undefined') {
     lucide.createIcons();
   }
   ```
   - **What it does:** Scans the HTML page for `<i data-lucide="icon-name"></i>` elements and converts them into SVG vector icons.

2. **Session Storage Helpers:**
   ```javascript
   function getLoggedInUser() {
     var data = localStorage.getItem('jodkade_logged_user');
     return data ? JSON.parse(data) : null;
   }

   function setLoggedInUser(role, name, email) {
     var user = { role: role, name: name, email: email, loginTime: new Date().toISOString() };
     localStorage.setItem('jodkade_logged_user', JSON.stringify(user));
   }
   ```
   - **What it does:** Reads and writes the JSON object stored under key `'jodkade_logged_user'` in browser `localStorage`.

3. **Toast Notification System:**
   ```javascript
   function showToast(message, type) { ... }
   ```
   - **What it does:** Dynamically creates a `<div class="toast toast-success">` element, appends it to `.toast-container`, and automatically removes it after 3.5 seconds.
   - **Types supported:** `'success'`, `'error'`, `'info'`.

4. **Dynamic Navbar Profile Loader (`updateGlobalNavbarAuth`):**
   - **What it does:** Reads `getLoggedInUser()`. If logged in, replaces the public `"Log In / Sign Up"` buttons on the top navbar with a direct **"Dashboard"** button and user initial badge.
   - **Path calculation:** Detects if the current URL is inside a subfolder (`/auth/`, `/customer/`, `/worker/`, `/admin/`) and adds `../` prefix automatically.

5. **Modal Helper Engine:**
   - **What it does:** Adds event listeners to buttons with `data-dismiss="modal"` so clicking "Cancel", "Close", or background overlays closes active dialog modals smoothly.

---

### 2. `js/auth.js` (Login, Signup & Demo Credentials)

Handles authentication forms and one-click demo credentials on `auth/login.html` and `auth/register.html`.

#### Key Sections Explained:

1. **One-Click Demo Login Handler:**
   ```javascript
   const demoButtons = document.querySelectorAll('[data-demo]');
   demoButtons.forEach(function (btn) {
     btn.addEventListener('click', function () {
       var role = this.getAttribute('data-demo'); // 'customer', 'worker', or 'admin'
       ...
       setLoggedInUser(role, name, email);
       window.location.href = prefix + role + '/dashboard.html';
     });
   });
   ```
   - **What it does:** Reads attributes like `data-demo="customer"` from HTML buttons, auto-fills the email and password fields, saves the session into `localStorage`, and redirects to the correct subfolder dashboard (`customer/dashboard.html`, `worker/dashboard.html`, or `admin/dashboard.html`).

2. **Registration Form Submit Handler:**
   - Validates input, saves user role choice (`customer` or `worker`), displays a success toast, and redirects after 1.2 seconds.

---

### 3. `js/customer.js` (Customer Actions & Jobs)

Included in `customer/` portal HTML pages.

#### Key Handlers Explained:

1. **Posting a New Job (`customer/post-job.html`):**
   ```javascript
   var jobPostForm = document.getElementById('job-post-form');
   if (jobPostForm) {
     jobPostForm.addEventListener('submit', function (e) {
       e.preventDefault();
       // Reads form inputs: title, category, budget, location
       showToast('Job request posted successfully!', 'success');
       setTimeout(function () { window.location.href = 'jobs.html'; }, 1500);
     });
   }
   ```
   - **Manual Edit Tip:** To send this job data to a backend server, replace `showToast` with an HTTP `fetch('/api/jobs', { method: 'POST', body: JSON.stringify(formData) })`.

2. **Cancelling a Job Request (`customer/jobs.html`):**
   - Shows confirmation modal when clicking `.cancel-job-btn` and removes/updates job row upon confirmation.

---

### 4. `js/worker.js` (Worker Gigs & Subscriptions)

Included in `worker/` portal HTML pages.

#### Key Handlers Explained:

1. **Creating a Service Listing (`worker/add-service.html`):**
   - Validates title, category, and pricing inputs, shows success toast, and redirects to `worker/my-services.html`.

2. **Subscription Payment Modal (`worker/subscription.html`):**
   - Opens payment modal when clicking plan upgrade buttons.
   - Simulates card processing when clicking `#confirm-payment` and updates active plan status badge.

---

### 5. `js/admin.js` (Verification Desk & Chart.js Analytics)

Included in `admin/` portal HTML pages.

#### Key Handlers Explained:

1. **NIC Document Inspection Modal (`admin/verification.html`):**
   - Opens full-size modal displaying dummy National Identity Card front & back uploads for verification review.
   - Handles **Approve** (issues verified badge) and **Reject** action buttons.

2. **Chart.js Analytics Rendering (`admin/analytics.html`):**
   ```javascript
   var ctx = document.getElementById('revenue-chart').getContext('2d');
   new Chart(ctx, {
     type: 'line',
     data: {
       labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
       datasets: [{ label: 'Revenue (LKR)', data: [120000, 150000, 180000, 240000, 310000, 450000], borderColor: '#5996FF' }]
     }
   });
   ```
   - **What it does:** Uses **Chart.js** library to render dynamic line graphs for monthly revenue and doughnut charts for service category demand.

---

## 🎨 CSS Customization & Styling Guide

All colors, spacing, and component styles are centralized in **`css/style.css`**.

### Modifying Colors & Theme Variables:
Open [`css/style.css`](file:///d:/uni/Final%20Project/jodkade/css/style.css) and edit lines 1–25:

```css
:root {
  --primary-color: #5996FF;       /* Main Brand Blue */
  --primary-hover: #407BFF;       /* Darker Blue on Hover */
  --secondary-color: #6C757D;     /* Muted Grey Text */
  --success-color: #66BB6A;       /* Green Badges & Verified Icons */
  --warning-color: #FFA726;       /* Orange Pending Badges */
  --danger-color: #EF5350;        /* Red Danger Buttons & Suspensions */
  --bg-color: #F8FAFC;            /* Page Background */
  --card-bg: #FFFFFF;             /* White Card Background */
  --text-color: #1E293B;          /* Base Dark Text */
  --font-family: 'Inter', sans-serif;
}
```

---

## 🔌 How to Connect a Real Database & Backend API

Currently, the front-end uses `localStorage` for demo purposes. Here is how you can connect a real backend database (Node.js/Express + MongoDB or MySQL, or PHP + MySQL):

### Step 1: Suggested Database Schemas

#### SQL Schema (MySQL / PostgreSQL Example):
```sql
-- 1. Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer', 'worker', 'admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Worker Profiles Table
CREATE TABLE worker_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT FOREIGN KEY REFERENCES users(id),
    category VARCHAR(50) NOT NULL,
    hourly_rate DECIMAL(10,2),
    location VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    nic_number VARCHAR(20)
);

-- 3. Jobs Table
CREATE TABLE jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT FOREIGN KEY REFERENCES users(id),
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    budget DECIMAL(10,2),
    location VARCHAR(100),
    status ENUM('open', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Step 2: Replacing `localStorage` with `fetch()` API Calls

To make real HTTP API requests to a backend server, update functions in `js/auth.js` and `js/customer.js`:

#### Example: Replacing Login in `js/auth.js`

**Before (Mock/LocalStorage):**
```javascript
setLoggedInUser(targetRole, userName, email);
window.location.href = '../customer/dashboard.html';
```

**After (Real Backend API Call):**
```javascript
async function loginUser(email, password) {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });

    const data = await response.json();

    if (response.ok) {
      // Save JWT Token or User Data
      localStorage.setItem('jodkade_token', data.token);
      localStorage.setItem('jodkade_logged_user', JSON.stringify(data.user));

      showToast('Login successful!', 'success');
      window.location.href = '../' + data.user.role + '/dashboard.html';
    } else {
      showToast(data.message || 'Invalid credentials', 'error');
    }
  } catch (error) {
    showToast('Server error. Please try again later.', 'error');
  }
}
```

---

### Step 3: Sample Backend Route (Node.js / Express Example)

Create a `server.js` file in a `backend/` directory if you choose to build a Node.js backend:

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Sample Login Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Example dummy authentication query logic
  if (email === 'admin@jodkade.lk' && password === 'password123') {
    return res.json({
      token: 'jwt_secret_token_123',
      user: { name: 'System Administrator', email: email, role: 'admin' }
    });
  }

  res.status(401).json({ message: 'Invalid email or password' });
});

// Sample Get Jobs Route
app.get('/api/jobs', (req, res) => {
  res.json([
    { id: 1, title: 'House Electrical Rewiring', category: 'Electrician', budget: 15000, status: 'open' },
    { id: 2, title: 'Bathroom Pipe Leak Repair', category: 'Plumber', budget: 5500, status: 'open' }
  ]);
});

app.listen(5000, () => console.log('Backend API running on http://localhost:5000'));
```

---

## 🛠️ Manual Editing Cheatsheet (Quick Customization)

| Task | File to Edit | Instructions |
| :--- | :--- | :--- |
| **Add a new navigation link** | HTML pages (e.g. `index.html`) | Find `<div class="nav-links">` and add `<a href="your-page.html" class="nav-link">Page Name</a>`. |
| **Change site logo / brand name** | HTML pages | Search for `<a href="..." class="nav-logo">` and change text inside `Jod<span>Kade</span>`. |
| **Add a new Service Category** | `services.html` & `index.html` | Add a new `.category-card` HTML block with a Lucide icon. |
| **Edit Demo Accounts & Credentials** | `auth/login.html` & `js/auth.js` | Update attributes `data-demo="role"`, `data-email="..."`, `data-password="..."` in `auth/login.html`. |
| **Add a new form field to Post Job** | `customer/post-job.html` & `js/customer.js` | Add `<div class="form-group"><label>Field</label><input name="new_field" class="form-input"></div>` and access `this.querySelector('[name="new_field"]').value` in JS. |
| **Change Primary Brand Color** | `css/style.css` | Change `--primary-color: #5996FF;` to your preferred hex code (e.g., `#2563EB`). |

---

*Manual code guide prepared for team collaboration and degree project submission.*
