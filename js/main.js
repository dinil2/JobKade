/* ==========================================
   JODKADE — Main JavaScript
   Shared functionality across all pages
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Navbar Scroll Effect ----
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // ---- Mobile Menu Toggle ----
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isActive = mobileMenu.classList.toggle('active');
      document.body.classList.toggle('mobile-menu-open', isActive);

      // Robust hamburger to close icon swap
      mobileMenuBtn.innerHTML = isActive 
        ? '<i data-lucide="x" width="24" height="24"></i>'
        : '<i data-lucide="menu" width="24" height="24"></i>';

      if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    // Close mobile menu on navigation link click
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('active');
        document.body.classList.remove('mobile-menu-open');
        mobileMenuBtn.innerHTML = '<i data-lucide="menu" width="24" height="24"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      });
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (mobileMenu.classList.contains('active') && !mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        mobileMenu.classList.remove('active');
        document.body.classList.remove('mobile-menu-open');
        mobileMenuBtn.innerHTML = '<i data-lucide="menu" width="24" height="24"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    // Close on resize to desktop
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && mobileMenu.classList.contains('active')) {
        mobileMenu.classList.remove('active');
        document.body.classList.remove('mobile-menu-open');
        mobileMenuBtn.innerHTML = '<i data-lucide="menu" width="24" height="24"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // ---- Sidebar Toggle (Dashboard pages) ----
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.querySelector('.sidebar-overlay');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      const isActive = sidebar.classList.toggle('active');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isActive);
      document.body.classList.toggle('sidebar-open', isActive);
    });

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', function () {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.classList.remove('sidebar-open');
      });
    }

    // Auto-close sidebar on link click on mobile
    sidebar.querySelectorAll('.sidebar-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 1024) {
          sidebar.classList.remove('active');
          if (sidebarOverlay) sidebarOverlay.classList.remove('active');
          document.body.classList.remove('sidebar-open');
        }
      });
    });
  }

  // ---- Notification Dropdown & Clear All ----
  const notifBell = document.querySelector('.notification-bell');
  const notifDropdown = document.querySelector('.notification-dropdown');

  if (notifBell && notifDropdown) {
    notifBell.addEventListener('click', function (e) {
      e.stopPropagation();
      notifDropdown.classList.toggle('active');
    });

    document.addEventListener('click', function (e) {
      if (!notifDropdown.contains(e.target) && !notifBell.contains(e.target)) {
        notifDropdown.classList.remove('active');
      }
    });

    // Clear all notifications action
    var clearBtns = notifDropdown.querySelectorAll('a, button');
    clearBtns.forEach(function (btn) {
      if (btn.textContent.toLowerCase().includes('clear')) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var badge = notifBell.querySelector('.notif-badge, .notif-count');
          if (badge) badge.style.display = 'none';

          notifDropdown.querySelectorAll('.notification-item, .notif-item').forEach(function (item) {
            item.classList.remove('unread');
            item.style.opacity = '0.6';
          });

          showToast('All notifications marked as read.', 'info');
        });
      }
    });
  }

  // ---- Tab Switching ----
  const tabContainers = document.querySelectorAll('[data-tabs]');
  tabContainers.forEach(function (container) {
    const tabs = container.querySelectorAll('.tab');
    const contents = container.parentElement.querySelectorAll('.tab-content');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const target = this.getAttribute('data-tab');

        tabs.forEach(function (t) { t.classList.remove('active'); });
        contents.forEach(function (c) { c.classList.remove('active'); });

        this.classList.add('active');
        const targetContent = document.getElementById(target);
        if (targetContent) targetContent.classList.add('active');
      });
    });
  });

  // ---- Scroll Animations (IntersectionObserver) ----
  const animatedElements = document.querySelectorAll('.animate-on-scroll');
  if (animatedElements.length > 0) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    animatedElements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // ---- Modal Open/Close ----
  // Open modal: add data-modal="modal-id" to any button
  document.querySelectorAll('[data-modal]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      const modalId = this.getAttribute('data-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    });
  });

  // Close modal: click overlay, close button, or cancel button
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const modal = this.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // ---- Image Error Fallback ----
  document.querySelectorAll('img').forEach(function (img) {
    img.addEventListener('error', function () {
      this.style.display = 'none';
      // Show parent placeholder if exists
      const placeholder = this.nextElementSibling;
      if (placeholder && placeholder.classList.contains('img-fallback')) {
        placeholder.style.display = 'flex';
      }
    });
  });

  // ---- Global Auth & Navbar State ----
  updateGlobalNavbarAuth();

  // ---- Mobile App Bottom Navigation Bar ----
  initMobileBottomNav();

  // ---- Bind all sidebar logout buttons ----
  document.querySelectorAll('a[href="login.html"]').forEach(function(link) {
    if (link.textContent.toLowerCase().includes('logout')) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        logoutUser();
      });
    }
  });

  // ---- Initialize Lucide Icons ----
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

});

/* ==========================================
   Global Auth & User Session State + Real API
   ========================================== */

