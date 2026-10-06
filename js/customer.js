/* ==========================================
   JOBKADE — Customer Dashboard JavaScript
   Modern ES6+, DRY Architecture, Clean UI Handlers
   ========================================== */

// ---- Shared Utilities & Helpers ----
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const $id = id => document.getElementById(id);

const getInitials = (name = '') =>
  name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'C';

const formatLKR = amt =>
  'Rs. ' + parseFloat(amt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const refreshIcons = () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
};

const getCustomerUser = () => {
  try {
    return (typeof getLoggedInUser === 'function' ? getLoggedInUser() : null) ||
           JSON.parse(localStorage.getItem('jodkade_logged_user') || localStorage.getItem('jobkade_user') || 'null');
  } catch {
    return null;
  }
};

async function withBtnLoading(btn, loadingHtml, action) {
  if (!btn) return action();
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = loadingHtml;
  refreshIcons();
  try {
    return await action();
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
    refreshIcons();
  }
}

function updateAvatarsAcrossUI(imgUrl, initials) {
  $$('.sidebar.customer .avatar, .dashboard-nav-right .avatar, .avatar-nav').forEach(el => {
    if (imgUrl) {
      el.innerHTML = `<img src="${imgUrl}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else if (initials) {
      el.textContent = initials;
    }
  });
}

// ==========================================
// DOM Ready Controller
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const user = (typeof requireAuth === 'function') ? requireAuth('customer') : getCustomerUser();
  if (!user) return;

  const customerName = user.name || user.full_name || 'Customer';
  const firstName = customerName.split(' ')[0] || 'Customer';
  const initials = getInitials(customerName);

  const greetingEl = $id('greeting');
  if (greetingEl) greetingEl.textContent = `${typeof getGreeting === 'function' ? getGreeting() : 'Welcome'}, ${firstName} 👋`;

  const sidebarName = $('.sidebar.customer .sidebar-user-name');
  if (sidebarName) sidebarName.textContent = customerName;

  const savedAvatar = localStorage.getItem('jobkade_customer_avatar') || user.avatar;
  updateAvatarsAcrossUI(savedAvatar || null, savedAvatar ? null : initials);

  loadCustomerDashboardStats();
  initJobPostPage();
  initSavedWorkers();
  initJobStatusFilters();
  loadCustomerJobs();
  initCustomerInvoicePayment();
  initCustomerReviewModal();
  initCustomerProfile();
  refreshIcons();
});

// ==========================================
// 1. Job Post Form & Leaflet Location Map
// ==========================================
function initJobPostPage() {
  const form = $id('job-post-form');
  const imgUpload = $id('job-images');
  const previewGrid = $id('image-preview-grid');
  const mapContainer = $id('job-location-map');

  if (imgUpload && previewGrid) {
    imgUpload.addEventListener('change', () => {
      previewGrid.innerHTML = '';
      const files = [...imgUpload.files];
      if (files.length > 5) showToast('Maximum 5 images allowed. Only the first 5 will be uploaded.', 'info');

      files.slice(0, 5).forEach(file => {
        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
          showToast(`Invalid format for ${file.name}. Only JPG and PNG allowed.`, 'error');
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast(`File too large: ${file.name} exceeds 5MB.`, 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = e => {
          const item = document.createElement('div');
          item.className = 'image-preview-item';
          item.innerHTML = `<img src="${e.target.result}" alt="Preview"><span class="remove-img" onclick="this.parentElement.remove()">&times;</span>`;
          previewGrid.appendChild(item);
        };
        reader.readAsDataURL(file);
      });
    });
  }

  let curLat = 6.9271;
  let curLng = 79.8612;
  let jobMap = null;
  let jobMarker = null;

  function setCoords(lat, lng, reverseGeocode = false) {
    curLat = parseFloat(lat);
    curLng = parseFloat(lng);

    const latInput = $id('job-latitude');
    const lngInput = $id('job-longitude');
    const coordDisplay = $id('coord-display');

    if (latInput) latInput.value = curLat.toFixed(7);
    if (lngInput) lngInput.value = curLng.toFixed(7);
    if (coordDisplay) {
      coordDisplay.textContent = `${Math.abs(curLat).toFixed(5)}° ${curLat >= 0 ? 'N' : 'S'}, ${Math.abs(curLng).toFixed(5)}° ${curLng >= 0 ? 'E' : 'W'}`;
    }
    if (jobMarker) jobMarker.setLatLng([curLat, curLng]);

    if (reverseGeocode) {
      const statusEl = $id('geo-status-indicator');
      if (statusEl) statusEl.style.display = 'inline-block';

      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${curLat}&lon=${curLng}`)
        .then(res => res.json())
        .then(data => {
          if (data?.display_name && $id('job-location-address')) {
            const shortAddr = data.display_name.split(',').slice(0, 3).join(',').trim();
            $id('job-location-address').value = shortAddr || data.display_name;
          }
        })
        .catch(err => console.warn('Reverse geocoding error:', err))
        .finally(() => { if (statusEl) statusEl.style.display = 'none'; });
    }
  }

  if (mapContainer && typeof L !== 'undefined') {
    try {
      jobMap = L.map('job-location-map').setView([curLat, curLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(jobMap);

      jobMarker = L.marker([curLat, curLng], { draggable: true }).addTo(jobMap);
      jobMarker.bindPopup('<b>Selected Job Location</b><br>Drag me or click map to move').openPopup();

      jobMarker.on('dragend', e => setCoords(e.target.getLatLng().lat, e.target.getLatLng().lng, true));
      jobMap.on('click', e => {
        setCoords(e.latlng.lat, e.latlng.lng, true);
        jobMarker.openPopup();
      });

      setTimeout(() => jobMap?.invalidateSize(), 250);
    } catch (e) {
      console.warn('Leaflet map error:', e);
    }

    const btnUseLoc = $id('btn-use-location');
    btnUseLoc?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', 'error');
        return;
      }
      const statusEl = $id('geo-status-indicator');
      if (statusEl) statusEl.style.display = 'inline-block';
      btnUseLoc.disabled = true;

      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          setCoords(latitude, longitude, true);
          jobMap?.setView([latitude, longitude], 15);
          jobMarker?.openPopup();
          showToast('Location updated from your GPS!', 'success');
          if (statusEl) statusEl.style.display = 'none';
          btnUseLoc.disabled = false;
        },
        err => {
          console.warn('Geolocation error:', err);
          showToast('Unable to detect location. Please click on the map to set location.', 'error');
          if (statusEl) statusEl.style.display = 'none';
          btnUseLoc.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    const addrInput = $id('job-location-address');
    addrInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = addrInput.value.trim();
        if (!query) return;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Sri Lanka')}`);
          const data = await res.json();
          if (data?.length > 0) {
            const sLat = parseFloat(data[0].lat);
            const sLng = parseFloat(data[0].lon);
            setCoords(sLat, sLng, false);
            jobMap?.setView([sLat, sLng], 14);
            jobMarker?.openPopup();
            showToast(`Map centered to ${data[0].display_name.split(',')[0] || query}`, 'info');
          }
        } catch (err) {
          console.warn('Geocoding search error:', err);
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(form);

      const titleInput = $id('job-title') || form.querySelector('[name="job-title"]');
      const catSelect = $id('job-category') || form.querySelector('select');
      const descInput = $id('job-description') || form.querySelector('textarea');
      const locInput = $id('job-location-address');
      const latInput = $id('job-latitude');
      const lngInput = $id('job-longitude');

      const title = titleInput?.value.trim() || '';
      const desc = descInput?.value.trim() || '';
      const location = locInput?.value.trim() || '';
      const finalLat = latInput ? parseFloat(latInput.value) : curLat;
      const finalLng = lngInput ? parseFloat(lngInput.value) : curLng;

      let firstInvalid = null;
      if (!title || title.length < 3 || title.length > 150) { showFieldError(titleInput, 'Job title is required (3–150 characters).'); firstInvalid = firstInvalid || titleInput; }
      if (!catSelect?.value) { showFieldError(catSelect, 'Please select a service category.'); firstInvalid = firstInvalid || catSelect; }
      if (!desc || desc.length < 10 || desc.length > 3000) { showFieldError(descInput, 'Please provide a detailed description (10–3,000 characters).'); firstInvalid = firstInvalid || descInput; }
      if (!location || location.length < 2) { showFieldError(locInput, 'Please provide a valid location/address.'); firstInvalid = firstInvalid || locInput; }
      if (isNaN(finalLat) || finalLat < -90 || finalLat > 90 || isNaN(finalLng) || finalLng < -180 || finalLng > 180) {
        showToast('Please select a valid location on the map.', 'error');
        firstInvalid = firstInvalid || locInput;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        showToast('Please correct the highlighted fields.', 'error');
        return;
      }

      const catMap = { 'Electrical': 1, 'Plumbing': 2, 'AC Repair': 3, 'Painting': 4, 'Carpentry': 5, 'Masonry': 6, 'Cleaning': 7, 'Appliance Repair': 8, 'Other': 9 };
      let catId = parseInt(catSelect.value, 10);
      if (isNaN(catId) || catId <= 0) {
        const catText = catSelect.options[catSelect.selectedIndex]?.text;
        catId = catMap[catText] || 1;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      await withBtnLoading(submitBtn, '<i data-lucide="loader" class="spin" width="16" height="16"></i> Submitting...', async () => {
        try {
          const res = await apiFetch('jobs.php?action=create', {
            method: 'POST',
            body: JSON.stringify({ title, description: desc, category_id: catId, address: location, latitude: finalLat, longitude: finalLng })
          });

          if (res.ok && res.data?.status === 'success') {
            showToast(`Job request #${res.data.job_id || ''} posted successfully!`, 'success');
            setTimeout(() => { window.location.href = 'jobs.html'; }, 1000);
          } else {
            showToast(res.data?.message || 'Please log in as a customer to post a job.', 'error');
          }
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      });
    });
  }
}

// ==========================================
// 2. Saved Workers Management
// ==========================================
function initSavedWorkers() {
  const container = $id('saved-workers-container');
  if (!container) return;

  const user = getCustomerUser();
  if (!user?.id) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;background:var(--white);border-radius:12px;border:1px dashed var(--border);">
        <i data-lucide="lock" width="40" height="40" style="color:var(--text-muted);margin:0 auto 12px;display:block;"></i>
        <h3 style="font-size:1.125rem;font-weight:600;margin-bottom:8px;">Please Log In</h3>
        <p style="color:var(--text-secondary);max-width:400px;margin:0 auto 16px;font-size:0.875rem;">Log in to access your saved workers list.</p>
        <a href="../auth/login.html?redirect=customer/saved-workers.html" class="btn btn-primary btn-sm">Log In</a>
      </div>`;
    refreshIcons();
    return;
  }

  const key = `jobkade_saved_workers_${user.id}`;
  let savedList = [];
  try { savedList = JSON.parse(localStorage.getItem(key) || '[]'); } catch { savedList = []; }

  if (!Array.isArray(savedList) || savedList.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 24px; background: var(--white); border-radius: var(--radius-md); border: 1px dashed var(--border);">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: #FEE2E2; color: #EF4444; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
          <i data-lucide="heart-off" width="28" height="28"></i>
        </div>
        <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">No Saved Workers Yet</h3>
        <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto 24px; font-size: 0.875rem; line-height: 1.5;">
          You haven't saved any workers yet. Browse our directory of verified service professionals and save your favorites for quick access.
        </p>
        <a href="../workers.html" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 8px;">
          <i data-lucide="search" width="16" height="16"></i> Find Workers
        </a>
      </div>`;
    refreshIcons();
    return;
  }

  const avatarColors = ['avatar-blue', 'avatar-green', 'avatar-orange', 'avatar-purple', 'avatar-teal'];
  container.innerHTML = savedList.map((w, idx) => {
    let name = w.full_name || w.name || 'Skilled Worker';
    if (/^Worker\s+\d+_\d+$/i.test(name.trim())) {
      name = (w.profession || w.category_name) ? `${w.profession || w.category_name} Specialist` : 'Verified Worker';
    }
    const init = getInitials(name);
    const colorClass = avatarColors[Math.abs(parseInt(w.id || idx, 10)) % avatarColors.length];
    const rating = parseFloat(w.rating_avg || '5.0').toFixed(1);
    const isVerified = w.is_verified === true || w.is_verified == 1 || w.verify_status === 'verified';
    const catName = w.profession || w.category_name || 'Service Professional';
    const locName = w.address || w.location || 'Colombo, Western Province';
    const phoneNum = w.phone || '';
    const avatarSrc = w.avatar ? (w.avatar.startsWith('assets') ? `../${w.avatar}` : w.avatar) : '';

    return `
      <div class="saved-worker-card" data-worker-id="${w.id}">
        <button type="button" class="remove-saved-btn-top remove-saved-btn" title="Remove worker" data-worker-id="${w.id}" aria-label="Remove">
          <i data-lucide="x" width="16" height="16"></i>
        </button>
        <div class="saved-worker-card-header">
          <div class="saved-worker-avatar-wrap">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${name}" class="avatar" onerror="this.outerHTML='<div class=\\'avatar ${colorClass}\\'>${init}</div>'">`
              : `<div class="avatar ${colorClass}">${init}</div>`}
            ${isVerified ? '<span class="verified-badge-mini" title="Verified Professional"><i data-lucide="check" width="11" height="11"></i></span>' : ''}
          </div>
          <div class="saved-worker-headline">
            <h4 class="saved-worker-name" title="${name}">${name}</h4>
            <p class="saved-worker-profession">${catName}</p>
            <div class="saved-worker-rating-row">
              <span class="star-rating-pill"><i data-lucide="star" width="12" height="12"></i> ${rating}</span>
              <span class="rating-subtext">${isVerified ? 'Verified Pro' : 'Top Rated'}</span>
            </div>
          </div>
        </div>
        <div class="saved-worker-meta-row">
          <span class="meta-item"><i data-lucide="map-pin" width="13" height="13"></i> ${locName}</span>
          ${phoneNum ? `<span class="meta-item"><i data-lucide="phone" width="13" height="13"></i> ${phoneNum}</span>` : ''}
        </div>
        <div class="saved-worker-actions-bar">
          <a href="../worker-profile.html?id=${w.id}" class="btn btn-outline btn-sm btn-profile">View Profile</a>
          <a href="../messages.html?user_id=${w.user_id || w.id}" class="btn btn-primary btn-sm btn-action-icon" title="Message Worker">
            <i data-lucide="message-square" width="15" height="15"></i>
          </a>
          ${phoneNum ? `<a href="tel:${phoneNum}" class="btn btn-call btn-sm btn-action-icon" title="Call Worker"><i data-lucide="phone" width="15" height="15"></i></a>` : ''}
        </div>
      </div>`;
  }).join('');

  refreshIcons();
}

// Global Event Delegation for Saved Worker, Cancellations, Receipts, Reviews
let activeJobCard = null;
let currentReceiptDetails = null;

document.addEventListener('click', (e) => {
  const removeWorkerBtn = e.target.closest('.remove-saved-btn');
  if (removeWorkerBtn) {
    const card = removeWorkerBtn.closest('.saved-worker-card');
    const workerId = removeWorkerBtn.getAttribute('data-worker-id');
    const user = getCustomerUser();
    if (!card || !user) return;

    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      card.remove();
      const key = `jobkade_saved_workers_${user.id}`;
      try {
        const curr = JSON.parse(localStorage.getItem(key) || '[]').filter(it => String(it.id) !== String(workerId));
        localStorage.setItem(key, JSON.stringify(curr));
        if (curr.length === 0) initSavedWorkers();
      } catch {}
      showToast('Worker removed from saved list.', 'info');
    }, 250);
  }

  const cancelBtn = e.target.closest('.cancel-job-btn');
  if (cancelBtn) {
    activeJobCard = cancelBtn.closest('.job-card');
    openModal('cancel-job-modal');
  }

  const viewReceiptBtn = e.target.closest('.btn-view-receipt');
  if (viewReceiptBtn) {
    currentReceiptDetails = {
      invoice_id: viewReceiptBtn.dataset.invoiceId,
      job_id: viewReceiptBtn.dataset.jobId,
      worker_id: viewReceiptBtn.dataset.workerId,
      receipt_no: viewReceiptBtn.dataset.receiptNo,
      amount: viewReceiptBtn.dataset.amount,
      job_title: viewReceiptBtn.dataset.jobTitle,
      worker_name: viewReceiptBtn.dataset.workerName,
      date: viewReceiptBtn.dataset.date,
      method: viewReceiptBtn.dataset.method
    };
    showCustomerReceiptModal(currentReceiptDetails);
  }

  const openReviewBtn = e.target.closest('.btn-open-review');
  if (openReviewBtn) {
    openReviewWorkerModal({
      worker_id: openReviewBtn.dataset.workerId,
      job_id: openReviewBtn.dataset.jobId,
      worker_name: openReviewBtn.dataset.workerName,
      job_title: openReviewBtn.dataset.jobTitle
    });
  }

  const receiptReviewBtn = e.target.closest('#btn-receipt-leave-review');
  if (receiptReviewBtn && currentReceiptDetails) {
    closeModal('receipt-modal');
    openReviewWorkerModal({
      worker_id: currentReceiptDetails.worker_id,
      job_id: currentReceiptDetails.job_id,
      worker_name: currentReceiptDetails.worker_name,
      job_title: currentReceiptDetails.job_title
    });
  }
});

const confirmCancelBtn = $('#cancel-job-modal .btn-danger');
confirmCancelBtn?.addEventListener('click', () => {
  if (activeJobCard) {
    activeJobCard.setAttribute('data-status', 'cancelled');
    const badge = activeJobCard.querySelector('.badge');
    if (badge) {
      badge.className = 'badge badge-cancelled';
      badge.textContent = 'Cancelled';
    }
    showToast('Job request marked as cancelled.', 'info');
    closeModal('cancel-job-modal');
  }
});

// ==========================================
// 3. Status Filters & Customer Jobs List
// ==========================================
function initJobStatusFilters() {
  const filters = $$('.status-filter-btn');
  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      $$('#customer-jobs-container .job-card').forEach(job => {
        job.style.display = (filter === 'all' || job.dataset.status === filter) ? '' : 'none';
      });
    });
  });
}

async function loadCustomerJobs() {
  const container = $id('customer-jobs-container');
  if (!container || !window.location.pathname.includes('jobs.html')) return;

  try {
    const [jobsRes, invRes] = await Promise.all([
      apiFetch('jobs.php?action=customer'),
      apiFetch('jobs.php?action=invoices').catch(() => ({ ok: false }))
    ]);

    const invoicesByJobId = {};
    if (invRes?.ok && invRes.data?.invoices) {
      invRes.data.invoices.forEach(inv => { invoicesByJobId[inv.job_id] = inv; });
    }

    if (jobsRes.ok && jobsRes.data?.status === 'success' && jobsRes.data.jobs?.length > 0) {
      container.innerHTML = jobsRes.data.jobs.map(j => {
        const status = (j.status || 'open').toLowerCase();
        const statusBadgeMap = {
          completed: ['badge-completed', 'Completed'],
          in_progress: ['badge-progress', 'In Progress'],
          cancelled: ['badge-cancelled', 'Cancelled']
        };
        const [badgeClass, badgeLabel] = statusBadgeMap[status] || ['badge-open', 'Open'];
        const safeTitle = (j.title || 'Job Request').replace(/"/g, '&quot;');
        const inv = invoicesByJobId[j.id];

        let invoiceBanner = '';
        let payButton = '';
        let reviewButton = '';

        if (inv) {
          const rawAmt = inv.amount ?? inv.job_amount ?? 0;
          const invAmount = formatLKR(rawAmt).replace('Rs. ', '');
          const invStatus = inv.status || inv.payment_status;
          const safeNotes = (inv.notes || '').replace(/"/g, '&quot;');
          const workerName = inv.worker_name || 'Verified Skilled Worker';
          const workerId = inv.worker_id || 1;

          if (invStatus === 'pending') {
            invoiceBanner = `
              <div style="margin-top: 14px; padding: 12px 16px; background: linear-gradient(135deg, rgba(89,150,255,0.08), rgba(89,150,255,0.14)); border: 1.5px solid rgba(89,150,255,0.35); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div>
                  <div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; font-weight:700;"><i data-lucide="receipt" width="14" height="14" style="display:inline;vertical-align:middle;color:var(--primary);margin-right:4px;"></i> Worker Final Price Added</div>
                  <div style="font-size:1.15rem; font-weight:800; color:var(--primary); margin-top:2px;">Rs. ${invAmount} <span style="font-size:0.75rem; font-weight:500; color:var(--text-secondary);">&bull; by ${workerName}</span></div>
                  ${safeNotes ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Notes: <em>${safeNotes}</em></div>` : ''}
                </div>
                <span class="badge badge-warning" style="font-size:0.8rem; font-weight:700; padding:5px 10px;"><i data-lucide="clock" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> Payment Due</span>
              </div>`;
            payButton = `<button class="btn btn-primary btn-sm btn-pay-job-invoice" data-invoice-id="${inv.id}" data-amount="${rawAmt}" data-job-title="${safeTitle}" data-notes="${safeNotes}" style="font-weight:700;"><i data-lucide="credit-card" width="15" height="15"></i> Pay Rs. ${invAmount}</button>`;
          } else if (invStatus === 'paid') {
            const methodLabel = inv.payment_method === 'cash' ? 'Paid via Cash' : 'Paid Online (Mockup IPG)';
            invoiceBanner = `
              <div style="margin-top: 14px; padding: 12px 16px; background: rgba(102,187,106,0.08); border: 1.5px solid rgba(102,187,106,0.3); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div>
                  <div style="font-size:0.8rem; color:var(--success); text-transform:uppercase; letter-spacing:0.04em; font-weight:700;"><i data-lucide="check-circle" width="14" height="14" style="display:inline;vertical-align:middle;margin-right:4px;"></i> Invoice Settled</div>
                  <div style="font-size:1.15rem; font-weight:800; color:var(--success); margin-top:2px;">Rs. ${invAmount} <span style="font-size:0.75rem; font-weight:500; color:var(--text-secondary);">&bull; ${methodLabel}</span></div>
                </div>
                <span class="badge badge-success" style="font-size:0.8rem; font-weight:700; padding:5px 10px;"><i data-lucide="check" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> Paid & Completed</span>
              </div>`;
            payButton = `
              <button class="btn btn-outline btn-sm btn-view-receipt"
                data-invoice-id="${inv.id}" data-job-id="${j.id}" data-worker-id="${workerId}"
                data-receipt-no="${inv.receipt_number || `REC-JOB-${inv.id}`}" data-amount="${rawAmt}"
                data-job-title="${safeTitle}" data-worker-name="${workerName}"
                data-date="${inv.paid_at || j.created_at || 'Recently'}" data-method="${inv.payment_method || 'online'}">
                <i data-lucide="receipt" width="14" height="14"></i> View Digital Receipt
              </button>`;
            reviewButton = `
              <button class="btn btn-sm btn-open-review"
                data-job-id="${j.id}" data-worker-id="${workerId}" data-worker-name="${workerName}" data-job-title="${safeTitle}"
                style="background:#F59E0B; border-color:#F59E0B; color:#ffffff; font-weight:700; display:inline-flex; align-items:center; gap:5px;">
                <i data-lucide="star" width="14" height="14" style="fill:#ffffff;"></i> Rate &amp; Review Worker
              </button>`;
          }
        } else if (status === 'completed') {
          reviewButton = `
            <button class="btn btn-sm btn-open-review"
              data-job-id="${j.id}" data-worker-id="${j.worker_id || 1}" data-worker-name="Assigned Worker" data-job-title="${safeTitle}"
              style="background:#F59E0B; border-color:#F59E0B; color:#ffffff; font-weight:700; display:inline-flex; align-items:center; gap:5px;">
              <i data-lucide="star" width="14" height="14" style="fill:#ffffff;"></i> Rate Worker
            </button>`;
        }

        return `
          <div class="job-card" data-status="${status}" id="job-card-${j.id}">
            <div class="job-card-header"><h3 class="job-card-title">${j.title}</h3><span class="badge ${badgeClass}">${badgeLabel}</span></div>
            <div class="job-card-meta">
              <span><i data-lucide="map-pin" width="14" height="14"></i> ${j.address || 'Colombo'}</span>
              <span><i data-lucide="clock" width="14" height="14"></i> ${j.created_at || 'Recently'}</span>
              <span><i data-lucide="tag" width="14" height="14"></i> ${j.category_name || 'Service'}</span>
            </div>
            <p class="job-card-desc">${j.description}</p>
            ${invoiceBanner}
            <div class="job-card-actions" style="margin-top: 14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              ${payButton}
              ${reviewButton}
              <a href="../messages.html?job_id=${j.id}" class="btn btn-outline btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Messages</a>
              ${status === 'open' ? '<button class="btn btn-ghost btn-sm cancel-job-btn" style="color:var(--error);"><i data-lucide="x" width="14" height="14"></i> Cancel Request</button>' : ''}
            </div>
          </div>`;
      }).join('');
    } else {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <i data-lucide="file-text" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Job Requests Yet</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">You have not posted any service requests yet.</p>
          <a href="post-job.html" class="btn btn-primary"><i data-lucide="plus" width="16" height="16"></i> Post a Job Request</a>
        </div>`;
    }
    refreshIcons();
  } catch (err) {
    console.warn('loadCustomerJobs error:', err);
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding: 40px 16px;">
        <p style="color: var(--error);">Failed to load jobs. Please check your connection or log in.</p>
        <a href="../auth/login.html" class="btn btn-outline btn-sm mt-2">Log In</a>
      </div>`;
  }
}

