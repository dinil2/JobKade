function purgeAnalyticsLinks() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('a[href*="analytics.html"]').forEach(function(el) {
    el.remove();
  });
}
purgeAnalyticsLinks();
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', purgeAnalyticsLinks);
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(purgeAnalyticsLinks).observe(document.documentElement, { childList: true, subtree: true });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const user = (typeof requireAuth === 'function') ? requireAuth('admin') : null;
  if (!user) return;

  loadAdminStats();

  if (document.getElementById('worker-earnings-tbody')) {
    initAdminDashboardRebuild();
  } else if (document.getElementById('monthly-breakdown-tbody') ||
      document.getElementById('worker-performance-tbody') ||
      document.getElementById('stat-total-workers') ||
      window.location.pathname.includes('analytics.html')) {
    loadAnalyticsTables();
  } else {
    initAdminCharts();
  }

  if (document.getElementById('manage-workers-tbody')) {
    initManageWorkers();
  }

  if (document.getElementById('manage-customers-tbody')) {
    initManageCustomers();
  }

  if (document.getElementById('admin-jobs-tbody')) {
    initAdminJobs();
  }

  if (document.getElementById('moderationTabs') || document.getElementById('reportsContainer')) {
    initAdminModeration();
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
   Analytics: Numbers-Only Tables & Summary Cards
   ========================================== */
function formatLKR(amount) {
  const num = Number(amount) || 0;
  return 'Rs. ' + num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPlainNumber(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ==========================================
   Admin Dashboard Rebuild: Focused Overview with Charts & Auto-Refresh
   ========================================== */
let dashboardCountdownTimer = null;
let dashboardCountdownSec = 30;
let lastDashboardAnalytics = null;
let workerEarningsChartInstance = null;
let monthlyRevenueChartInstance = null;

function stopDashboardAutoRefresh() {
  if (dashboardCountdownTimer) {
    clearInterval(dashboardCountdownTimer);
    dashboardCountdownTimer = null;
  }
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh();
  dashboardCountdownSec = 30;
  updateCountdownBadge();

  dashboardCountdownTimer = setInterval(() => {
    dashboardCountdownSec--;
    if (dashboardCountdownSec <= 0) {
      dashboardCountdownSec = 30;
      fetchAndUpdateDashboard(false);
    }
    updateCountdownBadge();
  }, 1000);
}

function updateCountdownBadge() {
  const el = document.getElementById('refresh-status-text');
  if (el) {
    el.textContent = `Auto-refresh: ${dashboardCountdownSec}s`;
  }
}

function renderInitialError(msg) {
  const workerTbody = document.getElementById('worker-earnings-tbody');
  const customerTbody = document.getElementById('customer-transactions-tbody');
  if (workerTbody) {
    workerTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--error);">${escapeHtml(msg)}</td></tr>`;
  }
  if (customerTbody) {
    customerTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--error);">${escapeHtml(msg)}</td></tr>`;
  }
}

async function fetchAndUpdateDashboard(isManual = false) {
  const refreshBtn = document.getElementById('btn-refresh-analytics');
  const refreshIcon = document.getElementById('refresh-icon');

  if (isManual && refreshIcon) {
    refreshIcon.classList.add('spin-anim');
    if (refreshBtn) refreshBtn.disabled = true;
  }

  try {
    const res = await apiFetch('admin.php?action=analytics');
    if (!res.ok || res.data?.status !== 'success' || !res.data?.analytics) {
      console.warn('Analytics fetch failed; retaining existing dashboard data:', res);
      if (!lastDashboardAnalytics) {
        renderInitialError(res.data?.message || 'Failed to load analytics data.');
      }
      return;
    }

    const a = res.data.analytics;
    lastDashboardAnalytics = a;

    // 1. Update KPI Numbers
    updateDashboardKPIs(a);

    // 2. Worker Earnings table (primary) + Bar chart beside it
    updateWorkerEarningsSection(a.worker_performance || []);

    // 3. Customer Transactions table + Line chart beside it
    updateCustomerTransactionsSection(a.customer_activity || []);

    // 4. Monthly Revenue Line Chart (Sep and Oct 2026 only, 2 points)
    updateMonthlyRevenueChartSection(a.monthly_breakdown || []);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  } catch (err) {
    console.warn('Dashboard auto-refresh error; retaining existing data:', err);
    if (!lastDashboardAnalytics) {
      renderInitialError('Failed to load analytics.');
    }
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('spin-anim');
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function updateDashboardKPIs(a) {
  const k = a.kpis || a;
  const totalCustomersEl = document.getElementById('stat-total-customers');
  const totalWorkersEl = document.getElementById('stat-total-workers');
  const jobsPostedEl = document.getElementById('stat-jobs-posted');
  const jobsCompletedEl = document.getElementById('stat-jobs-completed');
  const platformRevEl = document.getElementById('stat-platform-revenue');
  const commissionEl = document.getElementById('stat-commission-earned');

  if (totalCustomersEl) totalCustomersEl.textContent = Number(k.total_customers || 0).toLocaleString();
  if (totalWorkersEl) totalWorkersEl.textContent = Number(k.total_workers || 0).toLocaleString();
  if (jobsPostedEl) jobsPostedEl.textContent = Number(k.total_jobs_posted || 0).toLocaleString();
  if (jobsCompletedEl) jobsCompletedEl.textContent = Number(k.total_jobs_completed || 0).toLocaleString();
  if (platformRevEl) platformRevEl.textContent = formatLKR(k.platform_revenue || 0);
  if (commissionEl) commissionEl.textContent = formatLKR(k.commission_earned || 0);
}

function updateWorkerEarningsSection(workers) {
  const tbody = document.getElementById('worker-earnings-tbody');
  const canvas = document.getElementById('worker-earnings-chart');
  const emptyEl = document.getElementById('worker-chart-empty');

  // Sort descending by total earnings, top 3
  const sorted = [...workers].sort((a, b) => (Number(b.total_earnings) || 0) - (Number(a.total_earnings) || 0));
  const top3 = sorted.slice(0, 3);

  // 1. Worker Earnings table (primary source of truth)
  if (tbody) {
    if (top3.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
    } else {
      tbody.innerHTML = top3.map(w => `
        <tr>
          <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(w.worker_name || 'Worker')}</td>
          <td style="text-align:right; font-weight:600;">${Number(w.jobs_completed || 0).toLocaleString()}</td>
          <td style="text-align:right;">${formatPlainNumber(w.earnings_this_month || 0)}</td>
          <td style="text-align:right; font-weight:700; color:var(--primary);">${formatPlainNumber(w.total_earnings || 0)}</td>
        </tr>
      `).join('');
    }
  }

  // 2. Bar chart: Earnings per Worker (top 3 workers, total earnings in Rs.)
  if (canvas && typeof Chart !== 'undefined') {
    if (top3.length === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'flex';
      if (workerEarningsChartInstance) {
        workerEarningsChartInstance.destroy();
        workerEarningsChartInstance = null;
      }
    } else {
      canvas.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';

      const labels = top3.map(w => {
        const full = w.worker_name || 'Worker';
        return full.split('(')[0].trim();
      });
      const data = top3.map(w => Number(w.total_earnings || 0));

      if (workerEarningsChartInstance) {
        workerEarningsChartInstance.data.labels = labels;
        workerEarningsChartInstance.data.datasets[0].data = data;
        workerEarningsChartInstance.update();
      } else {
        const ctx = canvas.getContext('2d');
        workerEarningsChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Total Earnings (Rs.)',
              data: data,
              backgroundColor: 'rgba(59, 130, 246, 0.75)',
              borderColor: '#2563eb',
              borderWidth: 1,
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            events: [], // Display-only: no clicks, filters, or actions wired into them
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(v) { return 'Rs. ' + Number(v).toLocaleString(); },
                  font: { size: 11 },
                  color: '#6b7280'
                },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              x: {
                ticks: {
                  font: { size: 11, weight: '600' },
                  color: '#374151'
                },
                grid: { display: false }
              }
            }
          }
        });
      }
    }
  }
}

