/* ==========================================
   JODKADE — Main JavaScript
   Shared functionality across all pages
   ========================================== */

function escapeHtml(str) {
  return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
}

function initSharedApp() {
  renderSharedComponents();

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
  syncCurrentUserProfile();

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSharedApp);
} else {
  initSharedApp();
}

// Immediate initial rendering if containers already exist in the DOM
if (typeof document !== 'undefined') {
  if (document.getElementById('navbar-container') || document.getElementById('sidebar-container') ||
      document.getElementById('navbarContainer') || document.getElementById('sidebarContainer')) {
    renderSharedComponents();
  }
}

// ==========================================
// Shared Dashboard Navbar & Sidebar Components
// ==========================================

function getPageRole() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/worker/')) return 'worker';
  if (path.includes('/customer/')) return 'customer';
  if (path.includes('/admin/')) return 'admin';
  if (document.body.dataset && document.body.dataset.role) {
    return document.body.dataset.role.toLowerCase();
  }
  const user = getLoggedInUser();
  if (user && user.role) {
    return String(user.role).toLowerCase();
  }
  return 'customer';
}

function resolveAvatarUrl(url, rootPath = '') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const clean = trimmed.replace(/^(\.\.\/|\.\/|\/)+/, '');
  return rootPath + clean;
}

function getRoleUserInfo(role) {
  const user = getLoggedInUser();
  const defaultNames = {
    worker: 'Worker',
    customer: 'Customer',
    admin: 'System Administrator'
  };
  const defaultInitials = {
    worker: 'WK',
    customer: 'CU',
    admin: 'AD'
  };
  const defaultRoles = {
    worker: 'Worker',
    customer: 'Customer',
    admin: 'Platform Admin'
  };

  const name = user?.name || user?.full_name || defaultNames[role] || 'User';
  let initials = defaultInitials[role] || 'U';
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  }

  const roleTitle = defaultRoles[role] || 'Member';
  const workerAvatar = localStorage.getItem('jobkade_worker_avatar');
  const photo = workerAvatar || user?.profile_picture || user?.avatar || null;
  return { name, initials, roleTitle, photo };
}

function isItemActive(item, currentPath, currentFile, role) {
  if (role === 'worker') {
    if (item.label === 'Dashboard') return currentFile === 'dashboard.html' && currentPath.includes('/worker/');
    if (item.label === 'My Profile') return currentFile === 'profile-edit.html' || currentFile === 'settings.html';
    if (item.label === 'Identity and KYC') return currentFile === 'kyc.html';
    if (item.label === 'My Services') return currentFile === 'my-services.html' || currentFile === 'add-service.html';
    if (item.label === 'Customer Jobs') return currentFile === 'jobs.html' && currentPath.includes('/worker/');
    if (item.label === 'Wallet and Earnings') return currentFile === 'wallet.html';
    if (item.label === 'Subscriptions') return currentFile === 'subscription.html';
    if (item.label === 'My Reviews') return currentFile === 'reviews.html';
    if (item.label === 'Messages') return currentFile === 'messages.html';
  } else if (role === 'customer') {
    if (item.label === 'Dashboard') return currentFile === 'dashboard.html' && currentPath.includes('/customer/');
    if (item.label === 'Post a Job') return currentFile === 'post-job.html';
    if (item.label === 'My Jobs') return currentFile === 'jobs.html' && currentPath.includes('/customer/');
    if (item.label === 'Saved Workers') return currentFile === 'saved-workers.html';
    if (item.label === 'Messages') return currentFile === 'messages.html';
    if (item.label === 'My Profile') return currentFile === 'profile.html';
  } else if (role === 'admin') {
    if (item.label === 'Overview') return ['dashboard.html', 'index.html', 'admin', ''].includes(currentFile);
    if (item.label === 'KYC Moderation') return ['kyc-moderation.html', 'verification.html'].includes(currentFile);
    if (item.label === 'Manage Workers') return currentFile === 'workers.html';
    if (item.label === 'Manage Customers') return currentFile === 'customers.html';
    if (item.label === 'Job Requests') return currentFile === 'jobs.html';
    if (item.label === 'Content Moderation') return currentFile === 'moderation.html';
    if (item.label === 'Analytics and Reports') return currentFile === 'analytics.html';
  }
  return false;
}

