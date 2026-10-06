// js/admin-kyc.js — Admin KYC Moderation Client

let currentTab = 'pending';
let allDocuments = [];
let pendingDocuments = [];
let currentDossierDocs = [];

// Reusable Admin API Helper
async function adminApi(endpoint, options = {}) {
  const token = localStorage.getItem('jobkade_token') || '';
  const url = endpoint.startsWith('http') ? endpoint : ('../api/admin.php?' + endpoint);
  const headers = Object.assign({
    'Authorization': 'Bearer ' + token
  }, options.headers || {});

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, Object.assign({}, options, { headers }));
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function escapeHtml(str) {
  return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
}

function showToastMessage(msg, type) {
  if (typeof showToast === 'function') showToast(msg, type);
  else alert(msg);
}

const $id = id => document.getElementById(id);

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async function () {
  const user = (typeof requireAuth === 'function') ? requireAuth('admin') : null;
  if (!user) return;

  if ($id('adminUserName')) $id('adminUserName').textContent = user.name || 'System Administrator';
  if ($id('adminNavAvatar')) {
    $id('adminNavAvatar').textContent = (user.name || 'Admin').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  document.querySelectorAll('#adminLogoutBtn, #sidebarLogoutBtn, .sidebar-logout-btn, .nav-logout-btn').forEach(btn => {
    if (btn.dataset.logoutBound) return;
    btn.dataset.logoutBound = 'true';
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (typeof logoutUser === 'function') {
        logoutUser();
      } else {
        ['jobkade_token', 'jodkade_logged_user', 'jobkade_user'].forEach(k => localStorage.removeItem(k));
        window.location.href = '../auth/login.html';
      }
    });
  });

  document.querySelectorAll('#kycTabs .tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#kycTabs .tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentTab = this.getAttribute('data-status') || 'pending';
      // Clicking any tab must always re-fetch fresh data and counts from server
      loadKycQueue();
      loadStats();
    });
  });

  $id('kycSearchInput')?.addEventListener('input', function () {
    filterAndRenderTable(this.value.toLowerCase().trim());
  });

  $id('refreshKycBtn')?.addEventListener('click', () => {
    loadStats();
    loadKycQueue();
  });

  $id('confirmRejectBtn')?.addEventListener('click', handleRejectConfirm);
  $id('dossierApproveBtn')?.addEventListener('click', handleDossierApprove);
  $id('dossierRejectBtn')?.addEventListener('click', handleDossierReject);

  loadStats();
  loadKycQueue();
});

// ----------------------------------------------------
// Stats & Queue Loading
// ----------------------------------------------------
async function loadStats() {
  try {
    const { ok, data } = await adminApi('action=stats');
    if (ok && data.status === 'success' && data.stats) {
      const pCount = Number(data.stats.pending_kyc ?? 0);
      const aCount = Number(data.stats.approved_kyc ?? data.stats.verified_workers ?? 0);
      const rCount = Number(data.stats.rejected_kyc ?? 0);

      if ($id('statPendingCount')) $id('statPendingCount').textContent = pCount;
      if ($id('statApprovedCount')) $id('statApprovedCount').textContent = aCount;
      if ($id('statRejectedCount')) $id('statRejectedCount').textContent = rCount;

      if ($id('tabPendingCount')) $id('tabPendingCount').textContent = pCount;
      if ($id('tabApprovedCount')) $id('tabApprovedCount').textContent = aCount;
      if ($id('tabRejectedCount')) $id('tabRejectedCount').textContent = rCount;

      if ($id('pendingCounterBadge')) $id('pendingCounterBadge').textContent = pCount;
    }
  } catch (err) {
    console.error('Failed to load admin stats:', err);
  }
}