function updateCustomerTransactionsSection(customers) {
  const tbody = document.getElementById('customer-transactions-tbody');

  // Sort descending by total spent, top 3
  const sorted = [...customers].sort((a, b) => (Number(b.total_spent) || 0) - (Number(a.total_spent) || 0));
  const top3 = sorted.slice(0, 3);

  // Customer Transactions table: Customer | Jobs Posted | Transactions | Total Spent (Rs.)
  if (tbody) {
    if (top3.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
    } else {
      tbody.innerHTML = top3.map(c => `
        <tr>
          <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(c.customer_name || 'Customer')}</td>
          <td style="text-align:right; font-weight:600;">${Number(c.jobs_posted || 0).toLocaleString()}</td>
          <td style="text-align:right; font-weight:600; color:var(--success);">${Number(c.transactions || 0).toLocaleString()}</td>
          <td style="text-align:right; font-weight:700; color:var(--primary);">${formatPlainNumber(c.total_spent || 0)}</td>
        </tr>
      `).join('');
    }
  }
}

function updateMonthlyRevenueChartSection(monthly) {
  const canvas = document.getElementById('monthly-revenue-chart');
  const emptyEl = document.getElementById('revenue-chart-empty');

  // Line chart: Monthly Revenue for September and October 2026 only (2 points)
  let points = monthly.filter(m => m.month_key === '2026-09' || m.month_key === '2026-10');
  if (points.length === 0 && monthly.length > 0) {
    points = monthly.slice(0, 2);
  }

  if (canvas && typeof Chart !== 'undefined') {
    if (points.length === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'flex';
      if (monthlyRevenueChartInstance) {
        monthlyRevenueChartInstance.destroy();
        monthlyRevenueChartInstance = null;
      }
    } else {
      canvas.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';

      const labels = points.map(m => m.month || (m.month_key === '2026-09' ? 'September 2026' : 'October 2026'));
      const data = points.map(m => Number(m.revenue || 0));

      if (monthlyRevenueChartInstance) {
        monthlyRevenueChartInstance.data.labels = labels;
        monthlyRevenueChartInstance.data.datasets[0].data = data;
        monthlyRevenueChartInstance.update();
      } else {
        const ctx = canvas.getContext('2d');
        monthlyRevenueChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Monthly Revenue (Rs.)',
              data: data,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              fill: true,
              tension: 0.3,
              borderWidth: 3,
              pointRadius: 6,
              pointBackgroundColor: '#10b981',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            events: [], // Display-only: no clicks, filters, or actions wired into them
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(v) { return 'Rs. ' + Number(v).toLocaleString(); },
                  font: { size: 11 },
                  color: '#6b7280'
                },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              x: {
                ticks: {
                  font: { size: 11, weight: '600' },
                  color: '#374151'
                },
                grid: { display: false }
              }
            }
          }
        });
      }
    }
  }
}

function initAdminDashboardRebuild() {
  // Initial load
  fetchAndUpdateDashboard(false);

  // Start 30-second recurring timer
  startDashboardAutoRefresh();

  // Manual refresh button immediately updates and resets 30s timer
  const refreshBtn = document.getElementById('btn-refresh-analytics');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      fetchAndUpdateDashboard(true);
      startDashboardAutoRefresh();
    });
  }

  // Stop 30-second timer when admin leaves dashboard
  window.addEventListener('beforeunload', stopDashboardAutoRefresh);
  window.addEventListener('pagehide', stopDashboardAutoRefresh);
}