function updateAdminBadge() {
  const badges = document.querySelectorAll('#pendingCounterBadge');
  if (!badges.length) return;
  const token = localStorage.getItem('jobkade_token') || '';
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => window.location.pathname.toLowerCase().includes(s));
  const rootPath = isSubfolder ? '../' : '';
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  fetch(`${rootPath}api/admin.php?action=stats`, { headers })
    .then(res => res.json())
    .then(data => {
      if (data && data.stats && data.stats.pending_kyc !== undefined) {
        badges.forEach(el => {
          el.textContent = data.stats.pending_kyc;
        });
      }
    })
    .catch(() => {});
}

function renderSharedComponents(roleOverride) {
  const navbarContainer = document.getElementById('navbar-container') || document.getElementById('navbarContainer');
  const sidebarContainer = document.getElementById('sidebar-container') || document.getElementById('sidebarContainer');
  if (!navbarContainer && !sidebarContainer) return;

  const role = (roleOverride || getPageRole()).toLowerCase();
  const currentPath = window.location.pathname.toLowerCase();
  const currentFile = currentPath.split('/').pop() || 'index.html';
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => currentPath.includes(s));
  const rootPath = isSubfolder ? '../' : '';

  const userInfo = getRoleUserInfo(role);
  const avatarColor = role === 'admin' ? 'avatar-purple' : (role === 'worker' ? 'avatar-green' : 'avatar-blue');
  const avatarInnerHtml = userInfo.photo
    ? `<img src="${escapeHtml(resolveAvatarUrl(userInfo.photo, rootPath))}" alt="${escapeHtml(userInfo.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${escapeHtml(userInfo.initials)}';">`
    : escapeHtml(userInfo.initials);

  // 1. Render Unified Top Navbar
  if (navbarContainer) {
    let profileHref = `${rootPath}customer/profile.html`;
    if (role === 'worker') profileHref = `${rootPath}worker/profile-edit.html`;
    else if (role === 'admin') profileHref = `${rootPath}admin/dashboard.html`;

    navbarContainer.innerHTML = `
      <nav class="navbar" id="navbar">
        <div class="container dashboard-nav">
          <div class="dashboard-nav-left">
            <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle Sidebar"><i data-lucide="menu" width="24" height="24"></i></button>
            <a href="${rootPath}index.html" class="nav-logo">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#5996FF"/>
                <path d="M10 22L16 10L22 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12.5 18H19.5" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="16" cy="10" r="2" fill="#66BB6A"/>
              </svg>
              Job<span>Kade</span>
            </a>
          </div>
          <div class="dashboard-nav-right">
            <div class="notification-wrapper">
              <button class="notification-bell" aria-label="Notifications" title="Notifications">
                <i data-lucide="bell" width="22" height="22"></i>
                <span class="notif-count" style="display: none;">0</span>
              </button>
              <div class="notification-dropdown">
                <div class="notification-dropdown-header">
                  <h4>Notifications</h4>
                  <a href="#" class="text-sm text-primary-color mark-all-read-btn" id="markAllReadBtn">Mark all read</a>
                </div>
                <div class="notification-list" id="notificationList">
                  <div class="notification-empty" style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No notifications yet.</div>
                </div>
              </div>
            </div>
            <a href="${profileHref}" style="text-decoration:none;" title="My Profile" id="navbarProfileLink">
              <div class="avatar avatar-nav ${avatarColor}" id="${role === 'admin' ? 'adminNavAvatar' : 'navAvatar'}">${avatarInnerHtml}</div>
            </a>
            <a href="${rootPath}auth/login.html" class="nav-logout-btn" id="navLogoutBtn" title="Logout from JobKade">
              <i data-lucide="log-out" width="18" height="18"></i>
              <span>Logout</span>
            </a>
          </div>
        </div>
      </nav>
    `;
  }

  // 2. Render Unified Sidebar
  if (sidebarContainer) {
    const isInsideAdmin = currentPath.includes('/admin/');
    const adminPrefix = isInsideAdmin ? '' : `${rootPath}admin/`;

    const roleMenus = {
      worker: [
        { label: 'Dashboard', icon: 'layout-dashboard', href: `${rootPath}worker/dashboard.html` },
        { label: 'My Profile', icon: 'user', href: `${rootPath}worker/profile-edit.html` },
        { label: 'Identity and KYC', icon: 'shield-check', href: `${rootPath}worker/kyc.html` },
        { label: 'My Services', icon: 'briefcase', href: `${rootPath}worker/my-services.html` },
        { label: 'Customer Jobs', icon: 'file-text', href: `${rootPath}worker/jobs.html` },
        { label: 'Wallet and Earnings', icon: 'wallet', href: `${rootPath}worker/wallet.html` },
        { label: 'Subscriptions', icon: 'credit-card', href: `${rootPath}worker/subscription.html` },
        { label: 'My Reviews', icon: 'star', href: `${rootPath}worker/reviews.html` },
        { label: 'Messages', icon: 'message-square', href: `${rootPath}messages.html` }
      ],
      customer: [
        { label: 'Dashboard', icon: 'layout-dashboard', href: `${rootPath}customer/dashboard.html` },
        { label: 'Post a Job', icon: 'plus-circle', href: `${rootPath}customer/post-job.html` },
        { label: 'My Jobs', icon: 'file-text', href: `${rootPath}customer/jobs.html` },
        { label: 'Saved Workers', icon: 'heart', href: `${rootPath}customer/saved-workers.html` },
        { label: 'Messages', icon: 'message-square', href: `${rootPath}messages.html` },
        { label: 'My Profile', icon: 'user', href: `${rootPath}customer/profile.html` }
      ],
      admin: [
        { label: 'Overview', icon: 'layout-dashboard', href: `${adminPrefix}dashboard.html` },
        { label: 'KYC Moderation', icon: 'shield-check', href: `${adminPrefix}kyc-moderation.html`, badge: 'pendingCounterBadge' },
        { label: 'Manage Workers', icon: 'users', href: `${adminPrefix}workers.html` },
        { label: 'Manage Customers', icon: 'user-check', href: `${adminPrefix}customers.html` },
        { label: 'Job Requests', icon: 'file-text', href: `${adminPrefix}jobs.html` },
        { label: 'Content Moderation', icon: 'flag', href: `${adminPrefix}moderation.html` },
        { label: 'Analytics and Reports', icon: 'bar-chart-3', href: `${adminPrefix}analytics.html` }
      ]
    };

    const items = roleMenus[role] || roleMenus.customer;
    const linksHtml = items.map(item => {
      const active = isItemActive(item, currentPath, currentFile, role);
      const badgeHtml = item.badge ? ` <span class="badge badge-pending" id="${item.badge}" style="margin-left:auto;font-size:0.7rem;">0</span>` : '';
      return `<a href="${item.href}" class="sidebar-link ${active ? 'active' : ''}"><i data-lucide="${item.icon}"></i> ${escapeHtml(item.label)}${badgeHtml}</a>`;
    }).join('\n        ');

    sidebarContainer.innerHTML = `
      <div class="sidebar-overlay"></div>
      <aside class="sidebar ${role}">
        <div class="sidebar-header">
          <div class="sidebar-user">
            <div class="avatar avatar-md ${avatarColor}" id="sidebarAvatar">${avatarInnerHtml}</div>
            <div>
              <div class="sidebar-user-name" id="${role === 'admin' ? 'adminUserName' : 'sidebarUserName'}">${escapeHtml(userInfo.name)}</div>
              <div class="sidebar-user-role" id="sidebarUserRole">${escapeHtml(userInfo.roleTitle)}</div>
            </div>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${linksHtml}
        </nav>
        <div class="sidebar-footer">
          <a href="${rootPath}auth/login.html" class="sidebar-link sidebar-logout-btn" id="sidebarLogoutBtn">
            <i data-lucide="log-out"></i> Logout
          </a>
        </div>
      </aside>
    `;
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  initSidebar();
  initLogoutBindings();
  if (role === 'admin') {
    updateAdminBadge();
  }

  // After the shared sidebar and navbar are rendered, check localStorage for jobkade_worker_avatar (fall back to the logged-in user's avatar field)
  updateSharedAvatars(rootPath, userInfo);
}

