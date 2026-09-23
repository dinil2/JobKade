// js/admin-kyc.js — Admin KYC Moderation Client

let currentTab = 'pending';
let allDocuments = [];
let pendingDocuments = [];

document.addEventListener('DOMContentLoaded', function () {
  const token = localStorage.getItem('jodkade_token');
  const user = JSON.parse(localStorage.getItem('jodkade_logged_user') || 'null');

  // Verify Admin Authentication
  if (!token || !user || user.role !== 'admin') {
    window.location.href = '../auth/login.html?redirect=admin/kyc-moderation.html';
    return;
  }

  // Admin user info
  const adminUserName = document.getElementById('adminUserName');
  const adminNavAvatar = document.getElementById('adminNavAvatar');
  if (adminUserName && user.name) adminUserName.textContent = user.name;
  if (adminNavAvatar && user.name) {
    adminNavAvatar.textContent = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  // Logout handler
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.removeItem('jodkade_token');
      localStorage.removeItem('jodkade_logged_user');
      window.location.href = '../auth/login.html';
    });
  }

  // Tab Switching
  const tabs = document.querySelectorAll('#kycTabs .tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentTab = this.getAttribute('data-status') || 'pending';
      loadKycQueue();
    });
  });

  // Search input handler
  const searchInput = document.getElementById('kycSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      const q = this.value.toLowerCase().trim();
      filterAndRenderTable(q);
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refreshKycBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadStats();
      loadKycQueue();
    });
  }

  // Rejection confirmation button
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');
  if (confirmRejectBtn) {
    confirmRejectBtn.addEventListener('click', handleRejectConfirm);
  }

  // Initial Load
  loadStats();
  loadKycQueue();
});