// ==========================================
// 4. Invoice Payment & Receipt Modal
// ==========================================
function initCustomerInvoicePayment() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-pay-job-invoice');
    if (!btn) return;

    const invId = btn.dataset.invoiceId;
    const jobTitle = btn.dataset.jobTitle || 'Job Request';
    const amount = parseFloat(btn.dataset.amount || '0');
    const notes = btn.dataset.notes || '';

    if ($id('pay-inv-id')) $id('pay-inv-id').value = invId;
    if ($id('pay-inv-job-title')) $id('pay-inv-job-title').textContent = jobTitle;
    if ($id('pay-inv-amount')) $id('pay-inv-amount').textContent = formatLKR(amount);

    const notesRow = $id('pay-inv-notes-row');
    if (notesRow) {
      notesRow.style.display = notes ? 'block' : 'none';
      if ($id('pay-inv-notes')) $id('pay-inv-notes').textContent = notes;
    }

    const user = getCustomerUser();
    const cardNameInput = $id('mock-card-name');
    if (cardNameInput && (user?.name || user?.full_name)) {
      cardNameInput.value = (user.name || user.full_name).toUpperCase();
    }

    const cardBox = $id('mockup-card-fields');
    const onlineRadio = $id('radio-pay-online');
    const cashRadio = $id('radio-pay-cash');
    if (onlineRadio && cashRadio && cardBox) {
      onlineRadio.checked = true;
      cardBox.style.display = 'flex';
      onlineRadio.onchange = () => { if (onlineRadio.checked) cardBox.style.display = 'flex'; };
      cashRadio.onchange = () => { if (cashRadio.checked) cardBox.style.display = 'none'; };
    }

    const autofillBtn = $id('btn-autofill-demo-card');
    if (autofillBtn) {
      autofillBtn.onclick = (ev) => {
        ev.preventDefault();
        if ($id('mock-card-number')) $id('mock-card-number').value = '4532 8812 9043 2419';
        if ($id('mock-card-exp')) $id('mock-card-exp').value = '12/28';
        if ($id('mock-card-cvv')) $id('mock-card-cvv').value = '882';
        showToast('Demo card credentials auto-filled.', 'info');
      };
    }

    openModal('pay-invoice-modal');
    refreshIcons();
  });

  const form = $id('customer-pay-invoice-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invId = parseInt($id('pay-inv-id')?.value, 10);
    const method = form.querySelector('input[name="payment_method"]:checked')?.value || 'online';

    if (isNaN(invId) || invId <= 0) {
      showToast('Invalid invoice ID.', 'error');
      return;
    }

    const submitBtn = $id('btn-confirm-pay');
    const loadingText = method === 'online'
      ? '<i data-lucide="loader" width="16" height="16" class="spin"></i> Authorizing Mockup IPG Card...'
      : '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing Settlement...';

    await withBtnLoading(submitBtn, loadingText, async () => {
      try {
        if (method === 'online') await new Promise(r => setTimeout(r, 800));

        const res = await apiFetch('jobs.php?action=pay-invoice', {
          method: 'POST',
          body: JSON.stringify({ invoice_id: invId, payment_method: method })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('pay-invoice-modal');
          const jobTitle = $id('pay-inv-job-title')?.textContent || 'Home Service';
          const jobAmt = $id('pay-inv-amount')?.textContent.replace(/[^0-9.]/g, '') || 0;

          showToast(method === 'online' ? 'Mockup payment successful! Funds credited to worker wallet.' : 'Cash settlement confirmed! Commission settled.', 'success');

          currentReceiptDetails = {
            invoice_id: invId,
            receipt_no: res.data.receipt_number || `REC-JOB-${invId}`,
            amount: jobAmt,
            job_title: jobTitle,
            worker_name: res.data.worker_name || 'Verified Skilled Worker',
            worker_id: res.data.worker_id || 1,
            method,
            date: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          };

          showCustomerReceiptModal(currentReceiptDetails);
          loadCustomerJobs();
        } else {
          showToast(res.data?.message || 'Payment failed.', 'error');
        }
      } catch (err) {
        showToast('Payment error: ' + err.message, 'error');
      }
    });
  });
}

