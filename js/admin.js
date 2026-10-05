/* ==========================================
   JODKADE — Admin Dashboard JavaScript
   Charts, verification, moderation
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {

  // Verify authentic Admin authentication from database session
  const token = typeof getAuthToken === 'function' ? getAuthToken() : localStorage.getItem('jobkade_token');
  const user = typeof getLoggedInUser === 'function' ? getLoggedInUser() : null;
  if (!token || !user || (user.role || '').toLowerCase() !== 'admin') {
    window.location.href = '../auth/login.html?redirect=' + encodeURIComponent('admin/dashboard.html');
    return;
  }

  // ---- Fetch Real Stats from Backend ----
  loadAdminStats();

  // ---- Admin Dashboard Charts (using Chart.js) ----
  initAdminCharts();

  // ---- Worker Verification Actions ----
  document.querySelectorAll('.approve-worker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var workerName = this.getAttribute('data-worker') || 'this worker';
      document.getElementById('approve-worker-name').textContent = workerName;
      openModal('approve-modal');
    });
  });

  document.querySelectorAll('.reject-worker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var workerName = this.getAttribute('data-worker') || 'this worker';
      document.getElementById('reject-worker-name').textContent = workerName;
      openModal('reject-modal');
    });
  });

  // ---- Confirm Approve ----
  var activeWorkerRow = null;
  var confirmApproveBtn = document.getElementById('confirm-approve');
  if (confirmApproveBtn) {
    confirmApproveBtn.addEventListener('click', function () {
      closeModal('approve-modal');
      showToast('Worker approved successfully!', 'success');
      
      // Update row status badge if worker row exists
      if (activeWorkerRow) {
        var statusCell = activeWorkerRow.querySelector('.badge');
        if (statusCell) {
          statusCell.className = 'badge badge-verified';
          statusCell.innerHTML = '<i data-lucide="check" width="10" height="10"></i> Verified';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }

  // ---- Confirm Reject ----
  var confirmRejectBtn = document.getElementById('confirm-reject');
  if (confirmRejectBtn) {
    confirmRejectBtn.addEventListener('click', function () {
      closeModal('reject-modal');
      showToast('Worker verification rejected.', 'error');

      if (activeWorkerRow) {
        var statusCell = activeWorkerRow.querySelector('.badge');
        if (statusCell) {
          statusCell.className = 'badge badge-cancelled';
          statusCell.textContent = 'Rejected';
        }
      }
    });
  }

  // Track active row when opening modals
  document.querySelectorAll('.approve-worker-btn, .reject-worker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeWorkerRow = this.closest('tr');
    });
  });

  // ---- View NIC Document ----
  document.querySelectorAll('.view-nic-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal('nic-modal');
    });
  });

  // ---- Moderation Actions ----
  document.querySelectorAll('.dismiss-report-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = this.closest('.report-card');
      if (card) {
        card.style.opacity = '0.5';
        card.style.pointerEvents = 'none';
        showToast('Report dismissed.', 'info');
      }
    });
  });

  document.querySelectorAll('.remove-content-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal('remove-content-modal');
      window.activeReportCard = this.closest('.report-card');
    });
  });

  var confirmRemoveBtn = document.getElementById('confirm-remove-content');
  if (confirmRemoveBtn) {
    confirmRemoveBtn.addEventListener('click', function () {
      closeModal('remove-content-modal');
      showToast('Content removed successfully.', 'success');
      if (window.activeReportCard) {
        window.activeReportCard.remove();
      }
    });
  }

  // ---- Table Search & Dropdown Filtering ----
  document.querySelectorAll('.table-search').forEach(function (input) {
    input.addEventListener('input', function () {
      var query = this.value.toLowerCase();
      var tableCard = this.closest('.table-card') || document;
      var table = tableCard.querySelector('.data-table');
      if (!table) return;

      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  });

});

/* ==========================================
   Chart Initialization
   ========================================== */
function initAdminCharts() {
  // Check if Chart.js is available
  if (typeof Chart === 'undefined') return;

  // Common chart options
  var commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
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

  // Worker Registrations Chart
  var regCtx = document.getElementById('registrations-chart');
  if (regCtx) {
    new Chart(regCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
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
      },
      options: commonOptions
    });
  }

  // Job Requests Chart
  var jobsCtx = document.getElementById('jobs-chart');
  if (jobsCtx) {
    new Chart(jobsCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
        datasets: [{
          label: 'Job Requests',
          data: [45, 52, 38, 65, 58, 72, 68, 85],
          backgroundColor: 'rgba(89, 150, 255, 0.7)',
          borderRadius: 6
        }]
      },
      options: commonOptions
    });
  }

  // Revenue Chart
  var revCtx = document.getElementById('revenue-chart');
  if (revCtx) {
    new Chart(revCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
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
      },
      options: commonOptions
    });
  }

  // Category Distribution (Doughnut)
  var catCtx = document.getElementById('category-chart');
  if (catCtx) {
    new Chart(catCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Electrical', 'Plumbing', 'AC Repair', 'Carpentry', 'Painting', 'Cleaning'],
        datasets: [{
          data: [30, 22, 18, 12, 10, 8],
          backgroundColor: [
            '#5996FF', '#66BB6A', '#FFA726', '#AB47BC', '#26A69A', '#EF5350'
          ],
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
    if (res.ok && res.data && res.data.status === 'success') {
      const s = res.data.stats;
      const cards = document.querySelectorAll('.admin-stat-card');
      if (cards.length >= 4) {
        if (s.verified_workers !== undefined) {
          const h3 = cards[0].querySelector('h3');
          if (h3) h3.textContent = s.verified_workers;
        }
        if (s.total_users !== undefined) {
          const h3 = cards[1].querySelector('h3');
          if (h3) h3.textContent = s.total_users;
        }
        if (s.total_jobs !== undefined) {
          const h3 = cards[3].querySelector('h3');
          if (h3) h3.textContent = s.total_jobs;
        }
      }
    }
  } catch (err) {
    console.warn('loadAdminStats error:', err);
  }
}

