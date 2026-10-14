function purgeAnalyticsLinks() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('a[href*="analytics"], .sidebar-link').forEach(function(el) {
    if (el.textContent.toLowerCase().includes('analytics') || (el.getAttribute('href') && el.getAttribute('href').includes('analytics'))) {
      el.remove();
    }
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
