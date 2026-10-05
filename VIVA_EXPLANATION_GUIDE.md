# JobKade — Viva Examination Code Guide (Simple English)

> **Purpose:** This guide is made for your university **Viva / Project Presentation**.  
> It explains **why** code exists, **what each file does**, and **what specific code lines mean** in simple, human English (no confusing robot paragraphs).

---

## 🧠 Part 1: Why Does This Project Have "So Much" JavaScript?

In a web project, you have 3 core layers:
1. **HTML (The Skeleton):** Creates the static buttons, inputs, headings, and layout structure.
2. **CSS (The Clothes & Style):** Decides colors, margins, fonts, and makes mobile screens look nice.
3. **JavaScript (The Brain & Muscle):** Does all the **actions** that make a website feel like a real app instead of a flat paper document.

### Without JavaScript, your website would be dead:
- **No live chat:** You couldn't send messages or auto-refresh new messages without reloading the whole page every 3 seconds.
- **No interactive search:** Checkboxes and filters couldn't filter workers on your screen instantly.
- **No smooth mobile bar:** The bottom app bar and sliding menus couldn't open, close, or auto-hide.
- **No live database talking (AJAX / fetch):** Every time you clicked a button, the entire browser would go blank and reload.
- **No map pin dragging:** You couldn't click on the Leaflet GPS map to pick a location.

### Why is JS split into multiple files instead of one big file?
To keep code clean and organized (Separation of Concerns):
- `main.js` = Global things used on **every** page (top navbar, mobile bottom bar, toast alerts).
- `auth.js` = Only runs on **Login & Sign Up**.
- `messages.js` = Only runs on **In-App Chat**.
- `customer.js` = Only runs on **Customer Dashboard** & Job Posting.
- `worker.js` = Only runs on **Worker Dashboard** & Service Management.
- `kyc.js` = Only runs when a worker uploads **ID / NIC documents**.
- `admin.js` & `admin-kyc.js` = Only runs for the **Admin Panel**.

---

## 📂 Part 2: JavaScript Files — File by File & Line by Line

---

### 1. `js/main.js` (The Global Core)
*Runs on every single page.*

#### What does it do?
- Controls the top navbar and mobile menu drawer.
- Injects and controls the **Native Mobile Bottom Navigation Bar**.
- Connects to the backend via `apiFetch()` with JWT tokens.
- Manages user login session in browser storage (`localStorage`).
- Pops up toast notification alerts (Green for success, Red for errors).

#### Key Code Lines & What They Mean:

* **Lines 8–18 (`Navbar Scroll Effect`):**
  - Listens to `window.scroll`.
  - When user scrolls down more than 10 pixels, adds `.scrolled` CSS class to the navbar to add a shadow and white background.

* **Lines 20–67 (`Mobile Menu Toggle`):**
  - Finds the hamburger button (`.mobile-menu-btn`).
  - When tapped, adds `.active` to `.mobile-menu` and changes the icon from hamburger (`menu`) to close (`x`).
  - Closes automatically if you tap outside or resize your browser.

* **Lines 238–261 (`getApiBaseUrl()`):**
  - Figures out where the backend PHP API folder is (`/api/`).
  - If you are in a subfolder like `customer/` or `worker/`, it automatically trims the path so API calls never fail with 404 errors.

* **Lines 263–292 (`apiFetch(endpoint, options)`):**
  - **Most Important Function in Project!**
  - Replaces standard `fetch()`.
  - Automatically gets the JWT token from `localStorage.getItem('jobkade_token')`.
  - Automatically attaches `Authorization: Bearer <token>` to the HTTP headers.
  - Automatically sets `Content-Type: application/json`.
  - Returns clean JSON data.

* **Lines 300–358 (`User Session & Logout`):**
  - `getLoggedInUser()`: Reads the logged-in user profile from `localStorage`.
  - `setLoggedInSession(token, user)`: Saves the JWT token and user info when you log in.
  - `logoutUser()`: Deletes the JWT token from storage and redirects you to `index.html`.