function showCustomerReceiptModal(details) {
  const user = getCustomerUser();
  const custName = user?.full_name || user?.name || 'Customer';

  const fieldMap = {
    'receipt-number': details.receipt_no || `REC-JOB-${details.invoice_id || '2026'}`,
    'receipt-amount-display': formatLKR(details.amount),
    'receipt-date': details.date || new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    'receipt-job-title': details.job_title || 'Service Job',
    'receipt-worker-name': details.worker_name || 'Verified Skilled Worker',
    'receipt-customer-name': custName
  };

  Object.entries(fieldMap).forEach(([id, val]) => {
    const el = $id(id);
    if (el) el.textContent = val;
  });

  const recBadge = $id('receipt-method-badge');
  if (recBadge) {
    const isCash = details.method === 'cash';
    recBadge.className = isCash ? 'badge badge-success' : 'badge badge-primary';
    recBadge.textContent = isCash ? 'Cash on Completion' : 'Online Card (Mockup IPG)';
  }

  const recNote = $id('receipt-commission-note');
  if (recNote) {
    recNote.textContent = details.method === 'cash'
      ? 'Cash collected in hand - Platform commission deducted from worker balance'
      : 'Net earnings credited to worker wallet - Platform commission retained';
  }

  openModal('receipt-modal');
  refreshIcons();
}

