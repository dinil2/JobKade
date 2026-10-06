// js/kyc.js — Dedicated 4-Document Worker KYC Verification Client

document.addEventListener('DOMContentLoaded', function () {
  const token = (typeof getAuthToken === 'function') ? getAuthToken() : (localStorage.getItem('jobkade_token') || '');
  const user = (typeof requireAuth === 'function') ? requireAuth('worker') : null;
  if (!user) return;

  // 1. Profile & Session Info
  const workerName = user.name || user.full_name || 'Kasun Perera';
  const initials = workerName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'KP';

  const $id = id => document.getElementById(id);
  if ($id('sidebarUserName')) $id('sidebarUserName').textContent = workerName;
  if ($id('sidebarAvatar')) $id('sidebarAvatar').textContent = initials;
  if ($id('navAvatar')) $id('navAvatar').textContent = initials;

  const logoutBtn = $id('logoutBtn');
  if (logoutBtn && !logoutBtn.dataset.logoutBound) {
    logoutBtn.dataset.logoutBound = 'true';
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof logoutUser === 'function') {
        logoutUser();
      } else {
        ['jobkade_token', 'jodkade_logged_user', 'jobkade_user'].forEach(k => localStorage.removeItem(k));
        window.location.href = '../auth/login.html';
      }
    });
  }

  // 2. Constants & State
  const DOC_TYPES = ['nic', 'selfie', 'police_report', 'trade_certificate'];
  const REQUIRED_DOCS = [
    { key: 'nic', label: 'National ID (NIC)' },
    { key: 'selfie', label: 'Live Selfie' },
    { key: 'police_report', label: 'Police Clearance Report' }
  ];

  const selectedFiles = { nic: null, selfie: null, police_report: null, trade_certificate: null };
  const defaultTitles = {
    nic: 'National Identity Card (NIC)',
    selfie: 'Live Selfie holding NIC',
    police_report: 'Police Clearance Certificate',
    trade_certificate: 'NVQ Trade Qualification Certificate'
  };

  // 3. Helpers
  function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return str ? String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
  }

  function showToastMessage(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
    else alert(msg);
  }

  function showSubmitAlert(msg, type = 'error') {
    const alertBox = $id('submitAlertBox');
    if (!alertBox) return;
    alertBox.className = `kyc-submit-alert ${type}`;
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    alertBox.innerHTML = `<i data-lucide="${icon}" width="18" height="18" style="flex-shrink:0;"></i> <span>${escapeHtml(msg)}</span>`;
    alertBox.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function hideSubmitAlert() {
    const alertBox = $id('submitAlertBox');
    if (alertBox) {
      alertBox.style.display = 'none';
      alertBox.innerHTML = '';
    }
  }

  async function apiCall(endpoint, options = {}) {
    if (typeof apiFetch === 'function') {
      const res = await apiFetch(endpoint, options);
      return { ok: res.ok, data: res.data };
    }
    const cleanEndpoint = endpoint.startsWith('http') ? endpoint : ('../api/' + endpoint);
    const headers = Object.assign({}, options.headers || {}, { 'Authorization': 'Bearer ' + token });
    const rawRes = await fetch(cleanEndpoint, Object.assign({}, options, { headers }));
    const rawData = await rawRes.json();
    return { ok: rawRes.ok, data: rawData };
  }

  // 4. File Selection & Dropzone (Simplified: file name with checkmark, NO preview image)
  function handleFileSelect(type, file) {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = type === 'selfie' ? ['png', 'jpg', 'jpeg'] : ['pdf', 'png', 'jpg', 'jpeg'];

    if (!allowed.includes(ext)) {
      showToastMessage(`Invalid file format for ${defaultTitles[type]}. Allowed formats: ${allowed.join(', ').toUpperCase()}`, 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToastMessage('File size exceeds the 5MB limit. Please upload a smaller file.', 'error');
      return;
    }

    selectedFiles[type] = file;

    const dropzone = $id(`dropzone_${type}`);
    const previewBox = $id(`selectedPreview_${type}`);
    const fileName = $id(`fileName_${type}`);

    if (fileName) fileName.textContent = file.name;
    if (dropzone) dropzone.style.display = 'none';
    if (previewBox) previewBox.style.display = 'flex';

    hideSubmitAlert();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // 5. Card Component Setup
  function setupCard(type) {
    const dropzone = $id(`dropzone_${type}`);
    const fileInput = $id(`file_${type}`);
    const previewBox = $id(`selectedPreview_${type}`);
    const removeBtn = $id(`removeFile_${type}`);
    const form = $id(`form_${type}`);
    const replaceBtn = $id(`replaceBtn_${type}`);
    const uploadedView = $id(`uploadedView_${type}`);

    if (!fileInput) return;

    fileInput.addEventListener('click', e => e.stopPropagation());

    if (dropzone) {
      dropzone.addEventListener('click', e => { e.preventDefault(); fileInput.click(); });
      ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover');
      }));
      dropzone.addEventListener('drop', e => {
        if (e.dataTransfer?.files?.length) handleFileSelect(type, e.dataTransfer.files[0]);
      });
    }

    fileInput.addEventListener('change', e => {
      if (e.target.files?.length) handleFileSelect(type, e.target.files[0]);
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', e => {
        e.preventDefault();
        selectedFiles[type] = null;
        fileInput.value = '';
        if (previewBox) previewBox.style.display = 'none';
        if (dropzone) dropzone.style.display = 'flex';
      });
    }

    if (replaceBtn) {
      replaceBtn.addEventListener('click', e => {
        e.preventDefault();
        if (uploadedView) uploadedView.style.display = 'none';
        if (form) form.style.display = 'block';
        if (dropzone) dropzone.style.display = 'flex';
        if (previewBox) previewBox.style.display = 'none';
        selectedFiles[type] = null;
        fileInput.value = '';
      });
    }
  }

  DOC_TYPES.forEach(setupCard);

  // 6. Single Submit Documents Handler
  const submitAllBtn = $id('submitAllKycBtn');
  if (submitAllBtn) {
    submitAllBtn.addEventListener('click', handleSubmitAllDocuments);
  }

  async function handleSubmitAllDocuments() {
    hideSubmitAlert();

    // The single submit must be blocked unless all 3 required documents (nic, selfie, police_report) have a file selected
    const missing = REQUIRED_DOCS.filter(doc => !selectedFiles[doc.key]);
    if (missing.length > 0) {
      const missingNames = missing.map(doc => doc.label).join(', ');
      const errorMsg = `Please select all required documents before submitting. Missing: ${missingNames}`;
      showToastMessage(errorMsg, 'error');
      showSubmitAlert(errorMsg, 'error');
      return;
    }

    // Determine documents to upload (all selected files; optional trade_certificate uploaded if selected)
    const docsToUpload = DOC_TYPES.filter(type => selectedFiles[type] !== null);
    if (docsToUpload.length === 0) {
      showToastMessage('No documents selected for upload.', 'warning');
      return;
    }

    const submitBtn = $id('submitAllKycBtn');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Submit Documents';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="18" height="18"></i> <span>Uploading documents...</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    const errors = [];

    // Upload each selected file to api/kyc.php?action=upload one by one
    for (let i = 0; i < docsToUpload.length; i++) {
      const type = docsToUpload[i];
      const file = selectedFiles[type];
      const nameInput = $id(`name_${type}`);
      const docName = nameInput?.value?.trim() || defaultTitles[type];

      if (submitBtn) {
        submitBtn.innerHTML = `<i data-lucide="loader-2" class="spin" width="18" height="18"></i> <span>Uploading ${defaultTitles[type]} (${i + 1}/${docsToUpload.length})...</span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      const formData = new FormData();
      formData.append('document_type', type);
      formData.append('document_name', docName);
      formData.append('kyc_file', file);

      try {
        const res = await apiCall('kyc.php?action=upload', {
          method: 'POST',
          body: formData
        });

        if (!res.ok || !res.data || res.data.status !== 'success') {
          const msg = res.data?.message || 'Upload failed';
          errors.push(`${defaultTitles[type]}: ${msg}`);
        }
      } catch (err) {
        console.error(`Upload error (${type}):`, err);
        errors.push(`${defaultTitles[type]}: Network error`);
      }
    }

    if (errors.length === 0) {
      // Show one success message
      showToastMessage('Documents submitted successfully!', 'success');
      showSubmitAlert('Documents submitted successfully! Your verification credentials are now pending moderation.', 'success');

      // Clear selections and reset forms
      DOC_TYPES.forEach(type => {
        selectedFiles[type] = null;
        const fileInput = $id(`file_${type}`);
        if (fileInput) fileInput.value = '';
        const previewBox = $id(`selectedPreview_${type}`);
        if (previewBox) previewBox.style.display = 'none';
        const dropzone = $id(`dropzone_${type}`);
        if (dropzone) dropzone.style.display = 'flex';
      });

      // Refresh KYC status
      await loadKycStatus();
    } else {
      const errorMsg = 'Errors occurred during upload: ' + errors.join('; ');
      showToastMessage(errorMsg, 'error');
      showSubmitAlert(errorMsg, 'error');
      await loadKycStatus();
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  // 7. Status Loading & UI Population
  async function loadKycStatus() {
    try {
      const res = await apiCall('kyc.php?action=status');
      const data = (res.ok && res.data?.status === 'success') ? (res.data.data || res.data) : null;
      if (data) {
        populateCardsFromStatus(data);
        renderHistoryTable(data.documents || []);
      } else {
        renderHistoryTable([]);
      }
    } catch (err) {
      console.error('Failed to load KYC status:', err);
      renderHistoryTable([]);
    }
  }

  function populateCardsFromStatus(data) {
    const docs = data.documents || [];
    let uploadedCount = 0;

    const statusBadgeMap = {
      approved: { cls: 'badge-approved', text: 'Approved ✓' },
      rejected: { cls: 'badge-rejected', text: 'Rejected ⚠️' },
      pending:  { cls: 'badge-pending',  text: 'Pending Review ⏳' }
    };

    DOC_TYPES.forEach(type => {
      const doc = (type === 'nic')
        ? docs.find(d => d.document_type === 'nic' || d.document_type === 'driving_license')
        : docs.find(d => d.document_type === type);

      const card = $id(`card_${type}`);
      const badge = $id(`badge_${type}`);
      const form = $id(`form_${type}`);
      const uploadedView = $id(`uploadedView_${type}`);
      const rejectionBox = $id(`rejection_${type}`);
      const rejectionMsg = $id(`rejectionMsg_${type}`);
      const uploadedTitle = $id(`uploadedTitle_${type}`);
      const uploadedDate = $id(`uploadedDate_${type}`);

      if (doc) {
        uploadedCount++;
        if (card) card.classList.add('completed');

        const status = doc.status || 'pending';
        const badgeCfg = statusBadgeMap[status] || statusBadgeMap.pending;
        if (badge) { badge.className = 'badge ' + badgeCfg.cls; badge.textContent = badgeCfg.text; }

        if (status === 'rejected') {
          if (rejectionBox) {
            rejectionBox.style.display = 'flex';
            if (rejectionMsg) rejectionMsg.textContent = doc.admin_notes || doc.rejection_reason || 'Document did not meet verification criteria. Please re-upload.';
          }
        } else if (rejectionBox) {
          rejectionBox.style.display = 'none';
        }

        if (uploadedTitle) uploadedTitle.textContent = doc.document_name || defaultTitles[type];
        if (uploadedDate) {
          const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently';
          uploadedDate.textContent = `Uploaded: ${dateStr}`;
        }

        // Only show uploadedView if worker has not selected a new file
        if (form && !selectedFiles[type]) form.style.display = 'none';
        if (uploadedView && !selectedFiles[type]) uploadedView.style.display = 'flex';
      } else {
        if (card) card.classList.remove('completed');
        if (badge) { badge.className = 'badge badge-unsubmitted'; badge.textContent = 'Not Uploaded'; }
        if (rejectionBox) rejectionBox.style.display = 'none';
        if (form && !selectedFiles[type]) form.style.display = 'block';
        if (uploadedView && !selectedFiles[type]) uploadedView.style.display = 'none';
      }
    });

    // Progress Bar
    const percent = Math.round((uploadedCount / 4) * 100);
    const progressFill = $id('kycProgressFill');
    const progressStat = $id('kycProgressStat');
    if (progressFill) progressFill.style.width = percent + '%';
    if (progressStat) {
      progressStat.textContent = uploadedCount === 4 ? '4 of 4 Documents Uploaded (Complete! 🎉)' : `${uploadedCount} of 4 Documents Uploaded`;
      progressStat.style.color = uploadedCount >= 3 ? '#059669' : '#2563eb';
    }

    renderStatusCard(data, uploadedCount);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderStatusCard(data, count) {
    const card = $id('kycStatusCard');
    const icon = $id('kycStatusIcon');
    const title = $id('kycStatusTitle');
    const desc = $id('kycStatusDesc');
    const badge = $id('kycStatusBadge');
    if (!card) return;

    const docs = data.documents || [];
    const hasNic = docs.some(d => d.document_type === 'nic' || d.document_type === 'driving_license');
    const hasSelfie = docs.some(d => d.document_type === 'selfie');
    const hasPolice = docs.some(d => d.document_type === 'police_report');
    const requiredAllSubmitted = hasNic && hasSelfie && hasPolice;

    const states = {
      verified: {
        cls: 'kyc-status-card verified',
        icon: '<i data-lucide="shield-check" width="32" height="32" style="color:#059669;"></i>',
        title: 'Verified Professional Worker ✓',
        desc: 'All required verification credentials have been approved by administrators. You enjoy top marketplace ranking and official badge.',
        badgeCls: 'badge badge-approved', badgeText: 'Verified'
      },
      rejected: {
        cls: 'kyc-status-card rejected',
        icon: '<i data-lucide="alert-circle" width="32" height="32" style="color:#dc2626;"></i>',
        title: 'Action Required: Re-submission Needed ⚠️',
        desc: 'One or more of your documents were not approved. Check the feedback on the rejected card above, re-upload a clear file, and submit for re-review.',
        badgeCls: 'badge badge-rejected', badgeText: 'Rejected'
      },
      allSubmitted: {
        cls: 'kyc-status-card pending',
        icon: '<i data-lucide="clock" width="32" height="32" style="color:#d97706;"></i>',
        title: 'Documents Submitted — Under Review ⏳',
        desc: 'Your verification packet is currently being reviewed by administrators. Verifications typically conclude within 12–24 hours.',
        badgeCls: 'badge badge-pending', badgeText: 'Under Review'
      },
      partial: {
        cls: 'kyc-status-card unverified',
        icon: '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>',
        title: `Verification In Progress (${count} of 4 Documents Uploaded)`,
        desc: 'Please ensure all 3 required documents (National ID, Live Selfie, Police Report) are submitted so administrators can authenticate your profile.',
        badgeCls: 'badge badge-pending', badgeText: 'Partially Submitted'
      },
      none: {
        cls: 'kyc-status-card unverified',
        icon: '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>',
        title: 'Verification Required: Unverified Worker Profile',
        desc: 'Upload each of your required government identity records below to unlock customer inquiries and high-priority listing.',
        badgeCls: 'badge badge-unsubmitted', badgeText: 'Not Submitted'
      }
    };

    const s = data.verify_status === 'verified' ? states.verified
      : data.verify_status === 'rejected' ? states.rejected
      : requiredAllSubmitted ? states.allSubmitted
      : count > 0 ? states.partial : states.none;

    card.className = s.cls;
    icon.innerHTML = s.icon;
    title.textContent = s.title;
    desc.textContent = s.desc;
    badge.className = s.badgeCls;
    badge.textContent = s.badgeText;
  }

  function renderHistoryTable(docs) {
    const table = $id('kycHistoryTable');
    if (!table) return;

    if (!docs || docs.length === 0) {
      table.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;color:#64748b;padding:32px;">
            <i data-lucide="file-question" width="28" height="28" style="display:block;margin:0 auto 8px;opacity:0.5;"></i>
            No KYC documents submitted yet. Use the upload cards above to select and submit your credentials.
          </td>
        </tr>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    const typeLabels = {
      selfie: 'Live Verification Selfie',
      nic: 'National ID (NIC)',
      police_report: 'Police Clearance Report',
      driving_license: 'Driving License',
      trade_certificate: 'Educational & Trade Qualifications'
    };

    table.innerHTML = docs.map(doc => {
      const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '-';

      const typeLabel = typeLabels[doc.document_type] || doc.document_type.toUpperCase();
      const badgeCls = doc.status === 'approved' ? 'badge-approved' : (doc.status === 'rejected' ? 'badge-rejected' : 'badge-pending');
      const statusLabel = doc.status === 'approved' ? 'Approved' : (doc.status === 'rejected' ? 'Rejected' : 'Pending Review');

      return `
        <tr>
          <td><strong style="color:#0f172a;">${typeLabel}</strong></td>
          <td>${escapeHtml(doc.document_name || '-')}</td>
          <td style="font-size:0.85rem;color:#64748b;">${dateStr}</td>
          <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
          <td style="font-size:0.85rem;color:${doc.status === 'rejected' ? '#dc2626' : '#64748b'};">
            ${escapeHtml(doc.admin_notes || doc.rejection_reason || (doc.status === 'approved' ? 'Verified by Admin' : 'Under moderation'))}
          </td>
        </tr>`;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  loadKycStatus();
});
