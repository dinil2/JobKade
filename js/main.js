/* ==========================================
   JODKADE — Main JavaScript
   Shared functionality across all pages
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {
  initNavbarScroll();
  initMobileMenu();
  initSidebar();
  initNotifications();
  initTabs();
  initScrollAnimations();
  initModalTriggers();
  initImageFallbacks();
  initLogoutBindings();

  updateGlobalNavbarAuth();
  initMobileBottomNav();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// ==========================================
// UI Component Initializers
// ==========================================

function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    });
  }
}

function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const menu = document.querySelector('.mobile-menu');
  if (!btn || !menu) return;

  function closeMenu() {
    menu.classList.remove('active');
    document.body.classList.remove('mobile-menu-open');
    btn.innerHTML = '<i data-lucide="menu" width="24" height="24"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = menu.classList.toggle('active');
    document.body.classList.toggle('mobile-menu-open', isActive);
    btn.innerHTML = isActive
      ? '<i data-lucide="x" width="24" height="24"></i>'
      : '<i data-lucide="menu" width="24" height="24"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('active') && !menu.contains(e.target) && !btn.contains(e.target)) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && menu.classList.contains('active')) closeMenu();
  });
}

function initSidebar() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (!sidebar) return;

  function closeSidebar() {
    sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }

  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = sidebar.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active', isActive);
      document.body.classList.toggle('sidebar-open', isActive);
    });
  }

  if (overlay) overlay.addEventListener('click', closeSidebar);

  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024) closeSidebar();
    });
  });
}

function initNotifications() {
  const bell = document.querySelector('.notification-bell');
  const dropdown = document.querySelector('.notification-dropdown');
  if (!bell || !dropdown) return;

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  dropdown.querySelectorAll('a, button').forEach(btn => {
    if (btn.textContent.toLowerCase().includes('clear')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const badge = bell.querySelector('.notif-badge, .notif-count');
        if (badge) badge.style.display = 'none';

        dropdown.querySelectorAll('.notification-item, .notif-item').forEach(item => {
          item.classList.remove('unread');
          item.style.opacity = '0.6';
        });

        showToast('All notifications marked as read.', 'info');
      });
    }
  });
}

function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach(container => {
    const tabs = container.querySelectorAll('.tab');
    const contents = container.parentElement.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', function () {
        const target = this.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        this.classList.add('active');
        const targetContent = document.getElementById(target);
        if (targetContent) targetContent.classList.add('active');
      });
    });
  });
}

function initScrollAnimations() {
  const elements = document.querySelectorAll('.animate-on-scroll');
  if (elements.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  elements.forEach(el => observer.observe(el));
}

function initModalTriggers() {
  document.querySelectorAll('[data-modal]').forEach(trigger => {
    trigger.addEventListener('click', function () {
      const modal = document.getElementById(this.getAttribute('data-modal'));
      if (modal) modal.classList.add('active');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', function () {
      this.closest('.modal-overlay')?.classList.remove('active');
    });
  });
}

function initImageFallbacks() {
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function () {
      this.style.display = 'none';
      const placeholder = this.nextElementSibling;
      if (placeholder && placeholder.classList.contains('img-fallback')) {
        placeholder.style.display = 'flex';
      }
    });
  });
}

function initLogoutBindings() {
  document.querySelectorAll('a[href="login.html"]').forEach(link => {
    if (link.textContent.toLowerCase().includes('logout')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        logoutUser();
      });
    }
  });
}

// ==========================================
// Global Auth & API Client
// ==========================================

function getApiBaseUrl() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || window.location.protocol === 'file:') {
    return 'http://localhost/JobKade/api/';
  }

  let path = window.location.pathname;
  const subdirs = ['/admin/', '/auth/', '/customer/', '/worker/'];
  for (const sub of subdirs) {
    const idx = path.toLowerCase().indexOf(sub);
    if (idx !== -1) {
      path = path.substring(0, idx + 1);
      break;
    }
  }

  if (!path.endsWith('/')) {
    path = path.substring(0, path.lastIndexOf('/') + 1);
  }
  return origin + path + 'api/';
}

async function apiFetch(endpoint, options = {}) {
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

  try {
    const res = await fetch(url, Object.assign({}, options, { headers }));
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn('apiFetch warning:', err);
    return { ok: false, status: 0, data: { status: 'error', message: err.message } };
  }
}

function getAuthToken() {
  return localStorage.getItem('jobkade_token') || '';
}

function getLoggedInUser() {
  try {
    const userJson = localStorage.getItem('jodkade_logged_user');
    return userJson ? JSON.parse(userJson) : null;
  } catch (e) {
    return null;
  }
}

function requireAuth(role) {
  const token = getAuthToken();
  const user = getLoggedInUser();
  if (!token || !user || (user.role || '').toLowerCase() !== String(role).toLowerCase()) {
    const here = window.location.pathname.split('/').slice(-2).join('/');
    window.location.href = '../auth/login.html?redirect=' + encodeURIComponent(here);
    return null;
  }
  return user;
}

function setLoggedInSession(token, user) {
  if (token) localStorage.setItem('jobkade_token', token);
  if (user) {
    const normalized = {
      id: user.id || user.user_id,
      name: user.name || user.full_name || 'User',
      username: user.username || '',
      email: user.email || '',
      role: (user.role || 'customer').toLowerCase(),
      phone: user.phone || '',
      worker_id: user.worker_id || null,
      loginTime: Date.now()
    };
    localStorage.setItem('jodkade_logged_user', JSON.stringify(normalized));
    localStorage.setItem('jobkade_user', JSON.stringify(normalized));
    return normalized;
  }
  return null;
}

function setLoggedInUser(role, name, email) {
  return setLoggedInSession('', {
    role: role || 'customer',
    name: name || 'User',
    email: email || ''
  });
}

function logoutUser() {
  ['jobkade_token', 'jodkade_logged_user', 'jobkade_user'].forEach(k => localStorage.removeItem(k));
  showToast('Logged out successfully.', 'info');
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => window.location.pathname.includes(s));
  setTimeout(() => {
    window.location.href = (isSubfolder ? '../' : '') + 'index.html';
  }, 600);
}

// ==========================================
// Dynamic Navbar & Mobile Bottom Nav
// ==========================================

function updateGlobalNavbarAuth() {
  const user = getLoggedInUser();
  const navAuth = document.querySelector('.nav-auth');
  const mobileAuth = document.querySelector('.mobile-auth');
  if (!user || (!navAuth && !mobileAuth)) return;

  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => window.location.pathname.includes(s));
  const rel = isSubfolder ? '../' : '';

  const roleConfigs = {
    worker:   { page: 'worker/dashboard.html',   badge: 'avatar-green',  label: 'Worker',   initials: 'KP' },
    admin:    { page: 'admin/dashboard.html',    badge: 'avatar-purple', label: 'Admin',    initials: 'AD' },
    customer: { page: 'customer/dashboard.html', badge: 'avatar-blue',   label: 'Customer', initials: 'DS' }
  };

  const cfg = roleConfigs[user.role] || roleConfigs.customer;
  const dashboardPage = rel + cfg.page;
  const firstName = (user.name || 'User').split(' ')[0];

  if (navAuth) {
    navAuth.innerHTML = `
      <div class="user-nav-profile" style="position:relative;display:flex;align-items:center;gap:10px;">
        <a href="${dashboardPage}" class="btn btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;">
          <i data-lucide="layout-dashboard" width="16" height="16"></i> Dashboard
        </a>
        <div class="user-nav-trigger" id="user-nav-trigger" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-light);border:1px solid var(--border);border-radius:30px;cursor:pointer;">
          <div class="avatar avatar-sm ${cfg.badge}" style="width:28px;height:28px;font-size:0.75rem;">${cfg.initials}</div>
          <span style="font-weight:600;font-size:0.875rem;color:var(--text-primary);">${firstName}</span>
          <i data-lucide="chevron-down" width="14" height="14" style="color:var(--text-secondary);"></i>
        </div>
        <div class="user-nav-menu" id="user-nav-menu" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;background:white;border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.1);padding:8px;min-width:210px;z-index:1000;">
          <div style="padding:10px 12px;border-bottom:1px solid var(--border-light);margin-bottom:4px;">
            <div style="font-weight:700;font-size:0.875rem;color:var(--text-primary);">${user.name}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">${user.email}</div>
            <span class="badge badge-verified" style="margin-top:6px;font-size:0.6875rem;text-transform:uppercase;">${cfg.label}</span>
          </div>
          <a href="${dashboardPage}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:0.875rem;color:var(--text-primary);border-radius:6px;text-decoration:none;transition:background 0.2s;" onmouseover="this.style.background='var(--bg-light)'" onmouseout="this.style.background='none'">
            <i data-lucide="layout-dashboard" width="16" height="16"></i> Go to Dashboard
          </a>
          <button onclick="logoutUser()" style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:0.875rem;color:var(--error);border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.2s;" onmouseover="this.style.background='var(--error-light)'" onmouseout="this.style.background='none'">
            <i data-lucide="log-out" width="16" height="16"></i> Logout
          </button>
        </div>
      </div>`;

    const trigger = document.getElementById('user-nav-trigger');
    const menu = document.getElementById('user-nav-menu');
    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', () => { menu.style.display = 'none'; });
    }
  }

  if (mobileAuth) {
    mobileAuth.innerHTML = `
      <div style="padding:12px;background:var(--bg-light);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:0.9375rem;">${user.name}</div>
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;">${cfg.label.toUpperCase()} • ${user.email}</div>
      </div>
      <a href="${dashboardPage}" class="btn btn-primary w-full mb-1" style="display:flex;align-items:center;justify-content:center;gap:8px;">
        <i data-lucide="layout-dashboard" width="18" height="18"></i> Dashboard
      </a>
      <button onclick="logoutUser()" class="btn btn-outline w-full" style="color:var(--error);border-color:var(--error);display:flex;align-items:center;justify-content:center;gap:8px;">
        <i data-lucide="log-out" width="18" height="18"></i> Logout
      </button>`;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initMobileBottomNav() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/auth/') || document.body.classList.contains('is-auth-page')) return;

  const isSubfolder = ['/admin/', '/customer/', '/worker/'].some(s => path.includes(s));
  const rel = isSubfolder ? '../' : '';

  const user = getLoggedInUser();
  const role = user ? (user.role || 'customer').toLowerCase() : null;

  const isHomeActive = path.endsWith('/index.html') || path.endsWith('/') || (!isSubfolder && !path.includes('.html'));
  const isWorkersActive = ['workers.html', 'worker-profile.html', 'services.html'].some(s => path.includes(s));
  const isActionActive = ['post-job.html', 'add-service.html'].some(s => path.includes(s));
  const isMessagesActive = path.includes('messages.html');
  const isAccountActive = !isActionActive && [
    'dashboard.html', 'profile.html', 'profile-edit.html', 'jobs.html', 'saved-workers.html',
    'wallet.html', 'subscription.html', 'kyc.html', 'settings.html', 'login.html'
  ].some(s => path.includes(s));

  const actionUrl = role === 'worker' ? (rel + 'worker/add-service.html') : (rel + 'customer/post-job.html');
  const actionLabel = role === 'worker' ? 'Add Service' : 'Post Job';

  let accountUrl = rel + 'auth/login.html';
  let accountLabel = 'Login';
  let accountIcon = 'user';

  if (user) {
    if (role === 'worker') {
      accountUrl = rel + 'worker/dashboard.html'; accountLabel = 'Dashboard'; accountIcon = 'layout-dashboard';
    } else if (role === 'admin') {
      accountUrl = rel + 'admin/dashboard.html'; accountLabel = 'Admin'; accountIcon = 'shield';
    } else {
      accountUrl = rel + 'customer/dashboard.html'; accountLabel = 'Account'; accountIcon = 'user';
    }
  }

  let existingNav = document.querySelector('.mobile-bottom-nav');
  if (!existingNav) {
    existingNav = document.createElement('nav');
    existingNav.className = 'mobile-bottom-nav';
    existingNav.setAttribute('aria-label', 'Mobile App Navigation');
    document.body.appendChild(existingNav);
  }

  existingNav.innerHTML = `
    <a href="${rel}index.html" class="mobile-nav-item ${isHomeActive ? 'active' : ''}">
      <i data-lucide="home"></i><span>Home</span>
    </a>
    <a href="${rel}workers.html" class="mobile-nav-item ${isWorkersActive ? 'active' : ''}">
      <i data-lucide="search"></i><span>Workers</span>
    </a>
    <a href="${actionUrl}" class="mobile-nav-item mobile-nav-action ${isActionActive ? 'active' : ''}">
      <div class="action-circle"><i data-lucide="plus"></i></div><span>${actionLabel}</span>
    </a>
    <a href="${rel}messages.html" class="mobile-nav-item ${isMessagesActive ? 'active' : ''}">
      <i data-lucide="message-square"></i><span>Chat</span>
    </a>
    <a href="${accountUrl}" class="mobile-nav-item ${isAccountActive ? 'active' : ''}">
      <i data-lucide="${accountIcon}"></i><span>${accountLabel}</span>
    </a>`;

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================
// Toast & Shared Utilities
// ==========================================

function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info',
    warning: 'alert-triangle'
  };

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}"></i>
    <span>${message}</span>
    <span class="toast-close" onclick="this.parentElement.remove()">&times;</span>`;

  container.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [toast] });

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
  }, duration);
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

function showFieldError(input, message) {
  if (!input) return;
  input.classList.add('is-invalid');

  const parent = input.parentElement;
  parent.querySelector('.form-feedback-error')?.remove();

  const errSpan = document.createElement('span');
  errSpan.className = 'form-feedback-error';
  errSpan.textContent = message;

  input.insertAdjacentElement('afterend', errSpan);

  const clearListener = () => {
    input.classList.remove('is-invalid');
    errSpan.remove();
    input.removeEventListener('input', clearListener);
    input.removeEventListener('change', clearListener);
  };
  input.addEventListener('input', clearListener);
  input.addEventListener('change', clearListener);
}

function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  form.querySelectorAll('.form-feedback-error').forEach(el => el.remove());
}

function formatCurrency(amount) {
  return 'Rs. ' + Number(amount || 0).toLocaleString();
}

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function simulateLoading(element, duration = 1500) {
  element.classList.add('loading');
  setTimeout(() => element.classList.remove('loading'), duration);
}
