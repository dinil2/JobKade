/* ==========================================
   JODKADE — Admin Dashboard JavaScript
   Charts, verification, moderation
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {
  const user = (typeof requireAuth === 'function') ? requireAuth('admin') : null;
  if (!user) return;

  loadAdminStats();
  initAdminCharts();

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
function initAdminCharts() {
  if (typeof Chart === 'undefined') return;

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
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

  // 1. Worker Registrations Line Chart
  createChart('registrations-chart', 'line', {
    labels,
    datasets: [{
      label: 'Worker Registrations',
      data: [12, 19, 15, 25, 22, 30, 28, 35],
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
      data: [45, 52, 38, 65, 58, 72, 68, 85],
      backgroundColor: 'rgba(89, 150, 255, 0.7)',
      borderRadius: 6
    }]
  });

  // 3. Revenue Line Chart
  createChart('revenue-chart', 'line', {
    labels,
    datasets: [{
      label: 'Revenue (Rs.)',
      data: [25000, 35000, 28000, 42000, 38000, 52000, 48000, 62000],
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
    new Chart(catEl.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Electrical', 'Plumbing', 'AC Repair', 'Carpentry', 'Painting', 'Cleaning'],
        datasets: [{
          data: [30, 22, 18, 12, 10, 8],
          backgroundColor: ['#5996FF', '#66BB6A', '#FFA726', '#AB47BC', '#26A69A', '#EF5350'],
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
        if (s.total_jobs !== undefined) cards[3].querySelector('h3')?.replaceChildren(document.createTextNode(s.total_jobs));
      }
    }
  } catch (err) {
    console.warn('loadAdminStats error:', err);
  }
}