function updateSharedAvatars(rootPathOverride, userInfoOverride) {
  const currentPath = window.location.pathname.toLowerCase();
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => currentPath.includes(s));
  const rootPath = (rootPathOverride !== undefined) ? rootPathOverride : (isSubfolder ? '../' : '');

  const user = getLoggedInUser();
  const role = (user && user.role) ? String(user.role).toLowerCase() : getPageRole();
  const info = userInfoOverride || getRoleUserInfo(role);

  // Check localStorage for jobkade_worker_avatar (fall back to the logged-in user's avatar field)
  const workerAvatar = localStorage.getItem('jobkade_worker_avatar');
  const photo = workerAvatar || (user ? (user.avatar || user.profile_picture) : null) || info.photo || null;

  const avatarTargets = document.querySelectorAll(
    '#sidebarAvatar, #navAvatar, #adminNavAvatar, #navbar-user-avatar, .avatar-nav, .sidebar.worker .avatar, .sidebar .avatar, .sidebar-user .avatar, .dashboard-nav-right .avatar'
  );

  avatarTargets.forEach(el => {
    if (photo) {
      const resolved = resolveAvatarUrl(photo, rootPath);
      el.innerHTML = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(info.name || 'User')}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${escapeHtml(info.initials)}';">`;
    } else {
      el.textContent = info.initials;
    }
  });
}