* **Lines 364–445 (`updateGlobalNavbarAuth()`):**
  - Checks if you are logged in.
  - If YES: Replaces the generic "Login / Sign Up" buttons with your Name, User Avatar initials, and a direct "Dashboard" button.
  - If NO: Leaves the public "Login / Sign Up" buttons visible.

* **Lines 450–550 (`initMobileBottomNav()`):**
  - Creates the 5-tab native mobile app bar on phones (`Home`, `Workers`, `+ Post Job`, `Chat`, `Account`).
  - Detects current URL to highlight which tab is active.
  - If user is a Worker, the center `+` button opens "Add Service". If user is Customer, it opens "Post Job".
  - Hides automatically on Login/Register screens.

* **Lines 455–490 (`showToast(message, type)`):**
  - Creates floating popup banners (e.g. *"Logged in successfully"* or *"Job posted"*).
  - Automatically fades out and destroys itself after 4 seconds.

---

### 2. `js/auth.js` (Login, Register & Form Validation)
*Runs on `auth/login.html` and `auth/register.html`.*

#### What does it do?
- Switches between **Customer** and **Worker** registration forms dynamically.
- Submits credentials to `api/auth.php?action=login` and stores the JWT session token.
- Validates user input client-side (Sri Lankan phone regex, password length, required fields).
- Handles worker registration with trade category selection, NIC, and registration fee modal.
- Provides live dropzone previews for uploaded verification documents and profile pictures.
- Toggles password visibility (Eye / Eye-off icon).

#### Key Code Lines & What They Mean:

* **Lines 8–58 (`Role Selection & Step Navigation on Register`):**
  - Listens to clicks on `.role-card` ("I need a service" vs "I offer a service").
  - Hides the initial role picker card and smoothly reveals the corresponding Customer or Worker form.
  - Automatically scrolls the form panel to the top so inputs are immediately visible.
  - Back button (`.back-to-roles`) resets the view so users can change their chosen role.

* **Lines 60–136 (`Login Form Submission — Real Backend API`):**
  - Listens to `#login-form` submit and calls `e.preventDefault()` to stop page refresh.
  - Disables the submit button and shows `"Signing in..."` to prevent double-clicking.
  - Calls `apiFetch('auth.php?action=login', { method: 'POST', body: JSON.stringify({ email, password }) })`.
  - When backend returns `status === 'success'`: saves the JWT token and user profile into `localStorage` via `setLoggedInSession(token, user)`.
  - Redirects the user cleanly to `index.html` (or to their previous page if they were in the middle of contacting a worker).

* **Lines 138–346 (`Worker Registration & One-Time Access Payment`):**
  - Collects full name, phone (`077...`), email, password, primary service category, and NIC.
  - Uses `FormData` to support multipart registration.
  - Triggers the one-time registration access modal (`#worker-payment-modal`) and records activation via `api/wallet.php?action=pay-access`.
  - Submits worker profile to `api/auth.php?action=register`.

* **Lines 348–395 (`Customer Registration Form Submission`):**
  - Validates full name ($\ge 2$ characters), valid Sri Lankan phone regex (`/^(\+94|0)?[0-9]{9,10}$/`), valid email regex, and minimum 6-character password.
  - Sends clean JSON payload to `api/auth.php?action=register` using `apiFetch()`.

* **Lines 397–423 (`Dropzone Document Upload Previews`):**
  - Listens to file input changes on `#nic-upload`, `#police-upload`, and `#qual-upload`.
  - Calculates file size in Megabytes (`file.size / (1024 * 1024)`) and updates the dropzone label with `✓ Selected: [filename] ([size] MB)`.

* **Lines 425–441 (`Profile Photo Live Preview`):**
  - Uses HTML5 `FileReader` (`reader.readAsDataURL(file)`) to display the user's avatar image thumbnail on screen before upload.

* **Lines 443–458 (`Password Visibility Toggle`):**
  - Finds all `.toggle-password` buttons.
  - Toggles the input between `type="password"` and `type="text"`.
  - Updates the icon from `eye-off` to `eye` dynamically.

