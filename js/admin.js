/* ==========================================
   JODKADE — Admin Dashboard JavaScript
   Charts, verification, moderation
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {
  const user = (typeof requireAuth === 'function') ? requireAuth('admin') : null;
  if (!user) return;

  loadAdminStats();
  initAdminCharts();

  if (document.getElementById('manage-workers-tbody')) {
    initManageWorkers();
  }

  // Worker Verification Modal Actions
  let activeWorkerRow = null;

  document.querySelectorAll('.approve-worker-btn, .reject-worker-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      activeWorkerRow = this.closest('tr');
      const isApprove = this.classList.contains('approve-worker-btn');
      const workerName = this.getAttribute('data-worker') || 'this worker';
      const targetElem = document.getElementById(isApprove ? 'approve-worker-name' : 'reject-worker-name');
      if (targetElem) targetElem.textContent = workerName;
      openModal(isApprove ? 'approve-modal' : 'reject-modal');
    });
  });

  document.getElementById('confirm-approve')?.addEventListener('click', () => {
    closeModal('approve-modal');
    showToast('Worker approved successfully!', 'success');
    if (activeWorkerRow) {
      const statusCell = activeWorkerRow.querySelector('.badge');
      if (statusCell) {
        statusCell.className = 'badge badge-verified';
        statusCell.innerHTML = '<i data-lucide="check" width="10" height="10"></i> Verified';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  });

  document.getElementById('confirm-reject')?.addEventListener('click', () => {
    closeModal('reject-modal');
    showToast('Worker verification rejected.', 'error');
    if (activeWorkerRow) {
      const statusCell = activeWorkerRow.querySelector('.badge');
      if (statusCell) {
        statusCell.className = 'badge badge-cancelled';
        statusCell.textContent = 'Rejected';
      }
    }
  });

  // View NIC Document
  document.querySelectorAll('.view-nic-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal('nic-modal'));
  });

  // Moderation Actions
  document.querySelectorAll('.dismiss-report-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const card = this.closest('.report-card');
      if (card) {
        card.style.opacity = '0.5';
        card.style.pointerEvents = 'none';
        showToast('Report dismissed.', 'info');
      }
    });
  });

  document.querySelectorAll('.remove-content-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      openModal('remove-content-modal');
      window.activeReportCard = this.closest('.report-card');
    });
  });

  document.getElementById('confirm-remove-content')?.addEventListener('click', () => {
    closeModal('remove-content-modal');
    showToast('Content removed successfully.', 'success');
    if (window.activeReportCard) window.activeReportCard.remove();
  });

  // Table Search Filtering
  document.querySelectorAll('.table-search').forEach(input => {
    input.addEventListener('input', function () {
      const query = this.value.toLowerCase();
      const table = (this.closest('.table-card') || document).querySelector('.data-table');
      if (!table) return;

      table.querySelectorAll('tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  });
});

/* ==========================================
   Chart Initialization
   ========================================== */
