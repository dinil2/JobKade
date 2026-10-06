// js/kyc.js — Dedicated 4-Document Worker KYC Verification Client

document.addEventListener('DOMContentLoaded', function () {
  const token = (typeof getAuthToken === 'function') ? getAuthToken() : '';
  // Shared auth guard (js/main.js): redirects to login unless a worker session exists
  const user = (typeof requireAuth === 'function') ? requireAuth('worker') : null;
  if (!user) return;

  // Populate user profile info in navbar/sidebar
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const navAvatar = document.getElementById('navAvatar');

  const workerName = user.name || user.full_name || 'Kasun Perera';
  const initials = workerName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'KP';

  if (sidebarUserName) sidebarUserName.textContent = workerName;
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (navAvatar) navAvatar.textContent = initials;

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.removeItem('jobkade_token');
      localStorage.removeItem('jodkade_logged_user');
      localStorage.removeItem('jobkade_user');
      window.location.href = '../auth/login.html';
    });
  }

  const DOC_TYPES = ['nic', 'selfie', 'police_report', 'trade_certificate'];
  const selectedFiles = {
    nic: null,
    selfie: null,
    police_report: null,
    trade_certificate: null
  };

  const defaultTitles = {
    nic: 'National Identity Card (NIC)',
    selfie: 'Live Selfie holding NIC',
    police_report: 'Police Clearance Certificate',
    trade_certificate: 'NVQ Trade Qualification Certificate'
  };

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function setupCard(type) {
    const dropzone = document.getElementById(`dropzone_${type}`);
    const fileInput = document.getElementById(`file_${type}`);
    const previewBox = document.getElementById(`selectedPreview_${type}`);
    const removeBtn = document.getElementById(`removeFile_${type}`);
    const form = document.getElementById(`form_${type}`);
    const submitBtn = document.getElementById(`submit_${type}`);
    const replaceBtn = document.getElementById(`replaceBtn_${type}`);
    const uploadedView = document.getElementById(`uploadedView_${type}`);

    if (!fileInput) return;

    // Stop propagation so file picker click doesn't trigger parent clicks
    fileInput.addEventListener('click', (e) => e.stopPropagation());

    // Click dropzone to choose file
    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      // Drag and drop events
      ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleFileSelect(type, dt.files[0]);
        }
      });
    }

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(type, e.target.files[0]);
      }
    });

    // Remove chosen file before submit
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        selectedFiles[type] = null;
        fileInput.value = '';
        if (previewBox) previewBox.style.display = 'none';
        if (dropzone) dropzone.style.display = 'flex';
        resetSubmitButton(type);
      });
    }

    // Replace / Re-upload button
    if (replaceBtn) {
      replaceBtn.addEventListener('click', (e) => {
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

    // Unified Upload Trigger
    async function triggerUpload() {
      const file = selectedFiles[type] || (fileInput.files && fileInput.files.length > 0 ? fileInput.files[0] : null);

      // If user hasn't selected a file yet, open the file picker directly!
      if (!file) {
        showToastMessage(`Please choose a file for ${defaultTitles[type]}.`, 'warning');
        fileInput.click();
        return;
      }

      const nameInput = document.getElementById(`name_${type}`);
      const docName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : defaultTitles[type];

      const formData = new FormData();
      formData.append('document_type', type);
      formData.append('document_name', docName);
      formData.append('kyc_file', file);

      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Upload';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="14" height="14"></i> Uploading...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        let result = null;

        // Use universal apiFetch if available
        if (typeof apiFetch === 'function') {
          const apiRes = await apiFetch('kyc.php?action=upload', {
            method: 'POST',
            body: formData
          });
          result = { ok: apiRes.ok, data: apiRes.data };
        } else {
          // Direct fetch fallback
          const rawRes = await fetch('../api/kyc.php?action=upload', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token
            },
            body: formData
          });
          const rawData = await rawRes.json();
          result = { ok: rawRes.ok, data: rawData };
        }

        if (result && result.ok && result.data && result.data.status === 'success') {
          showToastMessage(result.data.message || `${defaultTitles[type]} uploaded successfully!`, 'success');
          selectedFiles[type] = null;
          fileInput.value = '';
          if (previewBox) previewBox.style.display = 'none';
          if (dropzone) dropzone.style.display = 'flex';
          resetSubmitButton(type);
          await loadKycStatus();
        } else {
          const errMsg = (result && result.data && result.data.message) ? result.data.message : 'Upload failed. Please check file format and try again.';
          showToastMessage(errMsg, 'error');
        }
      } catch (err) {
        console.error(`Upload error (${type}):`, err);
        showToastMessage('Network error occurred while uploading. Please try again.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    }

    // Attach to submit button click
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerUpload();
      });
    }

    // Attach to form submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerUpload();
      });
    }
  }

  function resetSubmitButton(type) {
    const submitBtn = document.getElementById(`submit_${type}`);
    if (!submitBtn) return;
    const actionLabel = type === 'selfie' ? 'Upload Live Selfie' : (type === 'police_report' ? 'Upload Police Report' : (type === 'trade_certificate' ? 'Upload Qualification' : 'Upload National ID'));
    submitBtn.innerHTML = `<i data-lucide="upload" width="14" height="14"></i> ${actionLabel}`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

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

    const dropzone = document.getElementById(`dropzone_${type}`);
    const previewBox = document.getElementById(`selectedPreview_${type}`);
    const thumbImg = document.getElementById(`thumb_${type}`);
    const fileIcon = document.getElementById(`fileIcon_${type}`);
    const fileName = document.getElementById(`fileName_${type}`);
    const fileSize = document.getElementById(`fileSize_${type}`);
    const submitBtn = document.getElementById(`submit_${type}`);

    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatBytes(file.size);

    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (thumbImg) {
          thumbImg.src = e.target.result;
          thumbImg.style.display = 'block';
        }
        if (fileIcon) fileIcon.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      if (thumbImg) thumbImg.style.display = 'none';
      if (fileIcon) fileIcon.style.display = 'flex';
    }

    if (dropzone) dropzone.style.display = 'none';
    if (previewBox) previewBox.style.display = 'flex';

    if (submitBtn) {
      submitBtn.innerHTML = `<i data-lucide="check" width="14" height="14"></i> Upload Selected File`;
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Initialize event listeners for all 4 cards
  DOC_TYPES.forEach(type => setupCard(type));

  // Load Status and populate 4 cards
  async function loadKycStatus() {
    try {
      let data = null;

      if (typeof apiFetch === 'function') {
        const res = await apiFetch('kyc.php?action=status');
        if (res.ok && res.data && res.data.status === 'success') {
          data = res.data.data;
        }
      } else {
        const rawRes = await fetch('../api/kyc.php?action=status', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const res = await rawRes.json();
        if (rawRes.ok && res.status === 'success') {
          data = res.data;
        }
      }

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

    DOC_TYPES.forEach(type => {
      let doc = null;
      if (type === 'nic') {
        doc = docs.find(d => d.document_type === 'nic' || d.document_type === 'driving_license');
      } else {
        doc = docs.find(d => d.document_type === type);
      }

      const card = document.getElementById(`card_${type}`);
      const badge = document.getElementById(`badge_${type}`);
      const form = document.getElementById(`form_${type}`);
      const uploadedView = document.getElementById(`uploadedView_${type}`);
      const rejectionBox = document.getElementById(`rejection_${type}`);
      const rejectionMsg = document.getElementById(`rejectionMsg_${type}`);

      const uploadedTitle = document.getElementById(`uploadedTitle_${type}`);
      const uploadedDate = document.getElementById(`uploadedDate_${type}`);
      const uploadedLink = document.getElementById(`uploadedLink_${type}`);
      const uploadedThumb = document.getElementById(`uploadedThumb_${type}`);

      if (doc) {
        uploadedCount++;
        if (card) card.classList.add('completed');

        // Status Badge
        const status = doc.status || 'pending';
        if (badge) {
          if (status === 'approved') {
            badge.className = 'badge badge-approved';
            badge.textContent = 'Approved ✓';
          } else if (status === 'rejected') {
            badge.className = 'badge badge-rejected';
            badge.textContent = 'Rejected ⚠️';
          } else {
            badge.className = 'badge badge-pending';
            badge.textContent = 'Pending Review ⏳';
          }
        }

        // Rejection Alert
        if (status === 'rejected') {
          if (rejectionBox) {
            rejectionBox.style.display = 'flex';
            if (rejectionMsg) {
              rejectionMsg.textContent = doc.admin_notes || doc.rejection_reason || 'Document did not meet verification criteria. Please re-upload.';
            }
          }
        } else {
          if (rejectionBox) rejectionBox.style.display = 'none';
        }

        // Fill uploaded view details
        const rawPath = doc.file_path || doc.document_path || '#';
        const fileUrl = rawPath.startsWith('http') ? rawPath : ('../' + rawPath);
        const ext = fileUrl.split('.').pop().toLowerCase();

        if (uploadedTitle) uploadedTitle.textContent = doc.document_name || defaultTitles[type];
        if (uploadedDate) {
          const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
          }) : 'Recently';
          uploadedDate.textContent = `Uploaded: ${dateStr}`;
        }
        if (uploadedLink) uploadedLink.href = fileUrl;

        if (uploadedThumb) {
          if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            uploadedThumb.innerHTML = `<img src="${fileUrl}" class="kyc-preview-thumb" alt="Document Preview">`;
          } else {
            uploadedThumb.innerHTML = `
              <div style="width:48px;height:48px;background:#fee2e2;border-radius:6px;display:flex;align-items:center;justify-content:center;">
                <i data-lucide="file-text" width="24" height="24" style="color:#dc2626;"></i>
              </div>
            `;
          }
        }

        // Switch to uploaded view if not currently picking a replacement file
        if (form && !selectedFiles[type]) form.style.display = 'none';
        if (uploadedView && !selectedFiles[type]) uploadedView.style.display = 'flex';

      } else {
        if (card) card.classList.remove('completed');
        if (badge) {
          badge.className = 'badge badge-unsubmitted';
          badge.textContent = 'Not Uploaded';
        }
        if (rejectionBox) rejectionBox.style.display = 'none';
        if (form) form.style.display = 'block';
        if (uploadedView) uploadedView.style.display = 'none';
      }
    });

    // Update Progress Banner
    const progressFill = document.getElementById('kycProgressFill');
    const progressStat = document.getElementById('kycProgressStat');

    const percent = Math.round((uploadedCount / 4) * 100);
    if (progressFill) progressFill.style.width = percent + '%';
    if (progressStat) {
      if (uploadedCount === 4) {
        progressStat.textContent = '4 of 4 Documents Uploaded (Complete! 🎉)';
        progressStat.style.color = '#059669';
      } else {
        progressStat.textContent = `${uploadedCount} of 4 Documents Uploaded`;
        progressStat.style.color = '#2563eb';
      }
    }

    // Render Status Card
    renderStatusCard(data, uploadedCount);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderStatusCard(data, uploadedCount) {
    const card = document.getElementById('kycStatusCard');
    const icon = document.getElementById('kycStatusIcon');
    const title = document.getElementById('kycStatusTitle');
    const desc = document.getElementById('kycStatusDesc');
    const badge = document.getElementById('kycStatusBadge');

    if (!card) return;

    if (data.verify_status === 'verified') {
      card.className = 'kyc-status-card verified';
      icon.innerHTML = '<i data-lucide="shield-check" width="32" height="32" style="color:#059669;"></i>';
      title.textContent = 'Verified Professional Worker ✓';
      desc.textContent = 'All 4 verification credentials have been approved by administrators. You enjoy top marketplace ranking and official badge.';
      badge.className = 'badge badge-approved';
      badge.textContent = 'Verified';
    } else if (data.verify_status === 'rejected') {
      card.className = 'kyc-status-card rejected';
      icon.innerHTML = '<i data-lucide="alert-circle" width="32" height="32" style="color:#dc2626;"></i>';
      title.textContent = 'Action Required: Re-submission Needed ⚠️';
      desc.textContent = 'One or more of your documents were not approved. Check the feedback on the rejected card above, re-upload a clear file, and submit for re-review.';
      badge.className = 'badge badge-rejected';
      badge.textContent = 'Rejected';
    } else if (uploadedCount === 4) {
      card.className = 'kyc-status-card pending';
      icon.innerHTML = '<i data-lucide="clock" width="32" height="32" style="color:#d97706;"></i>';
      title.textContent = 'All 4 Documents Submitted — Under Review ⏳';
      desc.textContent = 'Your complete KYC packet (National ID, Selfie, Police Clearance, and Qualifications) is currently being reviewed by administrators. Verifications typically conclude within 12–24 hours.';
      badge.className = 'badge badge-pending';
      badge.textContent = 'Under Review';
    } else if (uploadedCount > 0) {
      card.className = 'kyc-status-card unverified';
      icon.innerHTML = '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>';
      title.textContent = `Verification In Progress (${uploadedCount} of 4 Documents Uploaded)`;
      desc.textContent = 'Please complete uploading all 4 documents (National ID, Live Selfie, Police Report, and Educational Qualifications) so administrators can authenticate your profile.';
      badge.className = 'badge badge-pending';
      badge.textContent = 'Partially Submitted';
    } else {
      card.className = 'kyc-status-card unverified';
      icon.innerHTML = '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>';
      title.textContent = 'Verification Required: Unverified Worker Profile';
      desc.textContent = 'Upload each of your 4 government identity and qualification records below to unlock customer inquiries and high-priority listing.';
      badge.className = 'badge badge-unsubmitted';
      badge.textContent = 'Not Submitted';
    }
  }

  function renderHistoryTable(docs) {
    const historyTable = document.getElementById('kycHistoryTable');
    if (!historyTable) return;

    if (!docs || docs.length === 0) {
      historyTable.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:#64748b;padding:32px;">
            <i data-lucide="file-question" width="28" height="28" style="display:block;margin:0 auto 8px;opacity:0.5;"></i>
            No KYC documents submitted yet. Use the 4 upload cards above to submit your credentials.
          </td>
        </tr>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    const typeLabels = {
      'selfie': 'Live Verification Selfie',
      'nic': 'National ID (NIC)',
      'police_report': 'Police Clearance Report',
      'driving_license': 'Driving License',
      'trade_certificate': 'Educational & Trade Qualifications'
    };

    historyTable.innerHTML = docs.map(doc => {
      const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '-';

      const typeLabel = typeLabels[doc.document_type] || doc.document_type.toUpperCase();
      let badgeClass = 'badge-pending';
      let statusLabel = 'Pending Review';

      if (doc.status === 'approved') {
        badgeClass = 'badge-approved';
        statusLabel = 'Approved';
      } else if (doc.status === 'rejected') {
        badgeClass = 'badge-rejected';
        statusLabel = 'Rejected';
      }

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
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td style="font-size:0.85rem;color:${doc.status === 'rejected' ? '#dc2626' : '#64748b'};">
            ${escapeHtml(doc.admin_notes || doc.rejection_reason || (doc.status === 'approved' ? 'Verified by Admin' : 'Under moderation'))}
          </td>
        </tr>
      `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
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

  // Initial load
  loadKycStatus();
});
