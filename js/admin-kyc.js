// js/admin-kyc.js — Admin KYC Moderation Client

let currentTab = 'pending';
let allDocuments = [];
let pendingDocuments = [];

document.addEventListener('DOMContentLoaded', async function () {
  let token = localStorage.getItem('jobkade_token');
  let user = null;

  try {
    user = JSON.parse(localStorage.getItem('jodkade_logged_user') || localStorage.getItem('jobkade_user') || 'null');
  } catch (e) {
    user = null;
  }

  // Verify authentic Admin authentication from database session
  if (!token || !user || (user.role || '').toLowerCase() !== 'admin') {
    window.location.href = '../auth/login.html?redirect=' + encodeURIComponent('admin/kyc.html');
    return;
  }

  // Admin user info in header and sidebar
  const adminUserName = document.getElementById('adminUserName');
  const adminNavAvatar = document.getElementById('adminNavAvatar');
  if (adminUserName) adminUserName.textContent = user.name || 'System Administrator';
  if (adminNavAvatar) {
    adminNavAvatar.textContent = (user.name || 'Admin').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  // Logout handler
  const logoutBtns = document.querySelectorAll('#adminLogoutBtn, .nav-logout-btn');
  logoutBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.removeItem('jobkade_token');
      localStorage.removeItem('jodkade_logged_user');
      window.location.href = '../auth/login.html';
    });
  });

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

  // Dossier verification buttons
  const dossierApproveBtn = document.getElementById('dossierApproveBtn');
  if (dossierApproveBtn) {
    dossierApproveBtn.addEventListener('click', handleDossierApprove);
  }

  const dossierRejectBtn = document.getElementById('dossierRejectBtn');
  if (dossierRejectBtn) {
    dossierRejectBtn.addEventListener('click', handleDossierReject);
  }

  // Initial Load
  loadStats();
  loadKycQueue();
});