async function initAdminCharts() {
  if (typeof Chart === 'undefined') return;

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { font: { size: 12 }, color: '#9CA3AF' }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 12 }, color: '#9CA3AF' }
      }
    }
  };

  function createChart(id, type, dataConfig, extraOptions = {}) {
    const el = document.getElementById(id);
    if (!el) return null;
    return new Chart(el.getContext('2d'), {
      type,
      data: dataConfig,
      options: Object.assign({}, commonOptions, extraOptions)
    });
  }

  let labels = [];
  let registrationsData = [];
  let jobsData = [];
  let revenueData = [];
  let categoryLabels = [];
  let categoryData = [];

  try {
    const res = await apiFetch('admin.php?action=analytics');
    if (res.ok && res.data?.status === 'success' && res.data?.analytics) {
      const a = res.data.analytics;
      labels = a.labels || [];
      registrationsData = a.worker_registrations || a.registrations || [];
      jobsData = a.job_requests || a.jobs || [];
      revenueData = a.revenue || [];
      categoryLabels = a.categories?.labels || a.category_labels || [];
      categoryData = a.categories?.data || a.category_data || [];
    }
  } catch (err) {
    console.warn('Failed to load admin analytics:', err);
  }

  // 1. Worker Registrations Line Chart
  createChart('registrations-chart', 'line', {
    labels,
    datasets: [{
      label: 'Worker Registrations',
      data: registrationsData,
      borderColor: '#5996FF',
      backgroundColor: 'rgba(89, 150, 255, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#5996FF'
    }]
  });

  // 2. Job Requests Bar Chart
  createChart('jobs-chart', 'bar', {
    labels,
    datasets: [{
      label: 'Job Requests',
      data: jobsData,
      backgroundColor: 'rgba(89, 150, 255, 0.7)',
      borderRadius: 6
    }]
  });

  // 3. Revenue Line Chart
  createChart('revenue-chart', 'line', {
    labels,
    datasets: [{
      label: 'Revenue (Rs.)',
      data: revenueData,
      borderColor: '#66BB6A',
      backgroundColor: 'rgba(102, 187, 106, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#66BB6A'
    }]
  });

  // 4. Category Distribution Doughnut Chart
  const catEl = document.getElementById('category-chart');
  if (catEl) {
    const defaultColors = ['#5996FF', '#66BB6A', '#FFA726', '#AB47BC', '#26A69A', '#EF5350'];
    const bgColors = categoryLabels.map((_, i) => defaultColors[i % defaultColors.length]);
    new Chart(catEl.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: categoryLabels,
        datasets: [{
          data: categoryData,
          backgroundColor: bgColors.length ? bgColors : defaultColors,
          borderWidth: 0,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, padding: 12, usePointStyle: true }
          }
        }
      }
    });
  }
}

/**
 * Load Real Live Stats from Database API
 */
async function loadAdminStats() {
  try {
    const res = await apiFetch('admin.php?action=stats');
    if (res.ok && res.data?.status === 'success') {
      const s = res.data.stats;
      const cards = document.querySelectorAll('.admin-stat-card');
      if (cards.length >= 4) {
        if (s.verified_workers !== undefined) cards[0].querySelector('h3')?.replaceChildren(document.createTextNode(s.verified_workers));
        if (s.total_users !== undefined) cards[1].querySelector('h3')?.replaceChildren(document.createTextNode(s.total_users));
        if (s.pending_kyc !== undefined) cards[2].querySelector('h3')?.replaceChildren(document.createTextNode(s.pending_kyc));
        if (s.total_jobs !== undefined) cards[3].querySelector('h3')?.replaceChildren(document.createTextNode(s.total_jobs));
      }
      if (s.pending_kyc !== undefined) {
        document.querySelectorAll('#pendingCounterBadge').forEach(el => {
          el.textContent = s.pending_kyc;
        });
      }
    }
  } catch (err) {
    console.warn('loadAdminStats error:', err);
  }
}

/* ==========================================
   Admin Manage Workers - Real Backend Integration
   ========================================== */

let adminWorkersList = [];