// Load Overview Stats
async function loadStats() {
  const token = localStorage.getItem('jodkade_token');
  try {
    const res = await fetch('../api/admin.php?action=stats', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (res.ok && data.status === 'success' && data.stats) {
      document.getElementById('statPendingCount').textContent = data.stats.pending_kyc || 0;
      document.getElementById('statApprovedCount').textContent = data.stats.verified_workers || 0;
      document.getElementById('pendingCounterBadge').textContent = data.stats.pending_kyc || 0;
      document.getElementById('tabPendingCount').textContent = data.stats.pending_kyc || 0;
    }
  } catch (err) {
    console.error('Failed to load admin stats:', err);
  }
}

// Load KYC Queue by Tab
async function loadKycQueue() {
  const token = localStorage.getItem('jodkade_token');
  const tbody = document.getElementById('kycTableBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b;">Loading verification records...</td></tr>';

  try {
    const url = (currentTab === 'pending') 
      ? '../api/admin.php?action=kyc/pending' 
      : `../api/admin.php?action=kyc/list&status=${currentTab}`;

    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    if (res.ok && data.status === 'success') {
      allDocuments = data.pending_kyc || data.documents || [];
      if (currentTab === 'pending') {
        pendingDocuments = allDocuments;
        document.getElementById('tabPendingCount').textContent = allDocuments.length;
        document.getElementById('statPendingCount').textContent = allDocuments.length;
        document.getElementById('pendingCounterBadge').textContent = allDocuments.length;
      }
      filterAndRenderTable(document.getElementById('kycSearchInput').value.toLowerCase().trim());
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#dc2626;">Failed to load records.</td></tr>';
    }
  } catch (err) {
    console.error('Error fetching KYC queue:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#dc2626;">Network error occurred while fetching records.</td></tr>';
  }
}

function filterAndRenderTable(query) {
  const tbody = document.getElementById('kycTableBody');
  let docs = allDocuments;

  if (query) {
    docs = docs.filter(d => {
      const name = (d.worker_name || '').toLowerCase();
      const phone = (d.worker_phone || '').toLowerCase();
      const docName = (d.document_name || '').toLowerCase();
      const cat = (d.categories || '').toLowerCase();
      return name.includes(query) || phone.includes(query) || docName.includes(query) || cat.includes(query);
    });
  }

  if (docs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:36px;color:#64748b;">
          <i data-lucide="check-circle-2" width="32" height="32" style="display:block;margin:0 auto 8px;opacity:0.5;color:#10b981;"></i>
          No ${currentTab} KYC documents found in queue.
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const typeLabels = {
    'nic': 'National ID (NIC)',
    'police_report': 'Police Clearance Report',
    'driving_license': 'Driving License',
    'trade_certificate': 'Trade Certification / NVQ'
  };

  tbody.innerHTML = docs.map(doc => {
    const kycId = doc.kyc_id || doc.id;
    const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    const typeLabel = typeLabels[doc.document_type] || (doc.document_type || '').toUpperCase();
    const filePath = doc.file_path || doc.document_path || '#';
    const cleanFilePath = filePath.startsWith('http') ? filePath : ('../' + filePath);

    let actionsHtml = '';
    if (currentTab === 'pending') {
      actionsHtml = `
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn-approve" onclick="handleApprove(${kycId}, '${escapeHtml(doc.worker_name)}')">
            <i data-lucide="check" width="14" height="14"></i> Approve
          </button>
          <button class="btn-reject" onclick="openRejectModal(${kycId}, '${escapeHtml(doc.worker_name)}')">
            <i data-lucide="x" width="14" height="14"></i> Reject
          </button>
        </div>
      `;
    } else if (doc.status === 'approved') {
      actionsHtml = `<span class="badge badge-approved" style="float:right;">✓ Verified</span>`;
    } else {
      actionsHtml = `
        <span class="badge badge-rejected" style="float:right;cursor:help;" title="${escapeHtml(doc.admin_notes || 'No reason specified')}">
          ✗ Rejected
        </span>
      `;
    }

    return `
      <tr>
        <td>
          <div style="font-weight:600;color:#0f172a;">${escapeHtml(doc.worker_name || 'Worker #' + doc.worker_id)}</div>
          <div style="font-size:0.75rem;color:#64748b;">${escapeHtml(doc.worker_phone || '')} &bull; ${escapeHtml(doc.worker_email || '')}</div>
        </td>
        <td>
          <span style="font-size:0.8rem;background:#f1f5f9;padding:3px 8px;border-radius:4px;color:#334155;">
            ${escapeHtml(doc.categories || 'General')}
          </span>
        </td>
        <td><span style="font-weight:600;font-size:0.85rem;color:#1e293b;">${typeLabel}</span></td>
        <td style="font-size:0.85rem;color:#475569;">${escapeHtml(doc.document_name || '-')}</td>
        <td style="font-size:0.8rem;color:#64748b;">${dateStr}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="openViewerModal('${cleanFilePath}', '${escapeHtml(doc.worker_name)}', '${typeLabel}', '${dateStr}')" style="font-size:0.75rem;padding:4px 8px;display:inline-flex;align-items:center;gap:4px;">
            <i data-lucide="eye" width="14" height="14"></i> View File
          </button>
        </td>
        <td style="text-align:right;">${actionsHtml}</td>
      </tr>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Approve KYC Action
async function handleApprove(kycId, workerName) {
  if (!confirm(`Are you sure you want to APPROVE KYC verification for ${workerName}? This will award the Verified Worker Badge and full bidding access.`)) {
    return;
  }

  const token = localStorage.getItem('jodkade_token');
  try {
    const res = await fetch('../api/admin.php?action=kyc/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        kyc_id: kycId,
        status: 'approved',
        notes: 'Identity verified successfully by administration.'
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToastMessage(`KYC approved for ${workerName}! Worker status updated to Verified.`, 'success');
      loadStats();
      loadKycQueue();
    } else {
      showToastMessage(data.message || 'Failed to approve KYC.', 'error');
    }
  } catch (err) {
    showToastMessage('Network error occurred while approving document.', 'error');
  }
}

// Reject KYC Actions
function openRejectModal(kycId, workerName) {
  document.getElementById('rejectKycId').value = kycId;
  document.getElementById('rejectionReasonInput').value = '';
  document.getElementById('rejectReasonModal').style.display = 'flex';
  document.getElementById('rejectionReasonInput').focus();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeRejectModal() {
  document.getElementById('rejectReasonModal').style.display = 'none';
}

async function handleRejectConfirm() {
  const kycId = document.getElementById('rejectKycId').value;
  const reason = document.getElementById('rejectionReasonInput').value.trim();

  if (!reason) {
    alert('Please enter a rejection reason or feedback notes for the worker.');
    return;
  }

  const token = localStorage.getItem('jodkade_token');
  const confirmBtn = document.getElementById('confirmRejectBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = 'Submitting...';

  try {
    const res = await fetch('../api/admin.php?action=kyc/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        kyc_id: parseInt(kycId, 10),
        status: 'rejected',
        notes: reason
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToastMessage('KYC submission marked as Rejected with feedback.', 'info');
      closeRejectModal();
      loadStats();
      loadKycQueue();
    } else {
      showToastMessage(data.message || 'Failed to reject KYC document.', 'error');
    }
  } catch (err) {
    showToastMessage('Network error occurred while rejecting document.', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i data-lucide="x-circle" width="16" height="16"></i> Confirm Rejection';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// Document Viewer Modal
function openViewerModal(filePath, workerName, docType, dateStr) {
  const modal = document.getElementById('docViewerModal');
  const content = document.getElementById('viewerContent');
  const workerElem = document.getElementById('viewerDocWorker');
  const detailsElem = document.getElementById('viewerDocDetails');
  const downloadBtn = document.getElementById('viewerDownloadBtn');

  workerElem.textContent = 'Worker: ' + workerName;
  detailsElem.textContent = `${docType} | Submitted: ${dateStr}`;
  downloadBtn.href = filePath;

  const ext = filePath.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    content.innerHTML = `<img src="${filePath}" alt="Document Preview" style="max-width:100%;max-height:480px;object-fit:contain;border-radius:4px;">`;
  } else if (ext === 'pdf') {
    content.innerHTML = `<iframe src="${filePath}" style="width:100%;height:480px;border:none;border-radius:4px;"></iframe>`;
  } else {
    content.innerHTML = `
      <div style="padding:40px;color:#64748b;">
        <i data-lucide="file" width="48" height="48" style="margin-bottom:12px;opacity:0.5;"></i>
        <p style="margin:0 0 12px;">Preview not directly available for this format.</p>
        <a href="${filePath}" target="_blank" class="btn btn-primary">Download Document</a>
      </div>
    `;
  }

  modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeViewerModal() {
  document.getElementById('docViewerModal').style.display = 'none';
  document.getElementById('viewerContent').innerHTML = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function showToastMessage(msg, type) {
  if (typeof showToast === 'function') {
    showToast(msg, type);
  } else {
    alert(msg);
  }
}