async function loadKycQueue() {
  const tbody = $id('kycTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#64748b;">Loading verification records...</td></tr>';

  try {
    const endpoint = (currentTab === 'pending') ? 'action=kyc/pending' : `action=kyc/list&status=${currentTab}`;
    const { ok, data } = await adminApi(endpoint);

    if (ok && data.status === 'success') {
      allDocuments = data.pending_kyc || data.documents || [];
      const count = allDocuments.length;

      // Ensure tab and stat counts stay accurately synchronized with server count
      if (currentTab === 'pending') {
        pendingDocuments = allDocuments;
        if ($id('tabPendingCount')) $id('tabPendingCount').textContent = count;
        if ($id('statPendingCount')) $id('statPendingCount').textContent = count;
        if ($id('pendingCounterBadge')) $id('pendingCounterBadge').textContent = count;
      } else if (currentTab === 'approved') {
        if ($id('tabApprovedCount')) $id('tabApprovedCount').textContent = count;
        if ($id('statApprovedCount')) $id('statApprovedCount').textContent = count;
      } else if (currentTab === 'rejected') {
        if ($id('tabRejectedCount')) $id('tabRejectedCount').textContent = count;
        if ($id('statRejectedCount')) $id('statRejectedCount').textContent = count;
      }

      filterAndRenderTable($id('kycSearchInput')?.value?.toLowerCase()?.trim() || '');
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#dc2626;">Failed to load records.</td></tr>';
    }
  } catch (err) {
    console.error('Error fetching KYC queue:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#dc2626;">Network error occurred while fetching records.</td></tr>';
  }
}

function filterAndRenderTable(query) {
  const thead = $id('kycTableHead');
  if (thead) {
    if (currentTab === 'pending') {
      thead.innerHTML = `
        <tr>
          <th>Worker</th>
          <th>Trade Category</th>
          <th>Document Type</th>
          <th>Document Title / Ref</th>
          <th>Submitted</th>
          <th>Document File</th>
          <th style="text-align:right;">Actions</th>
        </tr>`;
    } else {
      thead.innerHTML = `
        <tr>
          <th>Worker & Contact</th>
          <th>Document Type</th>
          <th>Document Title / Ref</th>
          <th>Submitted Date</th>
          <th>Reviewed Date</th>
          <th>Status</th>
          <th>Admin Notes / Rejection Reason</th>
        </tr>`;
    }
  }

  const tbody = $id('kycTableBody');
  if (!tbody) return;

  const docs = query
    ? allDocuments.filter(d => ['worker_name', 'worker_phone', 'document_name', 'categories'].some(k => (d[k] || '').toLowerCase().includes(query)))
    : allDocuments;

  if (docs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:36px;color:#64748b;">
          <i data-lucide="check-circle-2" width="32" height="32" style="display:block;margin:0 auto 8px;opacity:0.5;color:#10b981;"></i>
          No ${currentTab} KYC documents found in queue.
        </td>
      </tr>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const typeLabels = {
    nic: 'National ID (NIC)',
    police_report: 'Police Clearance Report',
    selfie: 'Live Verification Selfie',
    driving_license: 'Driving License',
    trade_certificate: 'Trade Certification / NVQ'
  };

  tbody.innerHTML = docs.map(doc => {
    const kycId = doc.kyc_id || doc.id;
    const workerId = doc.worker_id;
    const submittedDateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    const reviewedDateStr = doc.reviewed_at ? new Date(doc.reviewed_at).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    const typeLabel = typeLabels[doc.document_type] || (doc.document_type || '').toUpperCase();
    const rawPath = doc.file_path || doc.document_path || '#';
    const cleanFilePath = rawPath.startsWith('http') ? rawPath : ('../' + rawPath);
    const workerNameEsc = escapeHtml(doc.worker_name || 'Worker #' + workerId);
    const workerContactHtml = `
      <div style="font-weight:600;color:#0f172a;">${workerNameEsc}</div>
      <div style="font-size:0.75rem;color:#64748b;">
        ${escapeHtml(doc.worker_phone || '')}${doc.worker_phone && doc.worker_email ? ' &bull; ' : ''}${escapeHtml(doc.worker_email || '')}
      </div>`;

    const docIcon = doc.document_type === 'selfie' ? '<i data-lucide="camera" width="14" height="14" style="color:#2563eb;"></i>'
      : doc.document_type === 'police_report' ? '<i data-lucide="file-check-2" width="14" height="14" style="color:#059669;"></i>'
      : doc.document_type === 'nic' ? '<i data-lucide="id-card" width="14" height="14" style="color:#0284c7;"></i>' : '';

    if (currentTab === 'pending') {
      return `
        <tr>
          <td>${workerContactHtml}</td>
          <td><span style="font-size:0.8rem;background:#f1f5f9;padding:3px 8px;border-radius:4px;color:#334155;">${escapeHtml(doc.categories || 'General')}</span></td>
          <td><span style="font-weight:600;font-size:0.85rem;color:#1e293b;display:inline-flex;align-items:center;gap:5px;">${docIcon} ${typeLabel}</span></td>
          <td style="font-size:0.85rem;color:#475569;">${escapeHtml(doc.document_name || '-')}</td>
          <td style="font-size:0.8rem;color:#64748b;">${submittedDateStr}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="openViewerModal('${cleanFilePath}', '${workerNameEsc}', '${typeLabel}', '${submittedDateStr}')" style="font-size:0.75rem;padding:4px 8px;display:inline-flex;align-items:center;gap:4px;">
              <i data-lucide="eye" width="14" height="14"></i> View File
            </button>
          </td>
          <td style="text-align:right;">
            <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
              <button class="btn-packet" onclick="openWorkerDossier(${workerId}, '${workerNameEsc}')" title="Inspect Police Report, Selfie & ID together">
                <i data-lucide="shield-check" width="14" height="14"></i> Review Packet
              </button>
              <button class="btn-approve" onclick="handleApprove(${kycId}, '${workerNameEsc}')">
                <i data-lucide="check" width="14" height="14"></i> Approve
              </button>
              <button class="btn-reject" onclick="openRejectModal(${kycId}, '${workerNameEsc}')">
                <i data-lucide="x" width="14" height="14"></i> Reject
              </button>
            </div>
          </td>
        </tr>`;
    } else {
      // Approved and Rejected tabs show details only: each row must display only information, no documents and no buttons.
      const isApproved = doc.status === 'approved';
      const badgeCls = isApproved ? 'badge-approved' : 'badge-rejected';
      const badgeIcon = isApproved ? 'check-circle' : 'x-circle';
      const badgeText = isApproved ? 'Approved & Verified' : 'Rejected';
      const adminNotesEsc = escapeHtml(doc.admin_notes || '-');

      return `
        <tr>
          <td>${workerContactHtml}</td>
          <td><span style="font-weight:600;font-size:0.85rem;color:#1e293b;display:inline-flex;align-items:center;gap:5px;">${docIcon} ${typeLabel}</span></td>
          <td style="font-size:0.85rem;color:#475569;">${escapeHtml(doc.document_name || '-')}</td>
          <td style="font-size:0.8rem;color:#64748b;">${submittedDateStr}</td>
          <td style="font-size:0.8rem;color:#64748b;">${reviewedDateStr}</td>
          <td>
            <span class="badge ${badgeCls}" style="display:inline-flex;align-items:center;gap:4px;">
              <i data-lucide="${badgeIcon}" width="13" height="13"></i> ${badgeText}
            </span>
          </td>
          <td style="font-size:0.85rem;color:#475569;max-width:260px;line-height:1.4;">${adminNotesEsc}</td>
        </tr>`;
    }
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ----------------------------------------------------
// Single Document Approval & Rejection
// ----------------------------------------------------
async function handleApprove(kycId, workerName) {
  if (!confirm(`Are you sure you want to APPROVE KYC verification for ${workerName}? This will award the Verified Worker Badge and full bidding access.`)) {
    return;
  }

  // Instantly remove row from Pending tab for immediate UI feedback
  if (currentTab === 'pending') {
    allDocuments = allDocuments.filter(d => (d.kyc_id || d.id) !== kycId);
    filterAndRenderTable($id('kycSearchInput')?.value?.toLowerCase()?.trim() || '');
  }

  try {
    const { ok, data } = await adminApi('action=kyc/verify', {
      method: 'POST',
      body: JSON.stringify({ kyc_id: kycId, status: 'approved', notes: 'Identity verified successfully by administration.' })
    });

    if (ok && data.status === 'success') {
      showToastMessage(`KYC approved for ${workerName}! Worker status updated to Verified.`, 'success');
      await Promise.all([loadStats(), loadKycQueue()]);
    } else {
      showToastMessage(data.message || 'Failed to approve KYC.', 'error');
      await Promise.all([loadStats(), loadKycQueue()]);
    }
  } catch (err) {
    showToastMessage('Network error occurred while approving document.', 'error');
    await Promise.all([loadStats(), loadKycQueue()]);
  }
}

function openRejectModal(kycId, workerName) {
  if ($id('rejectKycId')) $id('rejectKycId').value = kycId;
  if ($id('rejectionReasonInput')) {
    $id('rejectionReasonInput').value = '';
    $id('rejectionReasonInput').focus();
  }
  if ($id('rejectReasonModal')) $id('rejectReasonModal').style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeRejectModal() {
  if ($id('rejectReasonModal')) $id('rejectReasonModal').style.display = 'none';
}

async function handleRejectConfirm() {
  const kycIdStr = $id('rejectKycId')?.value;
  const kycId = parseInt(kycIdStr, 10);
  const reason = $id('rejectionReasonInput')?.value?.trim();

  if (!reason) {
    alert('Please enter a rejection reason or feedback notes for the worker.');
    return;
  }

  const confirmBtn = $id('confirmRejectBtn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = 'Submitting...'; }

  // Instantly remove row from Pending tab for immediate UI feedback
  if (currentTab === 'pending') {
    allDocuments = allDocuments.filter(d => (d.kyc_id || d.id) !== kycId);
    filterAndRenderTable($id('kycSearchInput')?.value?.toLowerCase()?.trim() || '');
  }

  try {
    const { ok, data } = await adminApi('action=kyc/verify', {
      method: 'POST',
      body: JSON.stringify({ kyc_id: kycId, status: 'rejected', notes: reason })
    });

    if (ok && data.status === 'success') {
      showToastMessage('KYC submission marked as Rejected with feedback.', 'info');
      closeRejectModal();
      await Promise.all([loadStats(), loadKycQueue()]);
    } else {
      showToastMessage(data.message || 'Failed to reject KYC document.', 'error');
      await Promise.all([loadStats(), loadKycQueue()]);
    }
  } catch (err) {
    showToastMessage('Network error occurred while rejecting document.', 'error');
    await Promise.all([loadStats(), loadKycQueue()]);
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i data-lucide="x-circle" width="16" height="16"></i> Confirm Rejection';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

// ----------------------------------------------------
// Document Viewer Modal
// ----------------------------------------------------
function openViewerModal(filePath, workerName, docType, dateStr) {
  const modal = $id('docViewerModal');
  const content = $id('viewerContent');
  if (!modal || !content) return;

  if ($id('viewerDocWorker')) $id('viewerDocWorker').textContent = 'Worker: ' + workerName;
  if ($id('viewerDocDetails')) $id('viewerDocDetails').textContent = `${docType} | Submitted: ${dateStr}`;
  if ($id('viewerDownloadBtn')) $id('viewerDownloadBtn').href = filePath;

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
      </div>`;
  }

  modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeViewerModal() {
  if ($id('docViewerModal')) $id('docViewerModal').style.display = 'none';
  if ($id('viewerContent')) $id('viewerContent').innerHTML = '';
}

// ----------------------------------------------------
// Worker Dossier Modal (Police, Selfie & ID)
// ----------------------------------------------------
async function openWorkerDossier(workerId, workerName) {
  const modal = $id('workerDossierModal');
  const workerNameElem = $id('dossierWorkerName');
  const profileBar = $id('dossierProfileBar');
  const notesInput = $id('dossierAdminNotes');
  if ($id('dossierWorkerId')) $id('dossierWorkerId').value = workerId;

  if (workerNameElem) workerNameElem.innerHTML = `<i data-lucide="shield-check" width="22" height="22" style="color:#4f46e5;"></i> Verification Dossier: ${escapeHtml(workerName)}`;
  if (profileBar) profileBar.innerHTML = `<span style="color:#64748b;">Loading worker verification profile and documents...</span>`;
  if (notesInput) notesInput.value = 'National ID, Police Clearance report, Live selfie, and Educational qualifications verified. Credentials match records.';

  ['Nic', 'Police', 'Selfie', 'Edu'].forEach(type => {
    if ($id(`dossierBody${type}`)) $id(`dossierBody${type}`).innerHTML = `<span style="color:#94a3b8;font-size:0.85rem;">Fetching document...</span>`;
    if ($id(`badge${type}Status`)) {
      $id(`badge${type}Status`).className = 'badge badge-pending';
      $id(`badge${type}Status`).textContent = 'Loading';
    }
  });

  if (modal) modal.style.display = 'flex';
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    const { ok, data } = await adminApi(`action=kyc/packet&worker_id=${workerId}`);
    if (!ok || data.status !== 'success') {
      alert(data.message || 'Failed to load worker packet.');
      closeDossierModal();
      return;
    }

    const profile = data.profile || {};
    currentDossierDocs = data.documents || [];

    const isVerified = (profile.verify_status === 'verified' || profile.is_verified == 1);
    const statusBadgeClass = isVerified ? 'badge-approved' : (profile.verify_status === 'rejected' ? 'badge-rejected' : 'badge-pending');
    const statusText = isVerified ? 'Verified Worker' : (profile.verify_status === 'rejected' ? 'Verification Rejected' : 'Verification Pending');

    if (profileBar) {
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
        </div>`;
    }

    populateDossierCard('Nic', currentDossierDocs.find(d => d.document_type === 'nic' || d.document_type === 'driving_license'), 'National ID / Driving License');
    populateDossierCard('Police', currentDossierDocs.find(d => d.document_type === 'police_report'), 'Police Clearance Report');
    populateDossierCard('Selfie', currentDossierDocs.find(d => d.document_type === 'selfie'), 'Live Verification Selfie');
    populateDossierCard('Edu', currentDossierDocs.find(d => d.document_type === 'trade_certificate'), 'Educational / NVQ Qualification');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (err) {
    console.error('Error fetching packet:', err);
    if (profileBar) profileBar.innerHTML = `<span style="color:#dc2626;">Error loading dossier details. Please try again.</span>`;
  }
}

function populateDossierCard(type, doc, defaultTitle) {
  const bodyElem = $id(`dossierBody${type}`);
  const badgeElem = $id(`badge${type}Status`);
  const titleElem = $id(`dossierTitle${type}`);
  const zoomBtn = $id(`dossierZoom${type}`);
  if (!bodyElem || !badgeElem || !titleElem) return;

  if (!doc) {
    badgeElem.className = 'badge badge-rejected';
    badgeElem.textContent = 'Not Uploaded';
    titleElem.textContent = defaultTitle;
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;color:#94a3b8;border:2px dashed #cbd5e1;border-radius:var(--radius-md);width:90%;">
        <i data-lucide="alert-circle" width="36" height="36" style="margin-bottom:8px;opacity:0.6;color:#f59e0b;"></i>
        <p style="margin:0;font-size:0.82rem;font-weight:600;color:#64748b;">Not yet uploaded</p>
        <p style="margin:4px 0 0;font-size:0.75rem;color:#94a3b8;">Worker must provide this item</p>
      </div>`;
    if (zoomBtn) zoomBtn.style.display = 'none';
    return;
  }

  const status = doc.status || 'pending';
  const badgeClass = status === 'approved' ? 'badge-approved' : (status === 'rejected' ? 'badge-rejected' : 'badge-pending');
  badgeElem.className = `badge ${badgeClass}`;
  badgeElem.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  titleElem.textContent = doc.document_name || defaultTitle;

  const rawPath = doc.file_path || doc.document_path || '';
  const cleanPath = rawPath.startsWith('http') ? rawPath : ('../' + rawPath);
  const ext = cleanPath.split('.').pop().toLowerCase();

  if (zoomBtn) {
    zoomBtn.style.display = 'inline-block';
    zoomBtn.onclick = () => openViewerModal(cleanPath, doc.document_name || defaultTitle, defaultTitle, doc.created_at || 'Recent');
  }

  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    bodyElem.innerHTML = `
      <img src="${cleanPath}" class="dossier-preview-img" alt="${defaultTitle}" onclick="openViewerModal('${cleanPath}', '${escapeHtml(doc.document_name || defaultTitle)}', '${defaultTitle}', '${doc.created_at || ''}')" title="Click to view full resolution">
      <div style="font-size:0.75rem;color:#64748b;margin-top:6px;">Click image to enlarge</div>`;
  } else if (ext === 'pdf') {
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;background:#f1f5f9;border-radius:var(--radius-md);width:90%;cursor:pointer;" onclick="openViewerModal('${cleanPath}', '${escapeHtml(doc.document_name || defaultTitle)}', '${defaultTitle}', '${doc.created_at || ''}')">
        <i data-lucide="file-text" width="40" height="40" style="margin-bottom:8px;color:#dc2626;"></i>
        <p style="margin:0;font-size:0.85rem;font-weight:600;color:#1e293b;">PDF Clearance Document</p>
        <p style="margin:4px 0 0;font-size:0.75rem;color:#64748b;">Click to view in modal</p>
      </div>`;
  } else {
    bodyElem.innerHTML = `
      <div style="padding:24px 12px;background:#f1f5f9;border-radius:var(--radius-md);width:90%;">
        <i data-lucide="file" width="36" height="36" style="margin-bottom:8px;color:#4f46e5;"></i>
        <p style="margin:0;font-size:0.82rem;font-weight:600;color:#1e293b;">Document File</p>
        <a href="${cleanPath}" target="_blank" class="btn btn-sm btn-outline" style="margin-top:6px;font-size:0.75rem;">Download</a>
      </div>`;
  }
}

async function handleDossierApprove() {
  const workerIdStr = $id('dossierWorkerId')?.value;
  const workerId = parseInt(workerIdStr, 10);
  const notes = $id('dossierAdminNotes')?.value?.trim();
  if (!workerId) return;

  if (!confirm('Are you sure you want to APPROVE this worker? This will verify their National ID, Police Report, and Live Selfie, and award the Verified Worker Badge.')) {
    return;
  }

  const approveBtn = $id('dossierApproveBtn');
  if (approveBtn) { approveBtn.disabled = true; approveBtn.innerHTML = 'Verifying & Approving...'; }

  // Instantly remove worker's documents from Pending tab if currently viewing Pending
  if (currentTab === 'pending') {
    allDocuments = allDocuments.filter(d => parseInt(d.worker_id, 10) !== workerId);
    filterAndRenderTable($id('kycSearchInput')?.value?.toLowerCase()?.trim() || '');
  }

  try {
    const { ok, data } = await adminApi('action=kyc/verify', {
      method: 'POST',
      body: JSON.stringify({
        worker_id: workerId,
        verify_packet: true,
        status: 'approved',
        notes: notes || 'National ID, Police report, and Live selfie all verified and approved.'
      })
    });

    if (ok && data.status === 'success') {
      showToastMessage('Worker verification packet approved! Verified Worker badge awarded.', 'success');
      closeDossierModal();
      await Promise.all([loadStats(), loadKycQueue()]);
    } else {
      showToastMessage(data.message || 'Failed to approve verification packet.', 'error');
      await Promise.all([loadStats(), loadKycQueue()]);
    }
  } catch (err) {
    showToastMessage('Network error occurred while approving packet.', 'error');
    await Promise.all([loadStats(), loadKycQueue()]);
  } finally {
    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.innerHTML = '<i data-lucide="check-circle-2" width="16" height="16"></i> Approve Worker & Award Verified Badge';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

async function handleDossierReject() {
  const workerIdStr = $id('dossierWorkerId')?.value;
  const workerId = parseInt(workerIdStr, 10);
  let notes = $id('dossierAdminNotes')?.value?.trim();
  if (!workerId) return;

  if (!notes || notes.includes('verified and confirmed')) {
    notes = prompt('Please specify why this worker verification packet is being rejected (e.g., Selfie face does not match ID, Police report expired, etc.):');
    if (!notes) return;
  }

  const rejectBtn = $id('dossierRejectBtn');
  if (rejectBtn) { rejectBtn.disabled = true; rejectBtn.innerHTML = 'Rejecting...'; }

  // Instantly remove worker's documents from Pending tab if currently viewing Pending
  if (currentTab === 'pending') {
    allDocuments = allDocuments.filter(d => parseInt(d.worker_id, 10) !== workerId);
    filterAndRenderTable($id('kycSearchInput')?.value?.toLowerCase()?.trim() || '');
  }

  try {
    const { ok, data } = await adminApi('action=kyc/verify', {
      method: 'POST',
      body: JSON.stringify({
        worker_id: workerId,
        verify_packet: true,
        status: 'rejected',
        notes: notes
      })
    });

    if (ok && data.status === 'success') {
      showToastMessage('Worker verification packet rejected with feedback.', 'info');
      closeDossierModal();
      await Promise.all([loadStats(), loadKycQueue()]);
    } else {
      showToastMessage(data.message || 'Failed to reject verification packet.', 'error');
      await Promise.all([loadStats(), loadKycQueue()]);
    }
  } catch (err) {
    showToastMessage('Network error occurred while rejecting packet.', 'error');
    await Promise.all([loadStats(), loadKycQueue()]);
  } finally {
    if (rejectBtn) {
      rejectBtn.disabled = false;
      rejectBtn.innerHTML = '<i data-lucide="x-circle" width="16" height="16"></i> Reject Packet';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

function closeDossierModal() {
  if ($id('workerDossierModal')) $id('workerDossierModal').style.display = 'none';
}

// Window Globals for HTML inline handlers
window.openWorkerDossier = openWorkerDossier;
window.closeDossierModal = closeDossierModal;
window.openViewerModal = openViewerModal;
window.closeViewerModal = closeViewerModal;
window.openRejectModal = openRejectModal;
window.closeRejectModal = closeRejectModal;
window.handleApprove = handleApprove;