// ==========================================
// 5. Rate & Review Worker Feature
// ==========================================
function openReviewWorkerModal(info) {
  if (!$id('review-worker-modal')) return;

  if ($id('review-worker-id')) $id('review-worker-id').value = info.worker_id || 1;
  if ($id('review-job-id')) $id('review-job-id').value = info.job_id || '';
  if ($id('review-worker-name-display')) $id('review-worker-name-display').textContent = info.worker_name || 'Verified Skilled Worker';
  if ($id('review-job-title-display')) $id('review-job-title-display').textContent = info.job_title || 'Home Service Request';

  setStarRating(5);
  openModal('review-worker-modal');
  refreshIcons();
}

function setStarRating(rating) {
  const ratingInput = $id('review-rating-value');
  const ratingLabel = $id('star-rating-label');
  if (ratingInput) ratingInput.value = rating;

  const labels = { 1: '1 - Poor Service', 2: '2 - Fair Experience', 3: '3 - Satisfactory', 4: '4 - Very Good', 5: '5 - Excellent Service' };
  if (ratingLabel) ratingLabel.textContent = labels[rating] || `${rating} Stars`;

  $$('#star-rating-container .star-btn').forEach(btn => {
    const starVal = parseInt(btn.dataset.rating, 10);
    const isActive = starVal <= rating;
    btn.style.color = isActive ? '#F59E0B' : '#CBD5E1';
    btn.classList.toggle('active', isActive);
  });
}

