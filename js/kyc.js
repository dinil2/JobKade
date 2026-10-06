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
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      ['jobkade_token', 'jodkade_logged_user', 'jobkade_user'].forEach(k => localStorage.removeItem(k));
      window.location.href = '../auth/login.html';
    });
  }

  // 2. Constants & State
  const DOC_TYPES = ['nic', 'selfie', 'police_report', 'trade_certificate'];
  const selectedFiles = { nic: null, selfie: null, police_report: null, trade_certificate: null };
  const defaultTitles = {
    nic: 'National Identity Card (NIC)',
    selfie: 'Live Selfie holding NIC',
    police_report: 'Police Clearance Certificate',
    trade_certificate: 'NVQ Trade Qualification Certificate'
  };

  const actionLabels = {
    selfie: 'Upload Live Selfie',
    police_report: 'Upload Police Report',
    trade_certificate: 'Upload Qualification',
    nic: 'Upload National ID'
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

  function resetSubmitButton(type) {
    const btn = $id(`submit_${type}`);
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="upload" width="14" height="14"></i> ${actionLabels[type] || 'Upload Document'}`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // 4. File Selection & Dropzone
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
    const thumbImg = $id(`thumb_${type}`);
    const fileIcon = $id(`fileIcon_${type}`);
    const fileName = $id(`fileName_${type}`);
    const fileSize = $id(`fileSize_${type}`);
    const submitBtn = $id(`submit_${type}`);

    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatBytes(file.size);

    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = e => {
        if (thumbImg) { thumbImg.src = e.target.result; thumbImg.style.display = 'block'; }
        if (fileIcon) fileIcon.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      if (thumbImg) thumbImg.style.display = 'none';
      if (fileIcon) fileIcon.style.display = 'flex';
    }

    if (dropzone) dropzone.style.display = 'none';
    if (previewBox) previewBox.style.display = 'flex';
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check" width="14" height="14"></i> Upload Selected File';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // 5. Card Component Setup
  function setupCard(type) {
    const dropzone = $id(`dropzone_${type}`);
    const fileInput = $id(`file_${type}`);
    const previewBox = $id(`selectedPreview_${type}`);
    const removeBtn = $id(`removeFile_${type}`);
    const form = $id(`form_${type}`);
    const submitBtn = $id(`submit_${type}`);
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
        resetSubmitButton(type);
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
        resetSubmitButton(type);
      });
    }

    async function triggerUpload() {
      const file = selectedFiles[type] || (fileInput.files?.length ? fileInput.files[0] : null);
      if (!file) {
        showToastMessage(`Please choose a file for ${defaultTitles[type]}.`, 'warning');
        fileInput.click();
        return;
      }

      const nameInput = $id(`name_${type}`);
      const docName = nameInput?.value?.trim() || defaultTitles[type];

      const formData = new FormData();
      formData.append('document_type', type);
      formData.append('document_name', docName);
      formData.append('kyc_file', file);

      const origHtml = submitBtn ? submitBtn.innerHTML : 'Upload';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="14" height="14"></i> Uploading...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        const res = await apiCall('kyc.php?action=upload', { method: 'POST', body: formData });
        if (res.ok && res.data && res.data.status === 'success') {
          showToastMessage(res.data.message || `${defaultTitles[type]} uploaded successfully!`, 'success');
          selectedFiles[type] = null;
          fileInput.value = '';
          if (previewBox) previewBox.style.display = 'none';
          if (dropzone) dropzone.style.display = 'flex';
          resetSubmitButton(type);
          await loadKycStatus();
        } else {
          showToastMessage(res.data?.message || 'Upload failed. Please check file format and try again.', 'error');
        }
      } catch (err) {
        console.error(`Upload error (${type}):`, err);
        showToastMessage('Network error occurred while uploading. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origHtml;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    }

    if (submitBtn) submitBtn.addEventListener('click', e => { e.preventDefault(); triggerUpload(); });
    if (form) form.addEventListener('submit', e => { e.preventDefault(); triggerUpload(); });
  }

  DOC_TYPES.forEach(setupCard);

  // 6. Status Loading & UI Population
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
      const uploadedLink = $id(`uploadedLink_${type}`);
      const uploadedThumb = $id(`uploadedThumb_${type}`);

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

        const rawPath = doc.file_path || doc.document_path || '#';
        const fileUrl = rawPath.startsWith('http') ? rawPath : ('../' + rawPath);
        const ext = fileUrl.split('.').pop().toLowerCase();

        if (uploadedTitle) uploadedTitle.textContent = doc.document_name || defaultTitles[type];
        if (uploadedDate) {
          const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recently';
          uploadedDate.textContent = `Uploaded: ${dateStr}`;
        }
        if (uploadedLink) uploadedLink.href = fileUrl;

        if (uploadedThumb) {
          uploadedThumb.innerHTML = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
            ? `<img src="${fileUrl}" class="kyc-preview-thumb" alt="Document Preview">`
            : `<div style="width:48px;height:48px;background:#fee2e2;border-radius:6px;display:flex;align-items:center;justify-content:center;">
                 <i data-lucide="file-text" width="24" height="24" style="color:#dc2626;"></i>
               </div>`;
        }

        if (form && !selectedFiles[type]) form.style.display = 'none';
        if (uploadedView && !selectedFiles[type]) uploadedView.style.display = 'flex';
      } else {
        if (card) card.classList.remove('completed');
        if (badge) { badge.className = 'badge badge-unsubmitted'; badge.textContent = 'Not Uploaded'; }
        if (rejectionBox) rejectionBox.style.display = 'none';
        if (form) form.style.display = 'block';
        if (uploadedView) uploadedView.style.display = 'none';
      }
    });

    // Progress Bar
    const percent = Math.round((uploadedCount / 4) * 100);
    const progressFill = $id('kycProgressFill');
    const progressStat = $id('kycProgressStat');
    if (progressFill) progressFill.style.width = percent + '%';
    if (progressStat) {
      progressStat.textContent = uploadedCount === 4 ? '4 of 4 Documents Uploaded (Complete! 🎉)' : `${uploadedCount} of 4 Documents Uploaded`;
      progressStat.style.color = uploadedCount === 4 ? '#059669' : '#2563eb';
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

    const states = {
      verified: {
        cls: 'kyc-status-card verified',
        icon: '<i data-lucide="shield-check" width="32" height="32" style="color:#059669;"></i>',
        title: 'Verified Professional Worker ✓',
        desc: 'All 4 verification credentials have been approved by administrators. You enjoy top marketplace ranking and official badge.',
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
        title: 'All 4 Documents Submitted — Under Review ⏳',
        desc: 'Your complete KYC packet (National ID, Selfie, Police Clearance, and Qualifications) is currently being reviewed by administrators. Verifications typically conclude within 12–24 hours.',
        badgeCls: 'badge badge-pending', badgeText: 'Under Review'
      },
      partial: {
        cls: 'kyc-status-card unverified',
        icon: '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>',
        title: `Verification In Progress (${count} of 4 Documents Uploaded)`,
        desc: 'Please complete uploading all 4 documents (National ID, Live Selfie, Police Report, and Educational Qualifications) so administrators can authenticate your profile.',
        badgeCls: 'badge badge-pending', badgeText: 'Partially Submitted'
      },
      none: {
        cls: 'kyc-status-card unverified',
        icon: '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>',
        title: 'Verification Required: Unverified Worker Profile',
        desc: 'Upload each of your 4 government identity and qualification records below to unlock customer inquiries and high-priority listing.',
        badgeCls: 'badge badge-unsubmitted', badgeText: 'Not Submitted'
      }
    };

    const s = data.verify_status === 'verified' ? states.verified
      : data.verify_status === 'rejected' ? states.rejected
      : count === 4 ? states.allSubmitted
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
          <td colspan="6" style="text-align:center;color:#64748b;padding:32px;">
            <i data-lucide="file-question" width="28" height="28" style="display:block;margin:0 auto 8px;opacity:0.5;"></i>
            No KYC documents submitted yet. Use the 4 upload cards above to submit your credentials.
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

      const filePath = doc.file_path || doc.document_path || '#';
      const fileLink = filePath.startsWith('http') ? filePath : ('../' + filePath);

      return `
        <tr>
          <td><strong style="color:#0f172a;">${typeLabel}</strong></td>
          <td>${escapeHtml(doc.document_name || '-')}</td>
          <td>
            <a href="${fileLink}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline" style="font-size:0.75rem;padding:3px 8px;display:inline-flex;align-items:center;gap:4px;">
              <i data-lucide="external-link" width="12" height="12"></i> View File
            </a>
          </td>
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