---

### 3. `js/messages.js` (Real-Time In-App Chat)
*Runs on `messages.html`.*

#### What does it do?
- Fetches all user chats from the database (`api/messages.php?action=conversations`).
- Opens active chat threads with workers or customers (`api/messages.php?action=conversation&with_user_id=`).
- Dynamically auto-refreshes (polls) the active chat every **3.5 seconds** when the tab is visible.
- Uses `AbortController` to cancel pending network requests if user quickly switches contacts.
- Marks messages as read (`is_read = 1`) on the backend.
- Sends new messages via `POST api/messages.php?action=send` without reloading the page.

#### Key Code Lines & What They Mean:

* **Lines 21–46 (`Authentication Check`):**
  - Checks if a valid user session exists. If not logged in, locks the chat interface and shows a clean *"Login Required"* prompt.

* **Lines 51–61 (`Messaging State Variables`):**
  - `activeUserId`: ID of the person you are chatting with.
  - `activeJobId`: Optional job reference tied to this chat.
  - `pollInterval`: Background timer checking for new messages every 3.5s.
  - `pollAbortController`: Cancels any slow ongoing HTTP request when the user switches contacts to prevent UI lag.
  - `lastMessageCount`: Avoids unnecessary DOM re-renders if no new message has arrived.

* **Lines 63–82 (`formatTimeHHmm(dateStr)`):**
  - Converts MySQL timestamps (`2026-10-05 09:30:00`) into clean human time (`09:30`).

* **Lines 176–200 (`loadConversations()`):**
  - Calls `apiFetch('messages.php?action=conversations')`.
  - Loops through contacts showing name, avatar initials, role badge, last message preview, and unread counts.

* **Lines 395–431 (`loadThreadMessages(scrollToBottom, signal)`):**
  - Calls `apiFetch('messages.php?action=conversation&with_user_id=' + activeUserId, { signal })`.
  - Passes the `AbortController` signal so canceled requests don't cause errors.
  - Compares `messages.length` with `lastMessageCount` to only redraw when new messages arrive.

* **Lines 511–561 (`handleSendMessage()`):**
  - Reads text from `#chat-input`, validates character limit (max 2,000 characters).
  - Sends `POST api/messages.php?action=send` with `{ receiver_id, message_text, job_id }`.
  - Instantly appends the sent bubble and auto-scrolls to the bottom.

* **Lines 618–626 (`Dynamic Polling Timer`):**
  - Runs `setInterval()` every 3,500ms (3.5 seconds).
  - Checks `document.visibilityState === 'visible'` so it pauses polling if the user minimizes or changes browser tabs, saving server bandwidth.

---

### 4. `js/kyc.js` (Worker Document Upload)
*Runs on `worker/kyc.html`.*

#### What does it do?
- Lets skilled workers upload photos of their National Identity Card (NIC) or certifications.
- Validates file size (rejects files larger than 5MB).
- Validates file types (only allows JPG, PNG, and PDF).
- Generates live image preview before uploading.
- Sends file via `FormData` to `api/admin.php?action=upload_kyc`.

#### Key Code Lines & What They Mean:

* **File Size Validation:**
  - `if (file.size > 5 * 1024 * 1024) { showToast('File exceeds 5MB limit', 'error'); return; }`
* **File Reader Preview:**
  - Uses `new FileReader()` and `reader.readAsDataURL(file)` to show an image thumbnail immediately on screen before saving.

---

### 5. `js/customer.js` (Job Requests & GPS Map)
*Runs on customer pages like `customer/post-job.html`.*

#### What does it do?
- Initializes the **Leaflet.js OpenStreetMap** picker.
- Lets customer click anywhere in Sri Lanka to drop a GPS pin.
- Stores GPS latitude and longitude in hidden inputs (`#job-latitude`, `#job-longitude`).
- Handles photo attachments of broken appliances/faults.
- Posts job ticket to `api/jobs.php?action=create`.

#### Key Code Lines & What They Mean:

* **Leaflet Map Initialization:**
  - `var map = L.map('job-location-map').setView([6.9271, 79.8612], 12);`
  - Centers map on Colombo by default.
  - Adds OpenStreetMap tile layer.
  - On map click: moves marker and updates coordinates display.

---

### 6. `js/admin.js` & `js/admin-kyc.js` (Admin Panel & KYC Moderation)
*Runs on `admin/` pages.*

#### What does it do?
- Renders analytics charts using **Chart.js** (monthly user growth, completed jobs, earnings).
- Loads pending worker verification documents.
- Opens document inspection modal with zoom.
- Sends **Approve** or **Reject** decision to `api/admin.php?action=verify_kyc`.

---

## 🎨 Part 3: CSS Files — What Does Each File Control?

### 1. `css/style.css` (The Master Design System)
* **Lines 1–120 (Variables):** Defines root design tokens:
  - `--primary: #5996FF` (JobKade sky blue).
  - `--success: #66BB6A` (Verified green).
  - `--radius: 12px` (Smooth rounded borders).
* **Section 6 (Buttons):** Styles for `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`.
* **Section 14 (Dashboard Layout & Sidebar):** Controls the fixed desktop sidebar (`width: 260px`) and responsive content area.
* **Section 21 (Hero Section):** Styles homepage title, search box, and stats badge.
* **Section 31 (Native App Mobile Experience):**
  - `.mobile-bottom-nav`: Translucent glassmorphism bar fixed at bottom on screens $\le 768\text{px}$.
  - `.mobile-quick-chips`: Horizontal touch slider for Electrician, Plumber, AC Repair chips.
  - `.worker-card-footer`: Places "View Profile" + 3 square contact buttons (Chat, Call, WhatsApp) side-by-side.
  - `overflow-x: hidden`: Stops any horizontal scrolling on smartphones.
  - `font-size: 16px !important`: Prevents iOS Safari from auto-zooming into inputs when tapped.

### 2. `css/auth.css` (Login & Sign-Up Styling)
* Creates the split card container (`.auth-split-container`) with form on left and illustration on right.
* Pill-shaped inputs (`border-radius: 9999px`) with focus glow.
* On mobile: hides illustration, removes fixed heights, and makes form full-width without nested scrollbars.

### 3. `css/messages.css` (In-App Chat Styling)
* Creates a **Zero-Scroll Fixed Viewport Layout** (`height: 100vh; overflow: hidden;`).
* Left side: Contacts list with search.
* Right side: Message thread with incoming (gray) and outgoing (gradient blue) chat bubbles.
* On mobile: Switches between contacts view and chat view with back arrow button (`←`).

### 4. `css/customer.css` & `css/worker.css`
* Dashboard-specific cards:
  - `.stat-card`: Metric box showing count and icon.
  - `.quick-actions`: 1-tap shortcut tiles for posting jobs or adding services.
  - `.verification-card`: Shows worker KYC badge status (`Verified`, `Pending`).

---

## 📄 Part 4: HTML Files — Structural Overview

1. **`index.html` (Landing Page):**
   - Public marketplace discovery.
   - Hero search (trade + location) + Quick Category Chips.
   - Featured verified worker cards with star ratings.
   - "How It Works" 3-step timeline.
2. **`workers.html` (Search Directory):**
   - Search bar + live search filter.
   - Collapsible filter accordion on mobile (`[ Filter Options ▾ ]`).
   - Dynamic worker cards populated from database.
3. **`messages.html` (Messaging Center):**
   - Two-column chat window.
4. **`customer/post-job.html` (Post Job Form):**
   - Title, trade category dropdown, date/time inputs, fault photo upload, and Leaflet GPS map.
5. **`worker/kyc.html` (Worker KYC Desk):**
   - NIC upload dropzone with live preview and status indicators.
6. **`auth/login.html` & `auth/register.html`:**
   - Dedicated authentication portal.

---

## 🎯 Part 5: Top 10 Viva Questions & Golden Answers