function updateSharedUserUI(user) {
  const role = (user && user.role) ? String(user.role).toLowerCase() : getPageRole();
  const info = getRoleUserInfo(role);
  if (user && (user.name || user.full_name)) {
    info.name = user.name || user.full_name;
    const parts = info.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      info.initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      info.initials = parts[0].substring(0, 2).toUpperCase();
    }
  }

  document.querySelectorAll('#sidebarUserName, #adminUserName, .sidebar-user-name').forEach(el => {
    el.textContent = info.name;
  });
  document.querySelectorAll('#sidebarUserRole, .sidebar-user-role').forEach(el => {
    el.textContent = info.roleTitle;
  });

  const currentPath = window.location.pathname.toLowerCase();
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => currentPath.includes(s));
  const rootPath = isSubfolder ? '../' : '';
  updateSharedAvatars(rootPath, info);
}

window.renderSharedComponents = renderSharedComponents;
window.updateSharedUserUI = updateSharedUserUI;
window.updateSharedAvatars = updateSharedAvatars;

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

function formatNotifTime(dateStr) {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    const diffMs = Date.now() - d.getTime();
    if (isNaN(diffMs) || diffMs < 60000) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString();
  } catch (e) {
    return 'Recently';
  }
}

async function fetchUserNotifications() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await apiFetch('notifications.php?action=list');
    if (!res.ok || !res.data || res.data.status !== 'success') return;

    const notifs = res.data.notifications || [];
    renderNotificationsUI(notifs);
  } catch (err) {
    console.warn('Failed to fetch notifications:', err);
  }
}