async function initManageWorkers() {
  const tbody = document.getElementById('manage-workers-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('worker-search-input');
  const catFilter = document.getElementById('worker-category-filter');
  const statusFilter = document.getElementById('worker-status-filter');

  if (searchInput) searchInput.addEventListener('input', filterAndRenderWorkers);
  if (catFilter) catFilter.addEventListener('change', filterAndRenderWorkers);
  if (statusFilter) statusFilter.addEventListener('change', filterAndRenderWorkers);

  await loadManageWorkers();
}

async function loadManageWorkers() {
  const tbody = document.getElementById('manage-workers-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
      <i data-lucide="loader" width="18" height="18" class="spin"></i>
      <span>Loading real worker data...</span>
    </div>
  </td></tr>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const [workersRes, usersRes, paymentsRes, categoriesRes] = await Promise.all([
      apiFetch('workers.php?action=search'),
      apiFetch('admin.php?action=users'),
      apiFetch('admin.php?action=payments'),
      apiFetch('categories.php')
    ]);

    // Populate category filter dropdown dynamically from real categories
    const catSelect = document.getElementById('worker-category-filter');
    if (catSelect && categoriesRes.ok && Array.isArray(categoriesRes.data?.categories)) {
      const currentVal = catSelect.value;
      catSelect.innerHTML = '<option value="">All Categories</option>';
      categoriesRes.data.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catSelect.appendChild(opt);
      });
      catSelect.value = currentVal;
    }

    const workerProfiles = (workersRes.ok && Array.isArray(workersRes.data?.workers)) ? workersRes.data.workers : [];
    const allUsers = (usersRes.ok && Array.isArray(usersRes.data?.users)) ? usersRes.data.users : [];
    const payments = (paymentsRes.ok && Array.isArray(paymentsRes.data?.payments)) ? paymentsRes.data.payments : [];

    // Map subscription payments by worker profile id
    const workerSubMap = {};
    payments.forEach(p => {
      const wid = p.worker_id;
      if (wid && (!workerSubMap[wid] || p.status === 'completed')) {
        workerSubMap[wid] = p.plan_name || 'Active';
      }
    });

    // Map user accounts by ID
    const userMap = {};
    allUsers.forEach(u => {
      userMap[u.id] = u;
    });

    const profileByUserId = {};
    workerProfiles.forEach(wp => {
      if (wp.user_id) profileByUserId[wp.user_id] = wp;
    });

    const unified = [];
    const seenProfileIds = new Set();

    // 1. Add all workers from worker_profiles
    workerProfiles.forEach(wp => {
      seenProfileIds.add(wp.id);
      const u = userMap[wp.user_id] || {};
      const isSuspended = (u.status === 'suspended');

      let displayStatus = 'unverified';
      if (isSuspended) {
        displayStatus = 'suspended';
      } else if (wp.is_verified == 1 || wp.verify_status === 'verified') {
        displayStatus = 'verified';
      } else if (wp.verify_status === 'pending') {
        displayStatus = 'pending';
      }

      const primaryCat = (wp.categories && wp.categories.length > 0) ? wp.categories[0].name : 'General Services';

      unified.push({
        id: wp.id,
        user_id: wp.user_id || u.id,
        name: wp.full_name || u.full_name || wp.username || 'Unnamed Worker',
        phone: wp.phone || u.phone || 'No phone',
        email: wp.email || u.email || '',
        avatar: wp.profile_picture || wp.avatar || u.profile_picture || null,
        category: primaryCat,
        location: wp.address || u.address || 'Colombo',
        rating: (wp.rating_avg !== undefined && wp.rating_avg !== null) ? parseFloat(wp.rating_avg).toFixed(1) : '5.0',
        is_verified: wp.is_verified == 1 || wp.verify_status === 'verified',
        verify_status: wp.verify_status || 'unverified',
        is_suspended: isSuspended,
        display_status: displayStatus,
        subscription: workerSubMap[wp.id] || 'Free'
      });
    });

    // 2. Add any registered workers from users table not in worker_profiles (e.g. newly registered or suspended)
    allUsers.filter(u => u.role === 'worker').forEach(u => {
      if (!profileByUserId[u.id]) {
        const isSuspended = (u.status === 'suspended');
        unified.push({
          id: u.id,
          user_id: u.id,
          name: u.full_name || u.username || 'Unnamed Worker',
          phone: u.phone || 'No phone',
          email: u.email || '',
          avatar: u.profile_picture || null,
          category: 'General Services',
          location: u.address || 'Colombo',
          rating: '5.0',
          is_verified: false,
          verify_status: 'unverified',
          is_suspended: isSuspended,
          display_status: isSuspended ? 'suspended' : 'unverified',
          subscription: 'Free'
        });
      }
    });

    adminWorkersList = unified;
    filterAndRenderWorkers();
  } catch (err) {
    console.error('Error loading workers:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger);">
      Failed to load workers from server. Please refresh the page.
    </td></tr>`;
  }
}

function filterAndRenderWorkers() {
  const tbody = document.getElementById('manage-workers-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('worker-search-input');
  const catFilter = document.getElementById('worker-category-filter');
  const statusFilter = document.getElementById('worker-status-filter');

  const q = (searchInput?.value || '').toLowerCase().trim();
  const selectedCat = (catFilter?.value || '').toLowerCase().trim();
  const selectedStatus = (statusFilter?.value || '').toLowerCase().trim();

  const filtered = adminWorkersList.filter(w => {
    // Search query filter (name, email, phone, location, category)
    if (q) {
      const match = (
        (w.name && w.name.toLowerCase().includes(q)) ||
        (w.email && w.email.toLowerCase().includes(q)) ||
        (w.phone && w.phone.toLowerCase().includes(q)) ||
        (w.location && w.location.toLowerCase().includes(q)) ||
        (w.category && w.category.toLowerCase().includes(q))
      );
      if (!match) return false;
    }

    // Category filter
    if (selectedCat) {
      if (!w.category || !w.category.toLowerCase().includes(selectedCat)) {
        return false;
      }
    }

    // Status filter
    if (selectedStatus) {
      if (w.display_status.toLowerCase() !== selectedStatus) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
      No workers found matching your filter criteria.
    </td></tr>`;
    return;
  }

  const avatarColors = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-orange', 'avatar-teal'];

  tbody.innerHTML = filtered.map(w => {
    const colorClass = avatarColors[Math.abs(w.id || 0) % avatarColors.length];
    const nameParts = (w.name || 'WK').trim().split(/\s+/);
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : (nameParts[0] ? nameParts[0].substring(0, 2).toUpperCase() : 'WK');

    const avatarHtml = w.avatar
      ? `<img src="${(typeof resolveAvatarUrl === 'function' ? resolveAvatarUrl(w.avatar, '../') : '../' + w.avatar)}" class="avatar avatar-sm" style="object-fit:cover;border-radius:50%;width:36px;height:36px;" alt="${escapeHtml(w.name)}">`
      : `<div class="avatar avatar-sm ${colorClass}" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:50%;">${initials}</div>`;

    // Verification badge
    let verifyBadgeHtml = '';
    if (w.is_suspended) {
      verifyBadgeHtml = `<span class="badge badge-cancelled">Suspended</span>`;
    } else if (w.display_status === 'verified') {
      verifyBadgeHtml = `<span class="badge badge-verified"><i data-lucide="check" width="10" height="10"></i> Verified</span>`;
    } else if (w.display_status === 'pending') {
      verifyBadgeHtml = `<span class="badge badge-pending"><i data-lucide="clock" width="10" height="10"></i> Pending</span>`;
    } else {
      verifyBadgeHtml = `<span class="badge badge-cancelled">Unverified</span>`;
    }

    // Subscription badge
    const subBadgeHtml = (w.subscription && w.subscription !== 'Free')
      ? `<span class="badge badge-completed">${escapeHtml(w.subscription)}</span>`
      : `<span class="badge" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">Free</span>`;

    const suspendBtn = w.is_suspended
      ? `<button class="btn btn-success btn-sm" onclick="toggleAdminWorkerStatus(${w.user_id}, 'active', '${escapeJs(w.name)}')">Activate</button>`
      : `<button class="btn btn-danger btn-sm" onclick="toggleAdminWorkerStatus(${w.user_id}, 'suspended', '${escapeJs(w.name)}')">Suspend</button>`;

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${avatarHtml}
            <div>
              <strong>${escapeHtml(w.name)}</strong><br>
              <span class="text-sm text-secondary">${escapeHtml(w.phone)}</span>
            </div>
          </div>
        </td>
        <td>${escapeHtml(w.category)}</td>
        <td>${escapeHtml(w.location)}</td>
        <td><i data-lucide="star" width="12" height="12" style="color:#F59E0B;display:inline;vertical-align:middle;"></i> ${escapeHtml(w.rating)}</td>
        <td>${verifyBadgeHtml}</td>
        <td>${subBadgeHtml}</td>
        <td>
          <div class="btn-group">
            <a href="../worker-profile.html?id=${w.id}" class="btn btn-outline btn-sm">View Profile</a>
            ${suspendBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleAdminWorkerStatus(userId, newStatus, workerName) {
  const actionLabel = newStatus === 'suspended' ? 'suspend' : 'activate';
  if (!confirm(`Are you sure you want to ${actionLabel} ${workerName}?`)) return;

  try {
    const res = await apiFetch('admin.php?action=toggle-user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, status: newStatus })
    });
    if (res.ok && res.data?.status === 'success') {
      showToast(`Worker ${actionLabel}ed successfully.`, 'success');
      loadManageWorkers();
    } else {
      showToast(res.data?.message || `Failed to ${actionLabel} worker.`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