### Q1: "Why did you use Vanilla JavaScript instead of React, Angular, or Vue?"
> **Golden Answer:**  
> *"We chose modern Vanilla JavaScript (ES6+) because it provides maximum performance with zero framework overhead, fast initial page load times, and direct control over the DOM. It also avoids heavy build tools (like Webpack or Vite) while fully supporting modern asynchronous features like `async/await`, Fetch API, and IntersectionObserver."*

---

### Q2: "How does authentication work in your application?"
> **Golden Answer:**  
> *"We use stateless **JWT (JSON Web Tokens)** signed with **HMAC-SHA256**. When a user logs in via `auth.php`, the backend verifies their bcrypt password hash and returns a signed token. The frontend stores this token in `localStorage` and our universal `apiFetch()` helper automatically attaches it as an `Authorization: Bearer <token>` header on all protected requests."*

---

### Q3: "How does the in-app chat work in real time without WebSockets?"
> **Golden Answer:**  
> *"We implemented an efficient **Dynamic Short-Polling architecture** in `js/messages.js`. When a chat thread is open, the client queries `api/messages.php?action=conversation` every 3.5 seconds. To prevent UI flickering, it compares the message count with `lastMessageCount` and only re-renders when a new message arrives. To avoid memory leaks, an `AbortController` automatically cancels pending network requests if the user switches contacts."*

---

### Q4: "How does your site prevent SQL Injection?"
> **Golden Answer:**  
> *"All database interactions in our Repository layer (`UserRepository`, `MessageRepository`, `WorkerRepository`) use PHP **PDO Prepared Statements** with parameterized query placeholders (`:email`, `:sender_id`). User input is never concatenated directly into SQL queries, completely eliminating SQL injection risks."*

---

### Q5: "How did you optimize the website for mobile phone users?"
> **Golden Answer:**  
> *"We built an App-Store style mobile experience:  
> 1. A persistent translucent bottom app bar (`.mobile-bottom-nav`) with 5 thumb-friendly tabs that auto-hides when drawers open.  
> 2. Horizontal touch-scrollable quick category chips on the homepage.  
> 3. Enforced `16px` font size on form inputs to prevent iOS Safari auto-zooming.  
> 4. Fixed viewport zero-scroll layout on the messenger.  
> 5. Collapsible filter accordion on `workers.html` so users don't have to scroll through 400px of checkboxes."*

---

### Q6: "Why is `hourly_rate` removed from your system?"
> **Golden Answer:**  
> *"In real-world household and maintenance services in Sri Lanka, skilled handymen rarely charge by the hour. Work is quoted per job scope (e.g., fixing a leaking pipe or installing a ceiling fan). Therefore, we upgraded our model to a transparent **job quotation and invoicing system**."*

---

### Q7: "What is the purpose of `setup_db.php`?"
> **Golden Answer:**  
> *"It is an automated deployment and migration script. When executed via PHP CLI, it connects to MySQL, initializes the `jobkade_db` schema, builds all 14 3NF normalized tables with foreign keys and composite indexes, and seeds pre-configured test accounts for instant testing."*

---

### Q8: "How does the worker location search work?"
> **Golden Answer:**  
> *"When a customer searches by location or GPS coordinates, our backend executes a **Haversine geospatial formula** in SQL. It calculates the spherical distance between the customer's coordinates and the worker's latitude/longitude, returning workers within their active service radius sorted by proximity."*

---

### Q9: "What is `AbortController` in `js/messages.js`?"
> **Golden Answer:**  
> *"It is a standard Web API that allows us to abort in-flight `fetch` requests. When a user rapidly clicks between different conversation contacts, any slow pending HTTP request from the previous chat is immediately canceled so it doesn't overwrite the newly selected conversation."*

---

### Q10: "What happens when a user logs in?"
> **Golden Answer:**  
> *"Upon successful login, `auth.js` receives the JWT token and user profile, saves them to `localStorage`, and routes the user to `index.html`. `main.js` instantly detects the active session, swaps the navbar buttons to show the user's avatar and Dashboard shortcut, and highlights the active account tab on the mobile bottom bar."*
