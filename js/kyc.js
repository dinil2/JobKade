// js/kyc.js — Worker KYC Verification Client

document.addEventListener('DOMContentLoaded', function () {
  const token = localStorage.getItem('jobkade_token');
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('jodkade_logged_user') || 'null');
  } catch (e) {
    user = null;
  }

  // Guard: Worker KYC page requires authenticated worker session
  if (!token || !user || (user.role || '').toLowerCase() !== 'worker') {
    window.location.href = '../auth/login.html?redirect=' + encodeURIComponent('worker/kyc.html');
    return;
  }

  // Populate user profile info in navbar/sidebar
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const navAvatar = document.getElementById('navAvatar');

  const workerName = user.name || 'Kasun Perera';
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
      window.location.href = '../auth/login.html';
    });
  }

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('kycFile');
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');
  const previewDocIcon = document.getElementById('previewDocIcon');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const uploadForm = document.getElementById('kycUploadForm');
  const submitBtn = document.getElementById('submitKycBtn');
  const historyTable = document.getElementById('kycHistoryTable');

  // Quick Document Tabs & Presets
  const docTabs = document.querySelectorAll('.doc-tab-btn');
  const docTypeSelect = document.getElementById('docType');
  const docNameInput = document.getElementById('docName');
  const docTipText = document.getElementById('docTipText');
  const dropzoneIcon = document.getElementById('dropzoneIcon');
  const dropzoneMainText = document.getElementById('dropzoneMainText');

  const docPresets = {
    'selfie': {
      title: 'Live Selfie holding NIC',
      tip: '<strong>Selfie Requirement:</strong> Hold your National Identity Card (NIC) clearly next to your face in a well-lit room so administrators can match your facial identity.',
      icon: 'camera',
      mainText: 'Click to upload Live Selfie or drag & drop'
    },
    'nic': {
      title: 'National Identity Card (Front & Back)',
      tip: '<strong>NIC Requirement:</strong> Ensure both front and back of your official NIC are scanned or photographed clearly with all numbers readable.',
      icon: 'id-card',
      mainText: 'Click to upload NIC Document or drag & drop'
    },
    'police_report': {
      title: 'Police Clearance Certificate',
      tip: '<strong>Police Report Requirement:</strong> Upload an official Police Clearance Certificate issued by Sri Lanka Police within the last 6 months.',
      icon: 'shield-alert',
      mainText: 'Click to upload Police Report or drag & drop'
    }
  };

  function setDocTypePreset(type) {
    if (docTypeSelect) docTypeSelect.value = type;
    const preset = docPresets[type];
    if (preset) {
      if (docNameInput) docNameInput.value = preset.title;
      if (docTipText) docTipText.innerHTML = preset.tip;
      if (dropzoneIcon) dropzoneIcon.setAttribute('data-lucide', preset.icon);
      if (dropzoneMainText) dropzoneMainText.textContent = preset.mainText;
    }
    docTabs.forEach(b => {
      if (b.getAttribute('data-type') === type) {
        b.style.borderColor = 'var(--primary)';
        b.style.background = 'rgba(89,150,255,0.08)';
        b.style.color = 'var(--primary)';
      } else {
        b.style.borderColor = '#e2e8f0';
        b.style.background = 'white';
        b.style.color = '#475569';
      }
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  docTabs.forEach(btn => {
    btn.addEventListener('click', function() {
      const type = this.getAttribute('data-type');
      setDocTypePreset(type);
    });
  });

  if (docTypeSelect) {
    docTypeSelect.addEventListener('change', function() {
      setDocTypePreset(this.value);
    });
  }

  let selectedFile = null;

  // Dropzone click & drag events
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFileSelection(dt.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function handleFileSelection(file) {
    const allowed = ['pdf', 'png', 'jpg', 'jpeg'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!allowed.includes(ext)) {
      showToastMessage('Please select a PDF, PNG, JPG or JPEG file.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToastMessage('File size exceeds the 5MB limit. Please upload a smaller file.', 'error');
      return;
    }

    selectedFile = file;
    previewFileName.textContent = file.name;
    previewFileSize.textContent = formatBytes(file.size);

    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.style.display = 'block';
        previewDocIcon.style.display = 'none';
      };
      reader.readAsDataURL(file);
    } else {
      previewImage.style.display = 'none';
      previewDocIcon.style.display = 'block';
    }

    dropzone.style.display = 'none';
    previewContainer.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      previewContainer.style.display = 'none';
      dropzone.style.display = 'block';
    });
  }

  // Submit Handler
  if (uploadForm) {
    uploadForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (!selectedFile && (!fileInput.files || fileInput.files.length === 0)) {
        showToastMessage('Please select a document file to upload.', 'error');
        return;
      }

      const file = selectedFile || fileInput.files[0];
      const docType = document.getElementById('docType').value;
      const docName = document.getElementById('docName').value.trim();

      const formData = new FormData();
      formData.append('document_type', docType);
      formData.append('document_name', docName);
      formData.append('kyc_file', file);

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin" width="18" height="18"></i> Uploading...';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      try {
        const response = await fetch('../api/kyc.php?action=upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          },
          body: formData
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
          showToastMessage(data.message || 'Document uploaded successfully!', 'success');
          uploadForm.reset();
          selectedFile = null;
          previewContainer.style.display = 'none';
          dropzone.style.display = 'block';
          loadKycStatus();
        } else {
          showToastMessage(data.message || 'Upload failed. Please try again.', 'error');
        }
      } catch (err) {
        showToastMessage('Network error occurred. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="shield-check" width="18" height="18"></i> Submit for Verification';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // Load Status & History
  async function loadKycStatus() {
    try {
      const response = await fetch('../api/kyc.php?action=status', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });

      const res = await response.json();

      if (response.ok && res.status === 'success' && res.data) {
        renderStatusCard(res.data);
        renderHistoryTable(res.data.documents || []);
      } else {
        renderHistoryTable([]);
      }
    } catch (err) {
      console.error('Failed to load KYC status:', err);
      renderHistoryTable([]);
    }
  }

  function renderStatusCard(data) {
    const card = document.getElementById('kycStatusCard');
    const icon = document.getElementById('kycStatusIcon');
    const title = document.getElementById('kycStatusTitle');
    const desc = document.getElementById('kycStatusDesc');
    const badge = document.getElementById('kycStatusBadge');

    if (!card) return;

    card.className = 'kyc-status-card ' + (data.verify_status || 'unverified');

    if (data.verify_status === 'verified') {
      icon.innerHTML = '<i data-lucide="shield-check" width="32" height="32" style="color:#059669;"></i>';
      title.textContent = 'Verified Professional Worker ✓';
      desc.textContent = 'Your identity documents have been verified and approved by administrators. You have the verified badge and full priority marketplace access.';
      badge.className = 'badge badge-approved';
      badge.textContent = 'Verified';
    } else if (data.verify_status === 'pending') {
      icon.innerHTML = '<i data-lucide="clock" width="32" height="32" style="color:#d97706;"></i>';
      title.textContent = 'Verification Under Review ⏳';
      desc.textContent = 'Your identity document has been submitted and is currently being reviewed by administrators. Verifications typically take up to 24 hours.';
      badge.className = 'badge badge-pending';
      badge.textContent = 'Pending Review';
    } else if (data.verify_status === 'rejected') {
      icon.innerHTML = '<i data-lucide="alert-circle" width="32" height="32" style="color:#dc2626;"></i>';
      title.textContent = 'Action Required: Verification Rejected ⚠️';
      const lastDoc = (data.documents && data.documents.length > 0) ? data.documents[0] : null;
      const notes = lastDoc && lastDoc.admin_notes ? lastDoc.admin_notes : 'Document did not meet verification criteria.';
      desc.textContent = 'Your submission was not approved: "' + notes + '". Please review the guidelines below and re-submit a clear document.';
      badge.className = 'badge badge-rejected';
      badge.textContent = 'Rejected';
    } else {
      icon.innerHTML = '<i data-lucide="shield-alert" width="32" height="32" style="color:#2563eb;"></i>';
      title.textContent = 'Verification Required: Unverified Account';
      desc.textContent = 'Upload your government-issued ID (NIC, Driving License, or NVQ Certification) to unlock customer inquiries and verified status.';
      badge.className = 'badge badge-pending';
      badge.textContent = 'Not Submitted';
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function renderHistoryTable(docs) {
    if (!historyTable) return;

    if (!docs || docs.length === 0) {
      historyTable.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:#64748b;padding:32px;">
            <i data-lucide="file-question" width="28" height="28" style="display:block;margin:0 auto 8px;opacity:0.5;"></i>
            No KYC documents submitted yet. Use the form above to submit your first document.
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
      'trade_certificate': 'Trade Certification / NVQ'
    };

    historyTable.innerHTML = docs.map(doc => {
      const dateStr = doc.created_at ? new Date(doc.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '-';

      const typeLabel = typeLabels[doc.document_type] || doc.document_type.toUpperCase();
      const docIcon = doc.document_type === 'selfie' ? '<i data-lucide="camera" width="14" height="14" style="margin-right:4px;vertical-align:middle;color:var(--primary);"></i>' : (doc.document_type === 'police_report' ? '<i data-lucide="shield-alert" width="14" height="14" style="margin-right:4px;vertical-align:middle;color:#d97706;"></i>' : '<i data-lucide="id-card" width="14" height="14" style="margin-right:4px;vertical-align:middle;color:#2563eb;"></i>');
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