async function loadAnalyticsTables() {
  const monthlyTbody = document.getElementById('monthly-breakdown-tbody');
  const workerTbody = document.getElementById('worker-performance-tbody');
  const customerTbody = document.getElementById('customer-activity-tbody');
  const categoryTbody = document.getElementById('category-ranking-tbody');
  const recentTbody = document.getElementById('recent-activity-tbody');

  // Return early if not on analytics page
  if (!workerTbody && !customerTbody && !monthlyTbody && !categoryTbody && !recentTbody) return;

  try {
    const res = await apiFetch('admin.php?action=analytics');
    if (!res.ok || res.data?.status !== 'success') {
      const isAuthErr = (res.status === 401 || res.status === 403);
      const errMsg = isAuthErr
        ? 'Administrator sign-in required. <a href="../auth/login.html?redirect=admin/dashboard.html" style="color:var(--primary); font-weight:600; text-decoration:underline;">Click here to log in as Admin (admin@jobkade.lk)</a>'
        : (res.data?.message || 'Failed to load analytics data.');
      if (monthlyTbody) monthlyTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--error);">${errMsg}</td></tr>`;
      if (workerTbody) workerTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2.5rem; color:var(--error);">${errMsg}</td></tr>`;
      if (customerTbody) customerTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">${errMsg}</td></tr>`;
      if (categoryTbody) categoryTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">${errMsg}</td></tr>`;
      if (recentTbody) recentTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">${errMsg}</td></tr>`;
      return;
    }

    const a = res.data.analytics || {};

    // 1. Row of 6 KPI Number Cards
    const k = a.kpis || a;
    const totalWorkersEl = document.getElementById('stat-total-workers');
    const totalCustomersEl = document.getElementById('stat-total-customers');
    const jobsPostedEl = document.getElementById('stat-jobs-posted');
    const jobsCompletedEl = document.getElementById('stat-jobs-completed');
    const platformRevEl = document.getElementById('stat-platform-revenue');
    const commissionEl = document.getElementById('stat-commission-earned');

    if (totalWorkersEl) totalWorkersEl.textContent = Number(k.total_workers || 0).toLocaleString();
    if (totalCustomersEl) totalCustomersEl.textContent = Number(k.total_customers || 0).toLocaleString();
    if (jobsPostedEl) jobsPostedEl.textContent = Number(k.total_jobs_posted || 0).toLocaleString();
    if (jobsCompletedEl) jobsCompletedEl.textContent = Number(k.total_jobs_completed || 0).toLocaleString();
    if (platformRevEl) platformRevEl.textContent = formatLKR(k.platform_revenue || 0);
    if (commissionEl) commissionEl.textContent = formatLKR(k.commission_earned || 0);

    // 2. Monthly Breakdown Table (Month | Jobs Posted | Jobs Completed | Revenue (Rs.) | Commission (Rs.))
    const monthly = Array.isArray(a.monthly_breakdown) ? a.monthly_breakdown : [];
    if (monthlyTbody) {
      if (!monthly.length) {
        monthlyTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
      } else {
        monthlyTbody.innerHTML = monthly.map(m => `
          <tr>
            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(m.month || '-')}</td>
            <td style="text-align:right; font-weight:600;">${Number(m.jobs_posted || 0).toLocaleString()}</td>
            <td style="text-align:right; font-weight:600; color:var(--success);">${Number(m.jobs_completed || 0).toLocaleString()}</td>
            <td style="text-align:right;">${formatPlainNumber(m.revenue || 0)}</td>
            <td style="text-align:right; font-weight:700; color:var(--primary);">${formatPlainNumber(m.commission || 0)}</td>
          </tr>
        `).join('');
      }
    }

    // 3. Worker Performance Table (Worker | Jobs Completed | Earnings This Month (Rs.) | Total Earnings (Rs.))
    const workers = Array.isArray(a.worker_performance) ? a.worker_performance : [];
    if (workerTbody) {
      if (!workers.length) {
        workerTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
      } else {
        workerTbody.innerHTML = workers.map(w => `
          <tr>
            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(w.worker_name || 'Worker')}</td>
            <td style="text-align:right; font-weight:600;">${Number(w.jobs_completed || 0).toLocaleString()}</td>
            <td style="text-align:right;">${formatPlainNumber(w.earnings_this_month || 0)}</td>
            <td style="text-align:right; font-weight:700; color:var(--primary);">${formatPlainNumber(w.total_earnings || 0)}</td>
          </tr>
        `).join('');
      }
    }

    // 4. Customer Activity Table (Customer | Jobs Posted | Jobs Completed)
    const customers = Array.isArray(a.customer_activity) ? a.customer_activity : [];
    if (customerTbody) {
      if (!customers.length) {
        customerTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
      } else {
        customerTbody.innerHTML = customers.map(c => `
          <tr>
            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(c.customer_name || 'Customer')}</td>
            <td style="text-align:right; font-weight:600;">${Number(c.jobs_posted || 0).toLocaleString()}</td>
            <td style="text-align:right; font-weight:600; color:var(--success);">${Number(c.jobs_completed || 0).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }

    // 5. Workers by Category Ranked List (Rank | Category Name | Worker Count)
    const categories = Array.isArray(a.category_ranking) ? a.category_ranking : [];
    if (categoryTbody) {
      if (!categories.length) {
        categoryTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
      } else {
        categoryTbody.innerHTML = categories.map((cat, idx) => `
          <tr>
            <td><span class="badge ${idx === 0 ? 'badge-completed' : (idx < 3 ? 'badge-verified' : 'badge-pending')}" style="font-weight:700;">#${idx + 1}</span></td>
            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(cat.category_name || '-')}</td>
            <td style="text-align:right; font-weight:700; color:var(--primary);">${Number(cat.worker_count || 0).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    }

    // 6. Recent Activity List (latest 10 events with timestamps)
    const events = Array.isArray(a.recent_activity) ? a.recent_activity : [];
    if (recentTbody) {
      if (!events.length) {
        recentTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.95rem;">No data yet</td></tr>`;
      } else {
        recentTbody.innerHTML = events.map(ev => {
          let badgeHtml = '<span class="badge badge-pending">Event</span>';
          if (ev.type === 'job_request') {
            badgeHtml = '<span class="badge badge-pending"><i data-lucide="clipboard-list" width="12" height="12"></i> Job</span>';
          } else if (ev.type === 'paid_invoice') {
            badgeHtml = '<span class="badge badge-verified"><i data-lucide="check" width="12" height="12"></i> Paid</span>';
          } else if (ev.type === 'registration') {
            badgeHtml = '<span class="badge badge-completed"><i data-lucide="user" width="12" height="12"></i> User</span>';
          }

          return `
            <tr>
              <td>${badgeHtml}</td>
              <td style="color:var(--text-primary); font-size:0.9rem; font-weight:500;">${escapeHtml(ev.description || '-')}</td>
              <td style="text-align:right; font-size:0.85rem; color:var(--text-secondary); white-space:nowrap;">${escapeHtml(ev.timestamp || '-')}</td>
            </tr>
          `;
        }).join('');
      }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();

  } catch (err) {
    console.error('Failed to load analytics tables:', err);
    if (monthlyTbody) monthlyTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--error);">Failed to load monthly breakdown data.</td></tr>`;
    if (workerTbody) workerTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2.5rem; color:var(--error);">Failed to load worker performance data.</td></tr>`;
    if (customerTbody) customerTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">Failed to load customer activity data.</td></tr>`;
    if (categoryTbody) categoryTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">Failed to load category ranking data.</td></tr>`;
    if (recentTbody) recentTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2.5rem; color:var(--error);">Failed to load recent activity data.</td></tr>`;
  }
}

/* ==========================================
   Chart Initialization
   ========================================== */
async function initAdminCharts() {
  if (typeof Chart === 'undefined') return;
  if (window.location.pathname.includes('analytics.html')) return;

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
      if (!document.getElementById('worker-earnings-tbody')) {
        const cards = document.querySelectorAll('.admin-stat-card');
        if (cards.length >= 4) {
          if (s.verified_workers !== undefined) cards[0].querySelector('h3')?.replaceChildren(document.createTextNode(s.verified_workers));
          if (s.total_users !== undefined) cards[1].querySelector('h3')?.replaceChildren(document.createTextNode(s.total_users));
          if (s.pending_kyc !== undefined) cards[2].querySelector('h3')?.replaceChildren(document.createTextNode(s.pending_kyc));
          if (s.total_jobs !== undefined) cards[3].querySelector('h3')?.replaceChildren(document.createTextNode(s.total_jobs));
        }
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
            <button type="button" class="btn btn-outline btn-sm btn-view-worker" data-worker-id="${w.id || w.user_id || 0}" onclick="openWorkerSummaryModal('${w.id || w.user_id || 0}')" title="View Worker Details" style="display:inline-flex;align-items:center;gap:4px;">
              <i data-lucide="eye" width="13" height="13"></i>
              <span>View</span>
            </button>
            <a href="../worker-profile.html?id=${w.id}" class="btn btn-outline btn-sm">View Profile</a>
            ${suspendBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleAdminUserStatus(userId, newStatus, userName) {
  const actionLabel = newStatus === 'suspended' ? 'suspend' : 'activate';
  if (!confirm(`Are you sure you want to ${actionLabel} ${userName}?`)) return;

  try {
    const res = await apiFetch('admin.php?action=toggle-user', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, status: newStatus })
    });
    if (res.ok && res.data?.status === 'success') {
      showToast(`User ${actionLabel}ed successfully.`, 'success');
      if (document.getElementById('manage-workers-tbody')) loadManageWorkers();
      if (document.getElementById('manage-customers-tbody')) loadManageCustomers();
    } else {
      showToast(res.data?.message || `Failed to ${actionLabel} user.`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function toggleAdminWorkerStatus(userId, newStatus, workerName) {
  return toggleAdminUserStatus(userId, newStatus, workerName);
}

/* ==========================================
   Admin Manage Customers - Real Backend Integration
   ========================================== */
let adminCustomersList = [];

async function initManageCustomers() {
  const tbody = document.getElementById('manage-customers-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('customer-search-input');
  const statusFilter = document.getElementById('customer-status-filter');

  if (searchInput) searchInput.addEventListener('input', filterAndRenderCustomers);
  if (statusFilter) statusFilter.addEventListener('change', filterAndRenderCustomers);

  await loadManageCustomers();
}

async function loadManageCustomers() {
  const tbody = document.getElementById('manage-customers-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
      <i data-lucide="loader" width="18" height="18" class="spin"></i>
      <span>Loading registered customers...</span>
    </div>
  </td></tr>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const [usersRes, analyticsRes] = await Promise.all([
      apiFetch('admin.php?action=users'),
      apiFetch('admin.php?action=analytics')
    ]);

    const allUsers = (usersRes.ok && usersRes.data?.status === 'success' && Array.isArray(usersRes.data.users))
      ? usersRes.data.users
      : [];

    const activityMap = {};
    if (analyticsRes.ok && analyticsRes.data?.status === 'success' && Array.isArray(analyticsRes.data.analytics?.customer_activity)) {
      analyticsRes.data.analytics.customer_activity.forEach(c => {
        activityMap[c.customer_id] = {
          jobs_posted: c.jobs_posted,
          jobs_completed: c.jobs_completed
        };
      });
    }

    const customers = allUsers.filter(u => u.role === 'customer');

    adminCustomersList = customers.map(u => {
      const isSuspended = (u.status === 'suspended');
      const act = activityMap[u.id] || { jobs_posted: 0, jobs_completed: 0 };
      let joinedDate = '-';
      if (u.created_at) {
        try {
          joinedDate = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (_) {
          joinedDate = u.created_at;
        }
      }

      return {
        id: u.id,
        name: u.full_name || u.username || 'Customer',
        email: u.email || '',
        phone: u.phone || 'No phone',
        location: u.address || 'Colombo',
        avatar: u.profile_picture || null,
        status: isSuspended ? 'suspended' : 'active',
        is_suspended: isSuspended,
        joined_date: joinedDate,
        jobs_posted: act.jobs_posted,
        jobs_completed: act.jobs_completed
      };
    });

    filterAndRenderCustomers();
  } catch (err) {
    console.error('Error loading customers:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--danger);">
      Failed to load customers from server. Please refresh the page.
    </td></tr>`;
  }
}

function filterAndRenderCustomers() {
  const tbody = document.getElementById('manage-customers-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('customer-search-input');
  const statusFilter = document.getElementById('customer-status-filter');

  const q = (searchInput?.value || '').toLowerCase().trim();
  const selectedStatus = (statusFilter?.value || '').toLowerCase().trim();

  const filtered = adminCustomersList.filter(c => {
    if (q) {
      const match = (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q))
      );
      if (!match) return false;
    }

    if (selectedStatus && c.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
      No customers found matching your filter criteria.
    </td></tr>`;
    return;
  }

  const avatarColors = ['avatar-blue', 'avatar-purple', 'avatar-teal', 'avatar-green', 'avatar-orange'];

  tbody.innerHTML = filtered.map(c => {
    const colorClass = avatarColors[Math.abs(c.id || 0) % avatarColors.length];
    const nameParts = (c.name || 'CU').trim().split(/\s+/);
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : (nameParts[0] ? nameParts[0].substring(0, 2).toUpperCase() : 'CU');

    const avatarHtml = c.avatar
      ? `<img src="${(typeof resolveAvatarUrl === 'function' ? resolveAvatarUrl(c.avatar, '../') : '../' + c.avatar)}" class="avatar avatar-sm" style="object-fit:cover;border-radius:50%;width:36px;height:36px;" alt="${escapeHtml(c.name)}">`
      : `<div class="avatar avatar-sm ${colorClass}" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:50%;">${initials}</div>`;

    const statusBadge = c.is_suspended
      ? `<span class="badge badge-cancelled">Suspended</span>`
      : `<span class="badge badge-completed">Active</span>`;

    const actionBtn = c.is_suspended
      ? `<button class="btn btn-success btn-sm" onclick="toggleAdminUserStatus(${c.id}, 'active', '${escapeJs(c.name)}')">Activate</button>`
      : `<button class="btn btn-danger btn-sm" onclick="toggleAdminUserStatus(${c.id}, 'suspended', '${escapeJs(c.name)}')">Suspend</button>`;

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${avatarHtml}
            <div>
              <strong>${escapeHtml(c.name)}</strong><br>
              <span class="text-sm text-secondary">${escapeHtml(c.email)}</span>
            </div>
          </div>
        </td>
        <td>${escapeHtml(c.phone)}</td>
        <td>${escapeHtml(c.location)}</td>
        <td style="text-align:right; font-weight:600;">${Number(c.jobs_posted).toLocaleString()}</td>
        <td style="text-align:right; font-weight:600; color:var(--success);">${Number(c.jobs_completed).toLocaleString()}</td>
        <td>${escapeHtml(c.joined_date)}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="btn-group">
            ${actionBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
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

/**
 * Worker Summary Popup Modal (Manage Workers)
 */
function ensureWorkerSummaryModal() {
  if (document.getElementById('worker-summary-modal')) return document.getElementById('worker-summary-modal');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
  <div class="modal-overlay" id="worker-summary-modal" role="dialog" aria-modal="true" aria-labelledby="wmodal-name" onclick="if(event.target===this)closeWorkerSummaryModal()" style="z-index:2050;">
    <div class="modal" style="max-width:540px; width:100%; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1); margin:auto;">
      <div class="modal-header" style="padding:16px 20px; border-bottom:1px solid var(--border, #e2e8f0); display:flex; align-items:center; justify-content:space-between; background:#f8fafc;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div id="wmodal-avatar-container">
            <div id="wmodal-avatar" class="avatar avatar-md avatar-blue">WK</div>
          </div>
          <div>
            <h3 id="wmodal-name" style="margin:0; font-size:1.1rem; font-weight:700; color:var(--text-primary, #0f172a);">Worker Summary</h3>
            <span id="wmodal-subtitle" style="font-size:0.8rem; color:var(--text-secondary, #64748b);">Worker ID: -</span>
          </div>
        </div>
        <button type="button" class="btn-close modal-close" id="wmodal-close-btn" onclick="closeWorkerSummaryModal()" data-dismiss="modal" aria-label="Close" style="background:none; border:none; color:#64748b; font-size:1.5rem; cursor:pointer; line-height:1; padding:4px 8px; border-radius:6px;">&times;</button>
      </div>

      <div class="modal-body" style="padding:20px; max-height:calc(85vh - 120px); overflow-y:auto;">
        <div id="wmodal-loading" style="text-align:center; padding:36px 20px; color:var(--text-secondary, #64748b);">
          <i data-lucide="loader" width="28" height="28" class="spin"></i>
          <p style="margin:10px 0 0; font-size:0.88rem;">Loading worker details...</p>
        </div>

        <div id="wmodal-content" style="display:none;">
          <div style="margin-bottom:20px;">
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; color:#059669; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="wallet" width="15" height="15"></i> Earnings (Paid Invoices)
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px;">
              <div>
                <span style="font-size:0.72rem; color:#166534; display:block; margin-bottom:2px;">Total Earnings</span>
                <strong id="wmodal-total-earnings" style="font-size:1rem; color:#15803d; font-weight:700;">Rs. 0.00</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#166534; display:block; margin-bottom:2px;">This Month</span>
                <strong id="wmodal-monthly-earnings" style="font-size:1rem; color:#15803d; font-weight:700;">Rs. 0.00</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#166534; display:block; margin-bottom:2px;">Jobs Completed</span>
                <strong id="wmodal-jobs-completed" style="font-size:1rem; color:#15803d; font-weight:700;">0</strong>
              </div>
            </div>
          </div>

          <div style="margin-bottom:20px;">
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; color:#7c3aed; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="credit-card" width="15" height="15"></i> Subscription Details
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:14px;">
              <div>
                <span style="font-size:0.72rem; color:#6b21a8; display:block; margin-bottom:2px;">Current Plan</span>
                <strong id="wmodal-plan-name" style="font-size:0.9rem; color:#581c87;">None</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#6b21a8; display:block; margin-bottom:2px;">Subscription Status</span>
                <span id="wmodal-sub-status" class="badge" style="background:#e9d5ff; color:#581c87;">None</span>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#6b21a8; display:block; margin-bottom:2px;">Total Paid</span>
                <strong id="wmodal-sub-total" style="font-size:0.9rem; color:#581c87;">Rs. 0.00</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#6b21a8; display:block; margin-bottom:2px;">Last Payment Date</span>
                <strong id="wmodal-sub-date" style="font-size:0.9rem; color:#581c87;">None</strong>
              </div>
            </div>
          </div>

          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; color:#0284c7; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="user" width="15" height="15"></i> Profile Details
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px;">
              <div>
                <span style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">Category</span>
                <strong id="wmodal-category" style="font-size:0.88rem; color:#1e293b;">None</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">Location / District</span>
                <strong id="wmodal-location" style="font-size:0.88rem; color:#1e293b;">None</strong>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">Rating</span>
                <span style="font-size:0.88rem; font-weight:700; color:#1e293b; display:inline-flex; align-items:center; gap:4px;">
                  <i data-lucide="star" width="13" height="13" style="color:#F59E0B; fill:#F59E0B;"></i>
                  <span id="wmodal-rating">5.0</span>
                </span>
              </div>
              <div>
                <span style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">Verification Status</span>
                <span id="wmodal-verify-status" class="badge">None</span>
              </div>
              <div style="grid-column:span 2;">
                <span style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">Phone Number</span>
                <strong id="wmodal-phone" style="font-size:0.88rem; color:#1e293b;">None</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="padding:12px 20px; border-top:1px solid var(--border, #e2e8f0); display:flex; justify-content:flex-end; background:#f8fafc;">
        <button type="button" class="btn btn-secondary btn-sm modal-close" id="wmodal-close-footer-btn" onclick="closeWorkerSummaryModal()" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>`;
  const el = wrapper.firstElementChild;
  document.body.appendChild(el);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  return el;
}

async function openWorkerSummaryModal(workerId) {
  const modal = ensureWorkerSummaryModal();
  if (!modal) return;

  const loadingEl = document.getElementById('wmodal-loading');
  const contentEl = document.getElementById('wmodal-content');

  // Show modal and loading state
  modal.classList.add('active');
  modal.style.display = 'flex';
  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';

  // Helper to safely set text content
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (text !== null && text !== undefined && String(text).trim() !== '') ? text : 'None';
  };

  // Safe default values so modal is never blank
  setText('wmodal-name', 'Loading Worker...');
  setText('wmodal-subtitle', `Worker ID: #${workerId}`);
  setText('wmodal-total-earnings', 'Rs. 0.00');
  setText('wmodal-monthly-earnings', 'Rs. 0.00');
  setText('wmodal-jobs-completed', '0');
  setText('wmodal-plan-name', 'None');
  setText('wmodal-sub-total', 'Rs. 0.00');
  setText('wmodal-sub-date', 'None');
  setText('wmodal-category', 'None');
  setText('wmodal-location', 'None');
  setText('wmodal-rating', '5.0');
  setText('wmodal-phone', 'None');

  const subStatusEl = document.getElementById('wmodal-sub-status');
  if (subStatusEl) {
    subStatusEl.textContent = 'None';
    subStatusEl.className = 'badge';
    subStatusEl.style.background = '#e2e8f0';
    subStatusEl.style.color = '#475569';
  }

  const verifyStatusEl = document.getElementById('wmodal-verify-status');
  if (verifyStatusEl) {
    verifyStatusEl.textContent = 'None';
    verifyStatusEl.className = 'badge';
    verifyStatusEl.style.background = '#e2e8f0';
    verifyStatusEl.style.color = '#475569';
  }

  try {
    // Fresh data on every open (no caching via timestamp query param)
    const res = await apiFetch(`admin.php?action=worker-summary&id=${encodeURIComponent(workerId)}&_t=${Date.now()}`);
    if (res.ok && res.data?.status === 'success' && res.data.data) {
      const d = res.data.data;

      // Header info
      setText('wmodal-name', d.name || 'Unnamed Worker');
      setText('wmodal-subtitle', d.email ? `${d.email} · ID #${d.profile_id || workerId}` : `Worker ID: #${workerId}`);

      const avatarContainer = document.getElementById('wmodal-avatar-container');
      if (avatarContainer) {
        if (d.avatar) {
          const avatarUrl = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(d.avatar, '../') : '../' + d.avatar;
          avatarContainer.innerHTML = `<img src="${avatarUrl}" class="avatar avatar-md" style="object-fit:cover;border-radius:50%;width:44px;height:44px;" alt="${escapeHtml(d.name || '')}">`;
        } else {
          const nameParts = (d.name || 'WK').trim().split(/\s+/);
          const initials = nameParts.length >= 2
            ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
            : (nameParts[0] ? nameParts[0].substring(0, 2).toUpperCase() : 'WK');
          avatarContainer.innerHTML = `<div class="avatar avatar-md avatar-blue" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:50%;">${initials}</div>`;
        }
      }

      // 1. Earnings section (Rs. 0.00 / 0 fallbacks)
      setText('wmodal-total-earnings', d.total_earnings_formatted || 'Rs. 0.00');
      setText('wmodal-monthly-earnings', d.monthly_earnings_formatted || 'Rs. 0.00');
      setText('wmodal-jobs-completed', String(d.jobs_completed !== undefined && d.jobs_completed !== null ? d.jobs_completed : 0));

      // 2. Subscription section
      setText('wmodal-plan-name', d.plan_name || 'None');
      if (subStatusEl) {
        const status = d.subscription_status || 'None';
        subStatusEl.textContent = status;
        if (status === 'Active') {
          subStatusEl.className = 'badge badge-completed';
          subStatusEl.style.background = '';
          subStatusEl.style.color = '';
        } else if (status === 'Expired') {
          subStatusEl.className = 'badge badge-cancelled';
          subStatusEl.style.background = '';
          subStatusEl.style.color = '';
        } else {
          subStatusEl.className = 'badge';
          subStatusEl.style.background = '#e2e8f0';
          subStatusEl.style.color = '#475569';
        }
      }
      setText('wmodal-sub-total', d.total_sub_paid_formatted || 'Rs. 0.00');
      setText('wmodal-sub-date', d.last_payment_date || 'None');

      // 3. Profile section
      setText('wmodal-category', d.category || 'None');
      setText('wmodal-location', d.location || d.district || 'None');
      setText('wmodal-rating', d.rating && d.rating !== 'None' ? d.rating : '5.0');
      
      if (verifyStatusEl) {
        const vStatus = (d.verification_status || 'None').toLowerCase();
        verifyStatusEl.textContent = d.verification_status || 'None';
        if (vStatus === 'verified') {
          verifyStatusEl.className = 'badge badge-verified';
          verifyStatusEl.style.background = '';
          verifyStatusEl.style.color = '';
        } else if (vStatus === 'pending') {
          verifyStatusEl.className = 'badge badge-pending';
          verifyStatusEl.style.background = '';
          verifyStatusEl.style.color = '';
        } else if (vStatus === 'suspended') {
          verifyStatusEl.className = 'badge badge-cancelled';
          verifyStatusEl.style.background = '';
          verifyStatusEl.style.color = '';
        } else {
          verifyStatusEl.className = 'badge';
          verifyStatusEl.style.background = '#f1f5f9';
          verifyStatusEl.style.color = '#64748b';
        }
      }

      setText('wmodal-phone', d.phone || 'None');
    } else {
      if (typeof showToast === 'function') {
        showToast(res.data?.message || 'Could not load worker details.', 'warning');
      }
    }
  } catch (err) {
    console.error('Error fetching worker summary:', err);
    if (typeof showToast === 'function') {
      showToast('Could not load complete worker details.', 'warning');
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function closeWorkerSummaryModal() {
  const modal = document.getElementById('worker-summary-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

window.openWorkerSummaryModal = openWorkerSummaryModal;
window.closeWorkerSummaryModal = closeWorkerSummaryModal;

// Delegated click listener for .btn-view-worker
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-view-worker');
  if (btn) {
    const wid = btn.getAttribute('data-worker-id') || btn.dataset.workerId;
    if (wid) {
      openWorkerSummaryModal(wid);
    }
  }
});

// Close modal on Escape key press
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeWorkerSummaryModal();
    closeJobDetailsModal();
  }
});

/**
 * Job Requests Management (admin/jobs.html)
 */
let adminJobsList = [];

function initAdminJobs() {
  const searchInput = document.getElementById('job-search-input');
  const statusFilter = document.getElementById('job-status-filter');

  if (searchInput) {
    searchInput.addEventListener('input', () => filterAndRenderJobs());
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => filterAndRenderJobs());
  }

  loadAdminJobs();
}

async function loadAdminJobs() {
  const tbody = document.getElementById('admin-jobs-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr>
    <td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
        <i data-lucide="loader" width="18" height="18" class="spin"></i>
        <span>Loading job requests...</span>
      </div>
    </td>
  </tr>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const res = await apiFetch(`admin.php?action=jobs&_t=${Date.now()}`);
    if (res.ok && res.data?.status === 'success') {
      const rawJobs = res.data.jobs || res.data.data || [];
      adminJobsList = Array.isArray(rawJobs) ? rawJobs : [];
      filterAndRenderJobs();
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">No job requests found.</td></tr>`;
    }
  } catch (err) {
    console.error('Error loading jobs:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">No job requests found.</td></tr>`;
  }
}

function filterAndRenderJobs() {
  const tbody = document.getElementById('admin-jobs-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('job-search-input');
  const statusFilter = document.getElementById('job-status-filter');

  const q = (searchInput?.value || '').toLowerCase().trim();
  const rawStatus = (statusFilter?.value || '').toLowerCase().trim().replace(/[\s_-]+/g, '');

  const filtered = adminJobsList.filter(job => {
    // 1. Search filter: job title or customer name
    if (q) {
      const title = (job.title || '').toLowerCase();
      const customer = (job.customer_name || '').toLowerCase();
      if (!title.includes(q) && !customer.includes(q)) {
        return false;
      }
    }

    // 2. Status filter
    if (rawStatus && rawStatus !== 'all' && rawStatus !== 'allstatuses') {
      const jobStatus = (job.status || '').toLowerCase().replace(/[\s_-]+/g, '');
      if (jobStatus !== rawStatus) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">No job requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(job => renderJobTableRow(job)).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderJobTableRow(job) {
  const id = job.id;
  const title = job.title || 'Untitled Job';
  const descSnippet = job.description
    ? (job.description.length > 55 ? job.description.substring(0, 52) + '...' : job.description)
    : '';
  const customer = job.customer_name || 'Customer';
  const category = job.category_name || 'General';

  // Location display: District / City / Address
  const locParts = [job.city, job.district].filter(Boolean);
  const locationDisplay = locParts.length ? locParts.join(', ') : (job.address || 'Colombo');

  // Posted date formatted
  const postedDate = formatJobDate(job.created_at);

  // Status badge
  const normStatus = (job.status || 'open').toLowerCase();
  let badgeHtml = '';
  if (normStatus === 'open') {
    badgeHtml = '<span class="badge badge-open">Open</span>';
  } else if (normStatus === 'in_progress' || normStatus === 'inprogress') {
    badgeHtml = '<span class="badge badge-progress">In Progress</span>';
  } else if (normStatus === 'completed') {
    badgeHtml = '<span class="badge badge-completed">Completed</span>';
  } else if (normStatus === 'cancelled') {
    badgeHtml = '<span class="badge badge-cancelled">Cancelled</span>';
  } else {
    badgeHtml = `<span class="badge">${escapeHtml(job.status || 'Open')}</span>`;
  }

  return `
    <tr id="job-row-${id}">
      <td>
        <strong>${escapeHtml(title)}</strong>
        ${descSnippet ? `<br><span class="text-sm text-secondary">${escapeHtml(descSnippet)}</span>` : ''}
      </td>
      <td>${escapeHtml(customer)}</td>
      <td>${escapeHtml(category)}</td>
      <td>${escapeHtml(locationDisplay)}</td>
      <td>${escapeHtml(postedDate)}</td>
      <td>${badgeHtml}</td>
      <td>
        <div class="btn-group">
          <button type="button" class="btn btn-outline btn-sm" onclick="openJobDetailsModal(${id})">View</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteJobRequest(${id})">Remove</button>
        </div>
      </td>
    </tr>
  `;
}

function formatJobDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function formatJobTime(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hour = parseInt(parts[0], 10);
  const min = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${min} ${ampm}`;
}

function formatPreferredDateTime(job) {
  if (!job.preferred_date && !job.start_time) return 'Not specified / Flexible';
  let datePart = '';
  if (job.preferred_date) {
    try {
      const d = new Date(job.preferred_date + 'T00:00:00');
      datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      datePart = job.preferred_date;
    }
  }
  let timePart = '';
  if (job.start_time) {
    timePart = formatJobTime(job.start_time);
    if (job.end_time) {
      timePart += ' - ' + formatJobTime(job.end_time);
    }
  }
  if (datePart && timePart) return `${datePart} (${timePart})`;
  return datePart || timePart || 'Not specified / Flexible';
}

function openJobDetailsModal(jobId) {
  const job = adminJobsList.find(j => Number(j.id) === Number(jobId));
  if (!job) {
    if (typeof showToast === 'function') showToast('Job details not found.', 'error');
    return;
  }

  const modal = document.getElementById('job-details-modal');
  if (!modal) return;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val !== null && val !== undefined && String(val).trim() !== '') ? val : '-';
  };

  setText('jmodal-id-subtitle', `Job ID: #${job.id}`);
  setText('jmodal-job-title', job.title || 'Untitled Job');
  setText('jmodal-description', job.description || 'No description provided.');
  setText('jmodal-customer', job.customer_name || 'Unknown Customer');
  setText('jmodal-category', job.category_name || 'General');

  // District / City
  const dcParts = [job.city, job.district].filter(Boolean);
  setText('jmodal-district-city', dcParts.length ? dcParts.join(', ') : (job.district || job.city || 'None'));

  // Location Address
  setText('jmodal-location', job.address || 'None');

  // Preferred Date/Time
  setText('jmodal-datetime', formatPreferredDateTime(job));

  // Posted Date
  setText('jmodal-posted-date', formatJobDate(job.created_at));

  // Status Badge
  const statusBadge = document.getElementById('jmodal-status-badge');
  if (statusBadge) {
    const norm = (job.status || 'open').toLowerCase();
    if (norm === 'open') {
      statusBadge.className = 'badge badge-open';
      statusBadge.textContent = 'Open';
    } else if (norm === 'in_progress' || norm === 'inprogress') {
      statusBadge.className = 'badge badge-progress';
      statusBadge.textContent = 'In Progress';
    } else if (norm === 'completed') {
      statusBadge.className = 'badge badge-completed';
      statusBadge.textContent = 'Completed';
    } else if (norm === 'cancelled') {
      statusBadge.className = 'badge badge-cancelled';
      statusBadge.textContent = 'Cancelled';
    } else {
      statusBadge.className = 'badge';
      statusBadge.textContent = job.status || 'Open';
    }
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeJobDetailsModal() {
  const modal = document.getElementById('job-details-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

async function deleteJobRequest(jobId) {
  if (!confirm('Delete this job request permanently?')) return;

  try {
    const res = await apiFetch('admin.php?action=remove-job', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId })
    });

    if (res.ok && res.data?.status === 'success') {
      if (typeof showToast === 'function') {
        showToast('Job request removed successfully.', 'success');
      }
      adminJobsList = adminJobsList.filter(j => Number(j.id) !== Number(jobId));
      filterAndRenderJobs();
    } else {
      if (typeof showToast === 'function') {
        showToast(res.data?.message || 'Failed to remove job request.', 'error');
      }
    }
  } catch (err) {
    console.error('Error removing job:', err);
    if (typeof showToast === 'function') {
      showToast(`Error: ${err.message}`, 'error');
    }
  }
}

window.openJobDetailsModal = openJobDetailsModal;
window.closeJobDetailsModal = closeJobDetailsModal;
window.deleteJobRequest = deleteJobRequest;

/* ==========================================
   Content Moderation & Reports System
   ========================================== */
let adminReportsList = [];
let currentModerationTab = 'pending';

async function initAdminModeration() {
  await loadModerationReports();
}

async function loadModerationReports() {
  if (window._moderationLoaded) return;
  window._moderationLoaded = true;
  const container = document.getElementById('reportsContainer');
  try {
    const [countsRes, listRes] = await Promise.all([
      apiFetch('reports.php?action=counts'),
      apiFetch('reports.php?action=list')
    ]);

    if (countsRes.ok && countsRes.data?.counts) {
      updateModerationTabCounts(countsRes.data.counts);
    }

    if (listRes.ok && Array.isArray(listRes.data?.reports)) {
      adminReportsList = listRes.data.reports;
    } else {
      adminReportsList = [];
    }

    renderModerationCards();
  } catch (err) {
    console.error('Failed to load moderation reports:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding:48px 16px; color:#ef4444; background:var(--white); border:1px solid var(--border); border-radius:var(--radius-md);">
          <p style="margin:0;">Failed to load moderation reports. Please refresh.</p>
        </div>
      `;
    }
  }
}

function updateModerationTabCounts(counts) {
  const pCount = document.getElementById('count-pending');
  const dCount = document.getElementById('count-dismissed');
  const rCount = document.getElementById('count-resolved');

  if (pCount) pCount.textContent = counts.pending ?? 0;
  if (dCount) dCount.textContent = counts.dismissed ?? 0;
  if (rCount) rCount.textContent = counts.resolved ?? 0;
}

function recalculateLocalCounts() {
  const counts = {
    pending: adminReportsList.filter(r => (r.status || '').toLowerCase() === 'pending').length,
    dismissed: adminReportsList.filter(r => (r.status || '').toLowerCase() === 'dismissed').length,
    resolved: adminReportsList.filter(r => (r.status || '').toLowerCase() === 'resolved').length
  };
  updateModerationTabCounts(counts);
}

function switchModerationTab(tabName) {
  currentModerationTab = tabName;
  const tabs = document.querySelectorAll('#moderationTabs .tab');
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  renderModerationCards();
}

function renderModerationCards() {
  const container = document.getElementById('reportsContainer');
  if (!container) return;

  const filtered = adminReportsList.filter(r => (r.status || '').toLowerCase() === currentModerationTab);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:48px 16px; background:var(--white); border:1px solid var(--border); border-radius:var(--radius-md);">
        <p style="color:var(--text-muted); font-size:0.95rem; margin:0;">No reports here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(r => {
    const isReview = (r.target_type === 'review');
    const isPending = (r.status === 'pending');
    const isResolved = (r.status === 'resolved');

    const statusBadgeClass = isPending ? 'badge-pending' : (isResolved ? 'badge-verified' : 'badge-neutral');
    const statusLabel = isPending ? 'Pending' : (isResolved ? 'Resolved' : 'Dismissed');

    const typeBadgeClass = isReview ? 'badge-cancelled' : 'badge-warning';
    const typeLabel = isReview ? 'Review' : 'Worker';
    const typeIcon = isReview ? 'flag' : 'user-x';

    const targetTitle = escapeHtml(r.target_title || (isReview ? 'Reported Review' : 'Reported Worker'));
    const reporterName = escapeHtml(r.reporter_name || ('User #' + r.reporter_id));
    const createdDate = r.created_date || (r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent');

    const snippetHeader = isReview ? 'Flagged Review Content:' : 'Reported Worker Details:';
    const snippetColor = isReview ? '#EF4444' : '#F59E0B';
    const snippetText = escapeHtml(r.content_snippet || 'No content snippet available.');
    const reasonText = escapeHtml(r.reason || 'Not specified');
    const detailsText = r.details ? escapeHtml(r.details) : '';

    return `
      <div class="report-card" id="report-card-${r.id}" style="background:var(--white); border:1px solid var(--border); border-radius:var(--radius-md); padding:20px; transition:var(--transition);">
        <div class="report-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span class="badge ${typeBadgeClass}" style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; font-weight:600; padding:3px 8px;">
                <i data-lucide="${typeIcon}" width="12" height="12"></i> ${typeLabel}
              </span>
            </div>
            <h3 style="margin:0 0 4px; font-size:1.05rem; font-weight:700; color:var(--text-primary);">${targetTitle}</h3>
            <p class="text-sm text-secondary" style="margin:0; font-size:0.8125rem; color:var(--text-muted);">
              Reported by <strong>${reporterName}</strong> • ${createdDate}
            </p>
          </div>
          <span class="badge ${statusBadgeClass}" style="font-weight:600; text-transform:capitalize; padding:4px 10px;">
            ${statusLabel}
          </span>
        </div>

        <div style="background:#F9FAFB; padding:12px 14px; border-radius:8px; margin:12px 0; border-left:4px solid ${snippetColor};">
          <strong style="display:block; margin-bottom:4px; font-size:0.85rem; color:var(--text-primary);">${snippetHeader}</strong>
          <p style="font-size:0.875rem; color:#4B5563; margin:0; line-height:1.5;">${snippetText}</p>
        </div>

        <div style="margin-bottom:12px; font-size:0.875rem; color:var(--text-primary);">
          <p style="margin:0 0 4px;"><strong>Reason for report:</strong> ${reasonText}</p>
          ${detailsText ? `<p style="margin:0; color:var(--text-secondary); font-size:0.825rem;"><strong>Additional details:</strong> ${detailsText}</p>` : ''}
        </div>

        ${isPending ? `
          <div class="report-actions" style="display:flex; gap:10px; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-light); flex-wrap:wrap;">
            ${isReview ? `
              <button type="button" class="btn btn-danger btn-sm" onclick="handleModerationResolve(${r.id}, 'remove')" style="background:#ef4444; border-color:#ef4444; color:#fff; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                <i data-lucide="trash-2" width="14" height="14"></i> Remove Review
              </button>
            ` : `
              <button type="button" class="btn btn-danger btn-sm" onclick="handleModerationResolve(${r.id}, 'suspend')" style="background:#ef4444; border-color:#ef4444; color:#fff; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                <i data-lucide="user-x" width="14" height="14"></i> Suspend Worker
              </button>
            `}
            <button type="button" class="btn btn-outline btn-sm" onclick="handleModerationDismiss(${r.id})" style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <i data-lucide="check" width="14" height="14"></i> Dismiss Report
            </button>
          </div>
        ` : (r.resolved_at ? `
          <div style="font-size:0.8125rem; color:var(--text-muted); margin-top:12px; padding-top:8px; border-top:1px solid var(--border-light);">
            ${isResolved ? 'Resolved' : 'Dismissed'} on ${new Date(r.resolved_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        ` : '')}
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleModerationResolve(reportId, action) {
  const report = adminReportsList.find(r => Number(r.id) === Number(reportId));
  if (!report) return;

  const isReview = (report.target_type === 'review');
  const confirmMsg = isReview
    ? 'Are you sure you want to permanently remove this review? This action cannot be undone.'
    : 'Are you sure you want to suspend this worker account? The worker will be blocked from logging into the platform.';

  if (!confirm(confirmMsg)) return;

  try {
    const res = await apiFetch('reports.php?action=resolve', {
      method: 'POST',
      body: JSON.stringify({
        report_id: reportId,
        action: action
      })
    });

    if (res.ok && res.data?.status === 'success') {
      const successMsg = isReview
        ? 'Review removed and report marked as resolved.'
        : 'Worker account suspended and report marked as resolved.';
      if (typeof showToast === 'function') {
        showToast(successMsg, 'success');
      } else {
        alert(successMsg);
      }

      report.status = 'resolved';
      report.resolved_at = new Date().toISOString();
      if (isReview) {
        report.content_snippet = '[This review was deleted or no longer exists in the database.]';
      }

      recalculateLocalCounts();
      renderModerationCards();
    } else {
      const errMsg = res.data?.message || 'Failed to resolve report.';
      if (typeof showToast === 'function') showToast(errMsg, 'error');
      else alert(errMsg);
    }
  } catch (err) {
    console.error('Moderation resolve error:', err);
    if (typeof showToast === 'function') showToast('Network error while resolving report.', 'error');
  }
}

async function handleModerationDismiss(reportId) {
  const report = adminReportsList.find(r => Number(r.id) === Number(reportId));
  if (!report) return;

  if (!confirm('Are you sure you want to dismiss this report?')) return;

  try {
    const res = await apiFetch('reports.php?action=dismiss', {
      method: 'POST',
      body: JSON.stringify({
        report_id: reportId
      })
    });

    if (res.ok && res.data?.status === 'success') {
      if (typeof showToast === 'function') {
        showToast('Report dismissed successfully.', 'info');
      } else {
        alert('Report dismissed successfully.');
      }

      report.status = 'dismissed';
      report.resolved_at = new Date().toISOString();

      recalculateLocalCounts();
      renderModerationCards();
    } else {
      const errMsg = res.data?.message || 'Failed to dismiss report.';
      if (typeof showToast === 'function') showToast(errMsg, 'error');
      else alert(errMsg);
    }
  } catch (err) {
    console.error('Moderation dismiss error:', err);
    if (typeof showToast === 'function') showToast('Network error while dismissing report.', 'error');
  }
}

window.initAdminModeration = initAdminModeration;
window.switchModerationTab = switchModerationTab;
window.handleModerationResolve = handleModerationResolve;
window.handleModerationDismiss = handleModerationDismiss;