function renderNotificationsUI(notifs) {
  const unreadCount = notifs.filter(n => !n.is_read || n.is_read === 0).length;

  // Update bell badges across the page
  document.querySelectorAll('.notif-count, .notif-badge').forEach(badge => {
    badge.textContent = String(unreadCount);
    badge.style.display = unreadCount > 0 ? '' : 'none';
  });

  // Update notification dropdown lists
  document.querySelectorAll('.notification-list').forEach(listEl => {
    if (notifs.length === 0) {
      listEl.innerHTML = '<div class="notification-empty" style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No notifications yet.</div>';
      return;
    }

    const itemsHtml = notifs.map(n => {
      const isUnread = !n.is_read || n.is_read === 0;
      let icon = 'bell';
      let iconColor = 'blue';

      if (n.type === 'system') {
        icon = 'check-circle';
        iconColor = 'green';
      } else if (n.type === 'kyc') {
        const isReject = (n.title && n.title.toLowerCase().includes('reject')) || (n.message && n.message.toLowerCase().includes('reject'));
        icon = isReject ? 'shield-alert' : 'shield-check';
        iconColor = isReject ? 'orange' : 'green';
      } else if (n.type === 'subscription') {
        icon = 'credit-card';
        iconColor = 'purple';
      }

      return `
        <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${n.id}">
          <div class="notification-item-icon ${iconColor}">
            <i data-lucide="${icon}" width="16" height="16"></i>
          </div>
          <div class="notification-item-content">
            <p style="font-weight: 600; font-size: 0.85rem; margin-bottom: 2px;">${escapeHtml(n.title)}</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px; line-height: 1.35;">${escapeHtml(n.message)}</p>
            <span class="notif-time">${formatNotifTime(n.created_at)}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = itemsHtml;
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function markAllNotificationsAsRead() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await apiFetch('notifications.php?action=read-all', { method: 'POST' });
    if (res.ok && res.data && res.data.status === 'success') {
      document.querySelectorAll('.notif-count, .notif-badge').forEach(badge => {
        badge.textContent = '0';
        badge.style.display = 'none';
      });
      document.querySelectorAll('.notification-item.unread').forEach(item => {
        item.classList.remove('unread');
      });
      if (typeof showToast === 'function') {
        showToast('All notifications marked as read.', 'info');
      }
    }
  } catch (err) {
    console.warn('Failed to mark notifications as read:', err);
  }
}

function initNotifications() {
  const bell = document.querySelector('.notification-bell');
  const dropdown = document.querySelector('.notification-dropdown');
  if (!bell || !dropdown) return;

  bell.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  };

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  document.querySelectorAll('.notification-dropdown a, .notification-dropdown button').forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if (text.includes('mark all') || text.includes('clear')) {
      btn.onclick = async (e) => {
        e.preventDefault();
        await markAllNotificationsAsRead();
      };
    }
  });

  fetchUserNotifications();
}

window.fetchUserNotifications = fetchUserNotifications;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;

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
  document.querySelectorAll('a[href*="login.html"], .nav-logout-btn, .sidebar-logout-btn, #navLogoutBtn, #sidebarLogoutBtn, #logoutBtn, #adminLogoutBtn, #adminHeaderLogoutBtn').forEach(link => {
    if (link.dataset.logoutBound) return;
    if (link.textContent.toLowerCase().includes('logout') || link.classList.contains('nav-logout-btn') || link.classList.contains('sidebar-logout-btn')) {
      link.dataset.logoutBound = 'true';
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
    const userJson = localStorage.getItem('jobkade_user') || localStorage.getItem('jodkade_logged_user');
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
    const photo = user.profile_picture || user.avatar || (user.role === 'worker' ? localStorage.getItem('jobkade_worker_avatar') : null) || null;
    const normalized = {
      id: user.id || user.user_id,
      name: user.name || user.full_name || 'User',
      username: user.username || '',
      email: user.email || '',
      role: (user.role || 'customer').toLowerCase(),
      phone: user.phone || '',
      worker_id: user.worker_id || (user.worker ? user.worker.id : null) || (user.worker_profile ? user.worker_profile.id : null) || null,
      profile_picture: photo,
      avatar: photo,
      loginTime: Date.now()
    };
    localStorage.setItem('jodkade_logged_user', JSON.stringify(normalized));
    localStorage.setItem('jobkade_user', JSON.stringify(normalized));
    if (photo && normalized.role === 'worker') {
      localStorage.setItem('jobkade_worker_avatar', photo);
    }
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

let isLoggingOut = false;
function logoutUser() {
  if (isLoggingOut) return;
  isLoggingOut = true;
  ['jobkade_token', 'jodkade_logged_user', 'jobkade_user', 'jobkade_worker_avatar'].forEach(k => localStorage.removeItem(k));
  showToast('Logged out successfully.', 'info');
  const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => window.location.pathname.toLowerCase().includes(s));
  setTimeout(() => {
    window.location.href = (isSubfolder ? '../' : '') + 'auth/login.html';
  }, 400);
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
  const userPhoto = user?.profile_picture || user?.avatar || (user.role === 'worker' ? localStorage.getItem('jobkade_worker_avatar') : null) || null;
  const navAvatarInner = userPhoto
    ? `<img src="${escapeHtml(resolveAvatarUrl(userPhoto, rel))}" alt="${escapeHtml(firstName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${cfg.initials}';">`
    : cfg.initials;

  if (navAuth) {
    navAuth.innerHTML = `
      <div class="user-nav-profile" style="position:relative;display:flex;align-items:center;gap:10px;">
        <a href="${dashboardPage}" class="btn btn-outline btn-sm" style="display:flex;align-items:center;gap:6px;">
          <i data-lucide="layout-dashboard" width="16" height="16"></i> Dashboard
        </a>
        <div class="user-nav-trigger" id="user-nav-trigger" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-light);border:1px solid var(--border);border-radius:30px;cursor:pointer;">
          <div class="avatar avatar-sm ${cfg.badge}" style="width:28px;height:28px;font-size:0.75rem;">${navAvatarInner}</div>
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

  // Prevent duplicate toasts with the exact same message appearing simultaneously
  const existingSpans = container.querySelectorAll('.toast span:not(.toast-close)');
  for (const span of existingSpans) {
    if (span.textContent.trim() === String(message).trim()) {
      return;
    }
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

async function syncCurrentUserProfile() {
  const token = (typeof getAuthToken === 'function') ? getAuthToken() : (localStorage.getItem('jobkade_token') || '');
  if (!token) return;

  try {
    const isSubfolder = ['/admin/', '/customer/', '/worker/', '/auth/'].some(s => window.location.pathname.toLowerCase().includes(s));
    const rootPath = isSubfolder ? '../' : '';
    const res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data?.user) {
      const u = res.data.user;
      const cached = (typeof getLoggedInUser === 'function') ? (getLoggedInUser() || {}) : {};
      const newPhoto = u.profile_picture || u.avatar || null;
      let changed = false;

      if (newPhoto && cached.profile_picture !== newPhoto) {
        cached.profile_picture = newPhoto;
        cached.avatar = newPhoto;
        changed = true;
      }
      if (u.full_name && cached.name !== u.full_name) {
        cached.name = u.full_name;
        changed = true;
      }
      if (changed) {
        localStorage.setItem('jodkade_logged_user', JSON.stringify(cached));
        localStorage.setItem('jobkade_user', JSON.stringify(cached));
        if (newPhoto && (cached.role || '').toLowerCase() === 'worker') {
          localStorage.setItem('jobkade_worker_avatar', newPhoto);
        }
        updateSharedAvatars(rootPath, cached);
      }
    }
  } catch (e) {
    // Non-blocking sync
  }
}