function initCustomerReviewModal() {
  const container = $id('star-rating-container');
  if (container) {
    container.addEventListener('click', e => {
      const star = e.target.closest('.star-btn');
      if (star) setStarRating(parseInt(star.dataset.rating, 10));
    });

    container.addEventListener('mouseover', e => {
      const star = e.target.closest('.star-btn');
      if (star) {
        const hoverVal = parseInt(star.dataset.rating, 10);
        $$('#star-rating-container .star-btn').forEach(btn => {
          btn.style.color = parseInt(btn.dataset.rating, 10) <= hoverVal ? '#F59E0B' : '#CBD5E1';
        });
      }
    });

    container.addEventListener('mouseleave', () => {
      setStarRating(parseInt($id('review-rating-value')?.value || '5', 10));
    });
  }

  const commentBox = $id('review-comment');
  $$('#review-quick-tags .btn-tag').forEach(tagBtn => {
    tagBtn.addEventListener('click', () => {
      const tagText = tagBtn.dataset.tag;
      if (commentBox && tagText) {
        const currentVal = commentBox.value.trim();
        if (!currentVal.includes(tagText)) {
          commentBox.value = currentVal ? `${currentVal} • ${tagText}` : tagText;
        }
        tagBtn.style.background = '#FEF3C7';
        tagBtn.style.borderColor = '#F59E0B';
        tagBtn.style.color = '#B45309';
      }
    });
  });

  const reviewForm = $id('customer-review-form');
  reviewForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const workerId = parseInt($id('review-worker-id')?.value || '0', 10);
    const jobId = parseInt($id('review-job-id')?.value || '0', 10);
    const rating = parseInt($id('review-rating-value')?.value || '5', 10);
    const comment = $id('review-comment')?.value.trim() || '';

    if (!workerId || workerId <= 0) { showToast('Invalid worker selected.', 'error'); return; }
    if (!comment || comment.length < 5) { showToast('Please provide a short review comment (at least 5 characters).', 'error'); return; }

    const submitBtn = $id('btn-submit-review');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="16" height="16" class="spin"></i> Publishing...', async () => {
      try {
        const res = await apiFetch('reviews.php?action=create', {
          method: 'POST',
          body: JSON.stringify({ worker_id: workerId, job_id: jobId || null, rating, comment })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('review-worker-modal');
          showToast('Thank you! Your rating & review have been submitted.', 'success');

          if (jobId) {
            const card = $id(`job-card-${jobId}`);
            const btn = card?.querySelector('.btn-open-review');
            if (btn) {
              btn.outerHTML = `<span class="badge badge-success" style="font-weight:700; padding:6px 12px;"><i data-lucide="check" width="12" height="12"></i> Reviewed ★${rating}</span>`;
              refreshIcons();
            }
          }
        } else {
          showToast(res.data?.message || 'Failed to submit review.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });
}

// ==========================================
// 6. Customer Profile & Avatar
// ==========================================
async function initCustomerProfile() {
  const form = $id('customer-profile-form');
  if (!form || !window.location.pathname.includes('profile.html')) return;

  const nameInput = $id('customer-name-input');
  const phoneInput = $id('customer-phone-input');
  const emailInput = $id('customer-email-input');
  const addressInput = $id('customer-address-input');
  const nameHeading = $id('customer-profile-name-heading');
  const emailHeading = $id('customer-profile-email-heading');
  const avatarInitials = $id('customer-avatar-initials');
  const avatarImg = $id('customer-avatar-img');
  const photoUpload = $id('customer-photo-upload');

  const curUser = getCustomerUser();
  if (curUser) {
    const curName = curUser.full_name || curUser.name || '';
    if (curName) {
      if (nameInput) nameInput.value = curName;
      if (nameHeading) nameHeading.textContent = curName;
      if (avatarInitials) avatarInitials.textContent = getInitials(curName);
    }
    if (phoneInput && curUser.phone) phoneInput.value = curUser.phone;
    if (emailInput && curUser.email) {
      emailInput.value = curUser.email;
      if (emailHeading) emailHeading.textContent = curUser.email;
    }
    if (addressInput && curUser.address) addressInput.value = curUser.address;
  }

  const savedAvatar = localStorage.getItem('jobkade_customer_avatar') || curUser?.avatar;
  if (savedAvatar) {
    if (avatarImg) { avatarImg.src = savedAvatar; avatarImg.style.display = 'block'; }
    if (avatarInitials) avatarInitials.style.display = 'none';
    updateAvatarsAcrossUI(savedAvatar, null);
  } else {
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarInitials) {
      avatarInitials.style.display = 'flex';
      avatarInitials.textContent = getInitials(curUser?.name || curUser?.full_name || 'Customer');
    }
  }

  const triggerPhotoUpload = () => photoUpload?.click();
  $id('customer-avatar-clickable')?.addEventListener('click', triggerPhotoUpload);
  $id('customer-avatar-hint')?.addEventListener('click', triggerPhotoUpload);
  $id('btn-customer-camera-trigger')?.addEventListener('click', e => { e.stopPropagation(); triggerPhotoUpload(); });

  photoUpload?.addEventListener('change', () => {
    const file = photoUpload.files[0];
    if (!file) return;

    if (!file.type.match(/^image\//)) { showToast('Please select a valid image file (PNG, JPG, JPEG, WebP).', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image file size must be less than 5MB.', 'error'); return; }

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (avatarImg) { avatarImg.src = dataUrl; avatarImg.style.display = 'block'; }
      if (avatarInitials) avatarInitials.style.display = 'none';

      try {
        localStorage.setItem('jobkade_customer_avatar', dataUrl);
        const sUser = JSON.parse(localStorage.getItem('jobkade_user') || 'null');
        if (sUser) {
          sUser.avatar = dataUrl;
          localStorage.setItem('jobkade_user', JSON.stringify(sUser));
        }
      } catch (err) {
        console.warn('Could not store avatar:', err);
      }

      updateAvatarsAcrossUI(dataUrl, null);
      showToast('Profile photo updated successfully!', 'success');
    };
    reader.readAsDataURL(file);
  });

  try {
    const res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data?.user) {
      const u = res.data.user;
      if (nameInput) nameInput.value = u.full_name || '';
      if (phoneInput) phoneInput.value = u.phone || '';
      if (emailInput) emailInput.value = u.email || '';
      if (addressInput) addressInput.value = u.address || '';
      if (nameHeading) nameHeading.textContent = u.full_name || 'Customer';
      if (emailHeading) emailHeading.textContent = u.email || '';
      if (avatarInitials && u.full_name) {
        const init = getInitials(u.full_name);
        avatarInitials.textContent = init;
        if (!savedAvatar) updateAvatarsAcrossUI(null, init);
      }
    }
  } catch (err) {
    console.warn('Could not load profile:', err);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const fullName = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';
    const address = addressInput?.value.trim() || '';
    const curPass = $id('customer-current-password')?.value || '';
    const newPass = $id('customer-new-password')?.value || '';
    const confirmPass = $id('customer-confirm-password')?.value || '';

    let hasError = false;
    if (!fullName || fullName.length < 2) { showFieldError(nameInput, 'Full name must be at least 2 characters.'); hasError = true; }
    if (!phone || !/^[0-9+\s-]{9,15}$/.test(phone)) { showFieldError(phoneInput, 'Please enter a valid phone number.'); hasError = true; }
    if (newPass) {
      if (newPass.length < 6) { showFieldError($id('customer-new-password'), 'New password must be at least 6 characters.'); hasError = true; }
      if (newPass !== confirmPass) { showFieldError($id('customer-confirm-password'), 'New passwords do not match.'); hasError = true; }
      if (!curPass) { showFieldError($id('customer-current-password'), 'Please enter your current password.'); hasError = true; }
    }

    if (hasError) {
      showToast('Please correct the highlighted errors.', 'error');
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    const submitBtn = $id('btn-save-customer-profile') || form.querySelector('button[type="submit"]');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...', async () => {
      try {
        const profileRes = await apiFetch('auth.php?action=update-profile', {
          method: 'POST',
          body: JSON.stringify({ full_name: fullName, phone, address })
        });

        if (!profileRes.ok || profileRes.data?.status !== 'success') {
          showToast(profileRes.data?.message || 'Failed to update profile.', 'error');
          return;
        }

        if (newPass) {
          const passRes = await apiFetch('auth.php?action=change-password', {
            method: 'POST',
            body: JSON.stringify({ current_password: curPass, new_password: newPass })
          });
          if (!passRes.ok || passRes.data?.status !== 'success') {
            showToast(passRes.data?.message || 'Profile saved, but password change failed.', 'warning');
            return;
          }
          if ($id('customer-current-password')) $id('customer-current-password').value = '';
          if ($id('customer-new-password')) $id('customer-new-password').value = '';
          if ($id('customer-confirm-password')) $id('customer-confirm-password').value = '';
        }

        showToast('Profile updated successfully!', 'success');
        if (nameHeading) nameHeading.textContent = fullName;
        if (avatarInitials) avatarInitials.textContent = getInitials(fullName);

        const loggedUser = getCustomerUser();
        if (loggedUser) {
          loggedUser.name = fullName;
          loggedUser.phone = phone;
          localStorage.setItem('jodkade_logged_user', JSON.stringify(loggedUser));
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });

  refreshIcons();
}

// ==========================================
// 7. Customer Dashboard Stats
// ==========================================
async function loadCustomerDashboardStats() {
  if (!window.location.pathname.includes('customer/dashboard.html')) return;
  const activeEl = $id('stat-active-requests');
  const completedEl = $id('stat-completed-jobs');
  if (!activeEl && !completedEl) return;

  try {
    const res = await apiFetch('jobs.php?action=customer');
    const jobs = (res.ok && res.data?.status === 'success' && Array.isArray(res.data.jobs)) ? res.data.jobs : [];
    let active = 0, completed = 0;
    jobs.forEach(j => {
      const st = (j.status || 'open').toLowerCase();
      if (st === 'completed') completed++;
      else if (st !== 'cancelled') active++;
    });
    if (activeEl) activeEl.textContent = active;
    if (completedEl) completedEl.textContent = completed;
  } catch (err) {
    console.warn('Customer dashboard stats failed:', err);
  }
}