/**
 * Dynamically determine API Base URL based on deployment path
 */
function getApiBaseUrl() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || window.location.protocol === 'file:') {
    return 'http://localhost/JobKade-main%20(1)/JobKade-main/api/';
  }
  let path = window.location.pathname;
  // If inside subdirectories like /admin/, /auth/, /customer/, /worker/
  const subdirs = ['/admin/', '/auth/', '/customer/', '/worker/'];
  for (let i = 0; i < subdirs.length; i++) {
    const idx = path.toLowerCase().indexOf(subdirs[i]);
    if (idx !== -1) {
      path = path.substring(0, idx + 1);
      break;
    }
  }
  // If path ends with a file (e.g. index.html), trim to directory
  if (!path.endsWith('/')) {
    path = path.substring(0, path.lastIndexOf('/') + 1);
  }
  return origin + path + 'api/';
}

/**
 * Universal API Fetch with JWT Bearer auth
 */
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

  const config = Object.assign({}, options, { headers: headers });

  try {
    const res = await fetch(url, config);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data: data };
  } catch (err) {
    console.warn('apiFetch warning:', err);
    return { ok: false, status: 0, data: { status: 'error', message: err.message } };
  }
}

function getAuthToken() {
  return localStorage.getItem('jobkade_token') || '';
}

/**
 * Get current logged in user from localStorage
 */