// Load Overview Stats
async function loadStats() {
  const token = localStorage.getItem('jobkade_token');
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
  const token = localStorage.getItem('jobkade_token');
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
    'selfie': 'Live Verification Selfie',
    'driving_license': 'Driving License',
    'trade_certificate': 'Trade Certification / NVQ'
  };

  tbody.innerHTML = docs.map(doc => {
    const kycId = doc.kyc_id || doc.id;
    const workerId = doc.worker_id;
    const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    const typeLabel = typeLabels[doc.document_type] || (doc.document_type || '').toUpperCase();
    const filePath = doc.file_path || doc.document_path || '#';
    const cleanFilePath = filePath.startsWith('http') ? filePath : ('../' + filePath);

    let actionsHtml = '';
    if (currentTab === 'pending') {
      actionsHtml = `
        <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
          <button class="btn-packet" onclick="openWorkerDossier(${workerId}, '${escapeHtml(doc.worker_name)}')" title="Inspect Police Report, Selfie & ID together">
            <i data-lucide="shield-check" width="14" height="14"></i> Review Packet
          </button>
          <button class="btn-approve" onclick="handleApprove(${kycId}, '${escapeHtml(doc.worker_name)}')">
            <i data-lucide="check" width="14" height="14"></i> Approve
          </button>
          <button class="btn-reject" onclick="openRejectModal(${kycId}, '${escapeHtml(doc.worker_name)}')">
            <i data-lucide="x" width="14" height="14"></i> Reject
          </button>
        </div>
      `;
    } else if (doc.status === 'approved') {
      actionsHtml = `
        <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
          <button class="btn btn-sm btn-outline" onclick="openWorkerDossier(${workerId}, '${escapeHtml(doc.worker_name)}')" title="View complete verification dossier" style="font-size:0.75rem;padding:3px 8px;display:inline-flex;align-items:center;gap:4px;">
            <i data-lucide="shield-check" width="13" height="13"></i> Dossier
          </button>
          <span class="badge badge-approved">✓ Verified</span>
        </div>
      `;
    } else {
      actionsHtml = `
        <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
          <button class="btn btn-sm btn-outline" onclick="openWorkerDossier(${workerId}, '${escapeHtml(doc.worker_name)}')" title="View complete verification dossier" style="font-size:0.75rem;padding:3px 8px;display:inline-flex;align-items:center;gap:4px;">
            <i data-lucide="shield-check" width="13" height="13"></i> Dossier
          </button>
          <span class="badge badge-rejected" style="cursor:help;" title="${escapeHtml(doc.admin_notes || 'No reason specified')}">
            ✗ Rejected
          </span>
        </div>
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
        <td>
          <span style="font-weight:600;font-size:0.85rem;color:#1e293b;display:inline-flex;align-items:center;gap:5px;">
            ${doc.document_type === 'selfie' ? '<i data-lucide="camera" width="14" height="14" style="color:#2563eb;"></i>' : ''}
            ${doc.document_type === 'police_report' ? '<i data-lucide="file-check-2" width="14" height="14" style="color:#059669;"></i>' : ''}
            ${doc.document_type === 'nic' ? '<i data-lucide="id-card" width="14" height="14" style="color:#0284c7;"></i>' : ''}
            ${typeLabel}
          </span>
        </td>
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

  const token = localStorage.getItem('jobkade_token');
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

  const token = localStorage.getItem('jobkade_token');
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

// ----------------------------------------------------
// Worker Dossier Modal (Police Report, Selfie & ID)
// ----------------------------------------------------
let currentDossierDocs = [];

async function openWorkerDossier(workerId, workerName) {
  const token = localStorage.getItem('jobkade_token');
  const modal = document.getElementById('workerDossierModal');
  const workerNameElem = document.getElementById('dossierWorkerName');
  const profileBar = document.getElementById('dossierProfileBar');
  const notesInput = document.getElementById('dossierAdminNotes');
  document.getElementById('dossierWorkerId').value = workerId;

  workerNameElem.innerHTML = `<i data-lucide="shield-check" width="22" height="22" style="color:#4f46e5;"></i> Verification Dossier: ${escapeHtml(workerName)}`;
  profileBar.innerHTML = `<span style="color:#64748b;">Loading worker verification profile and documents...</span>`;
  notesInput.value = 'National ID, Police Clearance report, and Live Verification selfie verified. Identity matches government records.';

  // Show loading placeholders in cards
  ['Nic', 'Police', 'Selfie'].forEach(type => {
    document.getElementById(`dossierBody${type}`).innerHTML = `<span style="color:#94a3b8;font-size:0.85rem;">Fetching document...</span>`;
    document.getElementById(`badge${type}Status`).className = 'badge badge-pending';
    document.getElementById(`badge${type}Status`).textContent = 'Loading';
  });

  modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const res = await fetch(`../api/admin.php?action=kyc/packet&worker_id=${workerId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    if (!res.ok || data.status !== 'success') {
      alert(data.message || 'Failed to load worker packet.');
      closeDossierModal();
      return;
    }

    const profile = data.profile || {};
    currentDossierDocs = data.documents || [];

    // Profile Bar
    const isVerified = (profile.verify_status === 'verified' || profile.is_verified == 1);
    const statusBadgeClass = isVerified ? 'badge-approved' : (profile.verify_status === 'rejected' ? 'badge-rejected' : 'badge-pending');
    const statusText = isVerified ? 'Verified Worker' : (profile.verify_status === 'rejected' ? 'Verification Rejected' : 'Verification Pending');

    profileBar.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="avatar avatar-md avatar-purple">${escapeHtml((profile.full_name || workerName || 'W').substring(0, 2).toUpperCase())}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;font-size:1rem;">${escapeHtml(profile.full_name || workerName)}</div>
          <div style="font-size:0.8rem;color:#64748b;">
            <span>📞 ${escapeHtml(profile.phone || 'No phone')}</span> &bull; 
            <span>✉️ ${escapeHtml(profile.email || 'No email')}</span> &bull; 
            <span>📍 ${escapeHtml(profile.address || 'Sri Lanka')}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:0.85rem;background:#e2e8f0;padding:4px 10px;border-radius:20px;font-weight:600;color:#334155;">
          ${escapeHtml(profile.categories || 'Skilled Services')}
        </span>
        <span class="badge ${statusBadgeClass}">${statusText}</span>
      </div>
    `;

    // Map docs
    const nicDoc = currentDossierDocs.find(d => d.document_type === 'nic' || d.document_type === 'driving_license');
    const policeDoc = currentDossierDocs.find(d => d.document_type === 'police_report');
    const selfieDoc = currentDossierDocs.find(d => d.document_type === 'selfie');

    populateDossierCard('Nic', nicDoc, 'National ID / Driving License');
    populateDossierCard('Police', policeDoc, 'Police Clearance Report');
    populateDossierCard('Selfie', selfieDoc, 'Live Verification Selfie');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error('Error fetching packet:', err);
    profileBar.innerHTML = `<span style="color:#dc2626;">Error loading dossier details. Please try again.</span>`;
  }
}

function populateDossierCard(type, doc, defaultTitle) {
  const bodyElem = document.getElementById(`dossierBody${type}`);
  const badgeElem = document.getElementById(`badge${type}Status`);
  const titleElem = document.getElementById(`dossierTitle${type}`);
  const zoomBtn = document.getElementById(`dossierZoom${type}`);

  if (!doc) {
    badgeElem.className = 'badge badge-rejected';
    badgeElem.textContent = 'Not Uploaded';
    titleElem.textContent = defaultTitle;
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;color:#94a3b8;border:2px dashed #cbd5e1;border-radius:var(--radius-md);width:90%;">
        <i data-lucide="alert-circle" width="36" height="36" style="margin-bottom:8px;opacity:0.6;color:#f59e0b;"></i>
        <p style="margin:0;font-size:0.82rem;font-weight:600;color:#64748b;">Not yet uploaded</p>
        <p style="margin:4px 0 0;font-size:0.75rem;color:#94a3b8;">Worker must provide this item</p>
      </div>
    `;
    zoomBtn.style.display = 'none';
    return;
  }

  // Set badge
  const status = doc.status || 'pending';
  const badgeClass = status === 'approved' ? 'badge-approved' : (status === 'rejected' ? 'badge-rejected' : 'badge-pending');
  badgeElem.className = `badge ${badgeClass}`;
  badgeElem.textContent = status.charAt(0).toUpperCase() + status.slice(1);

  titleElem.textContent = doc.document_name || defaultTitle;
  zoomBtn.style.display = 'inline-block';

  const rawPath = doc.file_path || doc.document_path || '';
  const cleanPath = rawPath.startsWith('http') ? rawPath : ('../' + rawPath);
  const ext = cleanPath.split('.').pop().toLowerCase();

  zoomBtn.onclick = () => openViewerModal(cleanPath, doc.document_name || defaultTitle, defaultTitle, doc.created_at || 'Recent');

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    bodyElem.innerHTML = `
      <img src="${cleanPath}" class="dossier-preview-img" alt="${defaultTitle}" onclick="openViewerModal('${cleanPath}', '${escapeHtml(doc.document_name || defaultTitle)}', '${defaultTitle}', '${doc.created_at || ''}')" title="Click to view full resolution">
      <div style="font-size:0.75rem;color:#64748b;margin-top:6px;">Click image to enlarge</div>
    `;
  } else if (ext === 'pdf') {
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;background:#f1f5f9;border-radius:var(--radius-md);width:90%;cursor:pointer;" onclick="openViewerModal('${cleanPath}', '${escapeHtml(doc.document_name || defaultTitle)}', '${defaultTitle}', '${doc.created_at || ''}')">
        <i data-lucide="file-text" width="40" height="40" style="margin-bottom:8px;color:#dc2626;"></i>
        <p style="margin:0;font-size:0.85rem;font-weight:600;color:#1e293b;">PDF Clearance Document</p>
        <p style="margin:4px 0 0;font-size:0.75rem;color:#64748b;">Click to view in modal</p>
      </div>
    `;
  } else {
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;background:#f1f5f9;border-radius:var(--radius-md);width:90%;">
        <i data-lucide="file" width="36" height="36" style="margin-bottom:8px;color:#4f46e5;"></i>
        <p style="margin:0;font-size:0.82rem;font-weight:600;color:#1e293b;">Document File</p>
        <a href="${cleanPath}" target="_blank" class="btn btn-sm btn-outline" style="margin-top:6px;font-size:0.75rem;">Download</a>
      </div>
    `;
  }
}

async function handleDossierApprove() {
  const workerId = document.getElementById('dossierWorkerId').value;
  const notes = document.getElementById('dossierAdminNotes').value.trim();

  if (!workerId) return;

  if (!confirm('Are you sure you want to APPROVE this worker? This will verify their National ID, Police Report, and Live Selfie, and award the Verified Worker Badge.')) {
    return;
  }

  const approveBtn = document.getElementById('dossierApproveBtn');
  approveBtn.disabled = true;
  approveBtn.innerHTML = 'Verifying & Approving...';

  const token = localStorage.getItem('jobkade_token');
  try {
    const res = await fetch('../api/admin.php?action=kyc/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        worker_id: parseInt(workerId, 10),
        verify_packet: true,
        status: 'approved',
        notes: notes || 'National ID, Police report, and Live selfie all verified and approved.'
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToastMessage('Worker verification packet approved! Verified Worker badge awarded.', 'success');
      closeDossierModal();
      loadStats();
      loadKycQueue();
    } else {
      showToastMessage(data.message || 'Failed to approve verification packet.', 'error');
    }
  } catch (err) {
    showToastMessage('Network error occurred while approving packet.', 'error');
  } finally {
    approveBtn.disabled = false;
    approveBtn.innerHTML = '<i data-lucide="check-circle-2" width="16" height="16"></i> Approve Worker & Award Verified Badge';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

async function handleDossierReject() {
  const workerId = document.getElementById('dossierWorkerId').value;
  let notes = document.getElementById('dossierAdminNotes').value.trim();

  if (!workerId) return;

  if (!notes || notes.includes('verified and confirmed')) {
    notes = prompt('Please specify why this worker verification packet is being rejected (e.g., Selfie face does not match ID, Police report expired, etc.):');
    if (!notes) return;
  }

  const rejectBtn = document.getElementById('dossierRejectBtn');
  rejectBtn.disabled = true;
  rejectBtn.innerHTML = 'Rejecting...';

  const token = localStorage.getItem('jobkade_token');
  try {
    const res = await fetch('../api/admin.php?action=kyc/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        worker_id: parseInt(workerId, 10),
        verify_packet: true,
        status: 'rejected',
        notes: notes
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToastMessage('Worker verification packet rejected with feedback.', 'info');
      closeDossierModal();
      loadStats();
      loadKycQueue();
    } else {
      showToastMessage(data.message || 'Failed to reject verification packet.', 'error');
    }
  } catch (err) {
    showToastMessage('Network error occurred while rejecting packet.', 'error');
  } finally {
    rejectBtn.disabled = false;
    rejectBtn.innerHTML = '<i data-lucide="x-circle" width="16" height="16"></i> Reject Packet';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function closeDossierModal() {
  document.getElementById('workerDossierModal').style.display = 'none';
}

window.openWorkerDossier = openWorkerDossier;
window.closeDossierModal = closeDossierModal;
window.openViewerModal = openViewerModal;
window.closeViewerModal = closeViewerModal;
window.openRejectModal = openRejectModal;
window.closeRejectModal = closeRejectModal;
window.handleApprove = handleApprove;