function getLoggedInUser() {
  try {
    var userJson = localStorage.getItem('jodkade_logged_user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Set logged in session with JWT token and user profile
 */
function setLoggedInSession(token, user) {
  if (token) {
    localStorage.setItem('jobkade_token', token);
  }
  if (user) {
    var normalized = {
      id: user.id || user.user_id,
      name: user.name || user.full_name || 'User',
      username: user.username || '',
      email: user.email || '',
      role: (user.role || 'customer').toLowerCase(),
      phone: user.phone || '',
      worker_id: user.worker_id || null,
      loginTime: new Date().getTime()
    };
    localStorage.setItem('jodkade_logged_user', JSON.stringify(normalized));
    localStorage.setItem('jobkade_user', JSON.stringify(normalized));
    return normalized;
  }
  return null;
}

/**
 * Set logged in user state
 */
function setLoggedInUser(role, name, email) {
  return setLoggedInSession('', {
    role: role || 'customer',
    name: name || 'User',
    email: email || ''
  });
}

/**
 * Log out user & clear session
 */
function logoutUser() {
  localStorage.removeItem('jobkade_token');
  localStorage.removeItem('jodkade_logged_user');
  localStorage.removeItem('jobkade_user');
  showToast('Logged out successfully.', 'info');
  var isSubfolder = window.location.pathname.includes('/admin/') || window.location.pathname.includes('/customer/') || window.location.pathname.includes('/worker/') || window.location.pathname.includes('/auth/');
  setTimeout(function() {
    window.location.href = (isSubfolder ? '../' : '') + 'index.html';
  }, 600);
}


/**
 * Update Navbar Auth Buttons based on login state across all public pages
 */
function updateGlobalNavbarAuth() {
  var user = getLoggedInUser();
  var navAuth = document.querySelector('.nav-auth');
  var mobileAuth = document.querySelector('.mobile-auth');

  if (!user || (!navAuth && !mobileAuth)) return;

  var isSubfolder = window.location.pathname.includes('/admin/') || window.location.pathname.includes('/customer/') || window.location.pathname.includes('/worker/') || window.location.pathname.includes('/auth/');
  var rel = isSubfolder ? '../' : '';

  var dashboardPage = rel + 'customer/dashboard.html';
  var badgeColor = 'avatar-blue';
  var roleLabel = 'Customer';
  var userInitials = 'DS';

  if (user.role === 'worker') {
    dashboardPage = rel + 'worker/dashboard.html';
    badgeColor = 'avatar-green';
    roleLabel = 'Worker';
    userInitials = 'KP';
  } else if (user.role === 'admin') {
    dashboardPage = rel + 'admin/dashboard.html';
    badgeColor = 'avatar-purple';
    roleLabel = 'Admin';
    userInitials = 'AD';
  }

  // Desktop Navbar Auth Update
  if (navAuth) {
    navAuth.innerHTML = 
      '<div class="user-nav-profile" style="position:relative;display:flex;align-items:center;gap:10px;">' +
        '<a href="' + dashboardPage + '" class="btn btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;">' +
          '<i data-lucide="layout-dashboard" width="16" height="16"></i> Dashboard' +
        '</a>' +
        '<div class="user-nav-trigger" id="user-nav-trigger" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-light);border:1px solid var(--border);border-radius:30px;cursor:pointer;">' +
          '<div class="avatar avatar-sm ' + badgeColor + '" style="width:28px;height:28px;font-size:0.75rem;">' + userInitials + '</div>' +
          '<span style="font-weight:600;font-size:0.875rem;color:var(--text-primary);">' + user.name.split(' ')[0] + '</span>' +
          '<i data-lucide="chevron-down" width="14" height="14" style="color:var(--text-secondary);"></i>' +
        '</div>' +
        '<div class="user-nav-menu" id="user-nav-menu" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;background:white;border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);padding:8px;min-width:210px;z-index:1000;">' +
          '<div style="padding:10px 12px;border-bottom:1px solid var(--border-light);margin-bottom:4px;">' +
            '<div style="font-weight:700;font-size:0.875rem;color:var(--text-primary);">' + user.name + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">' + user.email + '</div>' +
            '<span class="badge badge-verified" style="margin-top:6px;font-size:0.6875rem;text-transform:uppercase;">' + roleLabel + '</span>' +
          '</div>' +
          '<a href="' + dashboardPage + '" style="display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:0.875rem;color:var(--text-primary);border-radius:6px;text-decoration:none;transition:background 0.2s;" onmouseover="this.style.background=\'var(--bg-light)\'" onmouseout="this.style.background=\'none\'">' +
            '<i data-lucide="layout-dashboard" width="16" height="16"></i> Go to Dashboard' +
          '</a>' +
          '<button onclick="logoutUser()" style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:0.875rem;color:var(--error);border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.2s;" onmouseover="this.style.background=\'var(--error-light)\'" onmouseout="this.style.background=\'none\'">' +
            '<i data-lucide="log-out" width="16" height="16"></i> Logout' +
          '</button>' +
        '</div>' +
      '</div>';

    var trigger = document.getElementById('user-nav-trigger');
    var menu = document.getElementById('user-nav-menu');
    if (trigger && menu) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', function () {
        menu.style.display = 'none';
      });
    }
  }

  // Mobile Auth Update
  if (mobileAuth) {
    mobileAuth.innerHTML = 
      '<div style="padding:12px;background:var(--bg-light);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">' +
        '<div style="font-weight:700;font-size:0.9375rem;">' + user.name + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">' + roleLabel.toUpperCase() + ' • ' + user.email + '</div>' +
      '</div>' +
      '<a href="' + dashboardPage + '" class="btn btn-primary w-full mb-1" style="display:flex;align-items:center;justify-content:center;gap:8px;"><i data-lucide="layout-dashboard" width="18" height="18"></i> Dashboard</a>' +
      '<button onclick="logoutUser()" class="btn btn-outline w-full" style="color:var(--error);border-color:var(--error);display:flex;align-items:center;justify-content:center;gap:8px;"><i data-lucide="log-out" width="18" height="18"></i> Logout</button>';
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Initialize Native App Style Mobile Bottom Navigation Bar
 */
function initMobileBottomNav() {
  var path = window.location.pathname.toLowerCase();

  // Exclude auth pages (login, register, forgot-password)
  if (path.includes('/auth/') || document.body.classList.contains('is-auth-page')) {
    return;
  }

  // Check folder depth for relative links
  var isSubfolder = path.includes('/admin/') || path.includes('/customer/') || path.includes('/worker/');
  var rel = isSubfolder ? '../' : '';

  var user = getLoggedInUser();
  var role = user ? (user.role || 'customer').toLowerCase() : null;

  // Active state detection
  var isHomeActive = path.endsWith('/index.html') || path.endsWith('/') || (!isSubfolder && !path.includes('.html'));
  var isWorkersActive = path.includes('workers.html') || path.includes('worker-profile.html') || path.includes('services.html');
  var isActionActive = path.includes('post-job.html') || path.includes('add-service.html');
  var isMessagesActive = path.includes('messages.html');
  var isAccountActive = !isActionActive && (
    path.includes('dashboard.html') || 
    path.includes('profile.html') || 
    path.includes('profile-edit.html') || 
    path.includes('jobs.html') || 
    path.includes('saved-workers.html') || 
    path.includes('wallet.html') || 
    path.includes('subscription.html') || 
    path.includes('kyc.html') || 
    path.includes('settings.html') ||
    path.includes('login.html')
  );

  var homeUrl = rel + 'index.html';
  var workersUrl = rel + 'workers.html';
  var actionUrl = role === 'worker' ? (rel + 'worker/add-service.html') : (rel + 'customer/post-job.html');
  var actionLabel = role === 'worker' ? 'Add Service' : 'Post Job';
  var messagesUrl = rel + 'messages.html';

  var accountUrl = rel + 'auth/login.html';
  var accountLabel = 'Login';
  var accountIcon = 'user';

  if (user) {
    if (role === 'worker') {
      accountUrl = rel + 'worker/dashboard.html';
      accountLabel = 'Dashboard';
      accountIcon = 'layout-dashboard';
    } else if (role === 'admin') {
      accountUrl = rel + 'admin/dashboard.html';
      accountLabel = 'Admin';
      accountIcon = 'shield';
    } else {
      accountUrl = rel + 'customer/dashboard.html';
      accountLabel = 'Account';
      accountIcon = 'user';
    }
  }

  var existingNav = document.querySelector('.mobile-bottom-nav');
  if (!existingNav) {
    existingNav = document.createElement('nav');
    existingNav.className = 'mobile-bottom-nav';
    existingNav.setAttribute('aria-label', 'Mobile App Navigation');
    document.body.appendChild(existingNav);
  }

  existingNav.innerHTML =
    '<a href="' + homeUrl + '" class="mobile-nav-item ' + (isHomeActive ? 'active' : '') + '">' +
      '<i data-lucide="home"></i>' +
      '<span>Home</span>' +
    '</a>' +
    '<a href="' + workersUrl + '" class="mobile-nav-item ' + (isWorkersActive ? 'active' : '') + '">' +
      '<i data-lucide="search"></i>' +
      '<span>Workers</span>' +
    '</a>' +
    '<a href="' + actionUrl + '" class="mobile-nav-item mobile-nav-action ' + (isActionActive ? 'active' : '') + '">' +
      '<div class="action-circle">' +
        '<i data-lucide="plus"></i>' +
      '</div>' +
      '<span>' + actionLabel + '</span>' +
    '</a>' +
    '<a href="' + messagesUrl + '" class="mobile-nav-item ' + (isMessagesActive ? 'active' : '') + '">' +
      '<i data-lucide="message-square"></i>' +
      '<span>Chat</span>' +
    '</a>' +
    '<a href="' + accountUrl + '" class="mobile-nav-item ' + (isAccountActive ? 'active' : '') + '">' +
      '<i data-lucide="' + accountIcon + '"></i>' +
      '<span>' + accountLabel + '</span>' +
    '</a>';

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/* ==========================================
   Toast Notification System
   ========================================== */

/**
 * Show a toast notification
 * @param {string} message - The toast message
 * @param {string} type - 'success' | 'error' | 'info' | 'warning'
 * @param {number} duration - Duration in milliseconds (default 4000)
 */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 4000;

  // Create container if it doesn't exist
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Icon mapping
  var icons = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info',
    warning: 'alert-triangle'
  };

  // Create toast element
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<i data-lucide="' + icons[type] + '"></i>' +
    '<span>' + message + '</span>' +
    '<span class="toast-close" onclick="this.parentElement.remove()">&times;</span>';

  container.appendChild(toast);

  // Initialize icon
  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ nodes: [toast] });
  }

  // Auto remove
  setTimeout(function () {
    toast.classList.add('toast-exit');
    setTimeout(function () {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}


/* ==========================================
   Utility Functions
   ========================================== */

/**
 * Close a modal by ID
 */
function closeModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

/**
 * Open a modal by ID
 */
function openModal(modalId) {
  var modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

/**
 * Visual Form Validation Helpers
 */
function showFieldError(input, message) {
  if (!input) return;
  input.classList.add('is-invalid');
  
  var parent = input.parentElement;
  var existingError = parent.querySelector('.form-feedback-error');
  if (existingError) existingError.remove();

  var errSpan = document.createElement('span');
  errSpan.className = 'form-feedback-error';
  errSpan.textContent = message;
  
  if (input.nextSibling) {
    parent.insertBefore(errSpan, input.nextSibling);
  } else {
    parent.appendChild(errSpan);
  }

  var clearListener = function () {
    input.classList.remove('is-invalid');
    if (errSpan.parentNode) errSpan.remove();
    input.removeEventListener('input', clearListener);
    input.removeEventListener('change', clearListener);
  };
  input.addEventListener('input', clearListener);
  input.addEventListener('change', clearListener);
}

function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.is-invalid').forEach(function (el) {
    el.classList.remove('is-invalid');
  });
  form.querySelectorAll('.form-feedback-error').forEach(function (el) {
    el.remove();
  });
}

/**
 * Format currency (Sri Lankan Rupees)
 */
function formatCurrency(amount) {
  return 'Rs. ' + amount.toLocaleString();
}

/**
 * Get greeting based on time of day
 */
function getGreeting() {
  var hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Simulate loading state for demo
 */
function simulateLoading(element, duration) {
  duration = duration || 1500;
  element.classList.add('loading');
  setTimeout(function () {
    element.classList.remove('loading');
  }, duration);
}
