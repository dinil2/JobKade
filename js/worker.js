/* ==========================================
   JODKADE — Worker Dashboard JavaScript
   Service management, profile, subscription
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {
  const user = (typeof requireAuth === 'function') ? requireAuth('worker') : null;
  if (!user) return;

  syncWorkerIdentity(user);
  loadWorkerDashboardStats();

  initServiceManagement();
  initWorkerProfilePage();
  initSubscriptionFlow();
  initProfilePhotoUpload();

  loadOpenJobsForWorker();
  loadMyServicesForWorker();
  initWorkerSettings();
  initWorkerWalletPage();
  initWorkerJobMapModal();
  initWorkerInvoiceAndAccess();
});

// ==========================================
// Reusable Utilities
// ==========================================

const $id = id => document.getElementById(id);
const formatLKR = amt => 'Rs. ' + parseFloat(amt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function withBtnLoading(btn, loadingHtml, callback) {
  if (!btn) return callback();
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = loadingHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  try {
    return await callback();
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function syncWorkerIdentity(user) {
  const workerName = user.name || user.full_name || 'Worker';
  const initials = workerName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'WK';
  const firstName = workerName.split(' ')[0] || 'Worker';

  const greetingEl = $id('greeting');
  if (greetingEl) {
    greetingEl.textContent = (typeof getGreeting === 'function' ? getGreeting() : 'Welcome') + ', ' + firstName + ' 👋';
  }

  document.querySelectorAll('.sidebar.worker .sidebar-user-name, #sidebarUserName').forEach(el => {
    el.textContent = workerName;
  });

  const savedAvatar = localStorage.getItem('jobkade_worker_avatar') || user.avatar;
  document.querySelectorAll('.sidebar.worker .avatar, #sidebarAvatar, #navAvatar, .dashboard-nav-right .avatar').forEach(el => {
    if (savedAvatar) {
      el.innerHTML = `<img src="${savedAvatar}" alt="${workerName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
      el.textContent = initials;
    }
  });
}

// ==========================================
// 1. Service Management & Deletion
// ==========================================

function initServiceManagement() {
  let activeServiceCard = null;
  let activeServiceId = null;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-service-btn');
    if (btn) {
      activeServiceCard = btn.closest('.service-manage-card, .service-card, tr, .job-card');
      activeServiceId = btn.getAttribute('data-service-id') || activeServiceCard?.getAttribute('data-service-id');
      openModal('delete-service-modal');
    }
  });

  $id('confirm-delete-service')?.addEventListener('click', async () => {
    closeModal('delete-service-modal');
    if (activeServiceId) {
      try {
        const res = await apiFetch('workers.php?action=delete-service', {
          method: 'POST',
          body: JSON.stringify({ service_id: parseInt(activeServiceId, 10) })
        });
        showToast(res.ok && res.data?.status === 'success' ? 'Service deleted successfully.' : (res.data?.message || 'Service removed.'), 'info');
      } catch (err) {
        showToast('Service deleted locally.', 'info');
      }
    } else {
      showToast('Service deleted.', 'info');
    }

    if (activeServiceCard) {
      activeServiceCard.style.opacity = '0';
      activeServiceCard.style.transition = 'all 0.3s ease';
      setTimeout(() => activeServiceCard.remove(), 300);
    }
  });

  const serviceForm = $id('service-form');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(this);

      const titleInput = $id('service-title-input') || this.querySelector('[name="service-title"], input[type="text"]');
      const catSelect = $id('service-category-input') || this.querySelector('select');
      const descInput = $id('service-desc-input') || this.querySelector('textarea');
      const priceInput = $id('service-price-input') || this.querySelector('input[type="number"]');
      const pricingTypeSelect = $id('service-pricing-type-input');
      const locInput = $id('service-location-input');

      const title = titleInput?.value.trim() || '';
      const price = parseFloat(priceInput?.value || 0);

      let isValid = true;
      if (!title || title.length < 3) {
        showFieldError(titleInput, 'Service title is required (at least 3 characters).');
        isValid = false;
      }
      if (isNaN(price) || price < 100) {
        showFieldError(priceInput, 'Please specify a valid price (minimum Rs. 100).');
        isValid = false;
      }
      if (catSelect && !catSelect.value) {
        showFieldError(catSelect, 'Please select a service category.');
        isValid = false;
      }
      if (!isValid) {
        showToast('Please fix the errors in the form.', 'error');
        return;
      }

      const submitBtn = $id('btn-save-service') || this.querySelector('button[type="submit"]');
      await withBtnLoading(submitBtn, '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...', async () => {
        try {
          const res = await apiFetch('workers.php?action=add-service', {
            method: 'POST',
            body: JSON.stringify({
              title,
              category_id: catSelect ? parseInt(catSelect.value, 10) : null,
              description: descInput?.value.trim() || title,
              price,
              pricing_type: pricingTypeSelect?.value || 'fixed',
              location: locInput?.value.trim() || 'Colombo'
            })
          });

          if (res.ok && res.data?.status === 'success') {
            showToast('Service saved successfully!', 'success');
            setTimeout(() => { window.location.href = 'my-services.html'; }, 1000);
          } else {
            showToast(res.data?.message || 'Could not save service.', 'error');
          }
        } catch (err) {
          showToast('Service saved!', 'success');
          setTimeout(() => { window.location.href = 'my-services.html'; }, 1000);
        }
      });
    });
  }

  // Image Upload Validation
  const imgUpload = $id('service-images');
  const previewGrid = $id('service-preview-grid');
  if (imgUpload && previewGrid) {
    imgUpload.addEventListener('change', () => {
      previewGrid.innerHTML = '';
      const files = [...imgUpload.files].slice(0, 5);
      if (imgUpload.files.length > 5) showToast('Maximum 5 images allowed. Only the first 5 will be selected.', 'info');

      files.forEach(file => {
        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
          showToast(`Invalid format: ${file.name}. Only JPG and PNG allowed.`, 'error');
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast(`File too large: ${file.name} exceeds 5MB limit.`, 'error');
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
}

// ==========================================
// 2. Worker Profile & Avatar
// ==========================================

function initProfilePhotoUpload() {
  const avatarClickable = $id('profile-avatar-clickable');
  const cameraBtn = $id('btn-camera-trigger');
  const avatarHint = $id('profile-avatar-hint');
  const photoUpload = $id('worker-photo-upload');

  const triggerUpload = () => photoUpload?.click();
  avatarClickable?.addEventListener('click', triggerUpload);
  cameraBtn?.addEventListener('click', e => { e.stopPropagation(); triggerUpload(); });
  avatarHint?.addEventListener('click', triggerUpload);

  photoUpload?.addEventListener('change', () => {
    const file = photoUpload.files[0];
    if (!file) return;

    if (!file.type.match(/^image\//)) {
      showToast('Please select a valid image file (PNG, JPG, JPEG, WebP).', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size must be less than 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const avatarImg = $id('worker-avatar-img');
      const avatarInitials = $id('worker-avatar-initials');

      if (avatarImg) { avatarImg.src = dataUrl; avatarImg.style.display = 'block'; }
      if (avatarInitials) avatarInitials.style.display = 'none';

      try {
        localStorage.setItem('jobkade_worker_avatar', dataUrl);
        const sUser = JSON.parse(localStorage.getItem('jobkade_user') || 'null');
        if (sUser) {
          sUser.avatar = dataUrl;
          localStorage.setItem('jobkade_user', JSON.stringify(sUser));
        }
      } catch (storageErr) {
        console.warn('Could not persist avatar:', storageErr);
      }

      document.querySelectorAll('.sidebar.worker .avatar, #sidebarAvatar, #navAvatar, .dashboard-nav-right .avatar').forEach(el => {
        el.innerHTML = `<img src="${dataUrl}" alt="Profile Photo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
      });

      showToast('Profile photo updated successfully!', 'success');
    };
    reader.readAsDataURL(file);
  });
}

async function initWorkerProfilePage() {
  const form = $id('worker-profile-form');
  if (!form || !window.location.pathname.includes('profile-edit.html')) return;

  const savedAvatar = localStorage.getItem('jobkade_worker_avatar');
  const avatarImg = $id('worker-avatar-img');
  const avatarInitials = $id('worker-avatar-initials');

  if (savedAvatar && avatarImg) {
    avatarImg.src = savedAvatar;
    avatarImg.style.display = 'block';
    if (avatarInitials) avatarInitials.style.display = 'none';
  }

  try {
    const res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data?.user) {
      const u = res.data.user;
      const nameInput = form.querySelector('[name="full-name"]');
      const phoneInput = form.querySelector('[name="phone"]');
      const emailInput = form.querySelector('[name="email"]');
      const locInput = form.querySelector('[name="location"]');
      const bioInput = form.querySelector('[name="bio"]');
      const nameHeading = $id('worker-profile-display-name');

      if (nameInput && u.full_name) nameInput.value = u.full_name;
      if (nameHeading && u.full_name) nameHeading.textContent = u.full_name;
      if (phoneInput && u.phone) phoneInput.value = u.phone;
      if (emailInput && u.email) emailInput.value = u.email;
      if (locInput && u.address) locInput.value = u.address;
      if (bioInput && u.bio) bioInput.value = u.bio;

      if (!savedAvatar && u.avatar && avatarImg) {
        avatarImg.src = u.avatar;
        avatarImg.style.display = 'block';
        if (avatarInitials) avatarInitials.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('initWorkerProfilePage error:', err);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearFormErrors(this);

    const nameInput = this.querySelector('[name="full-name"]');
    const phoneInput = this.querySelector('[name="phone"]');
    const emailInput = this.querySelector('[name="email"]');
    const bioInput = this.querySelector('[name="bio"]');
    const locInput = this.querySelector('[name="location"]');
    const curPassInput = $id('worker-current-password');
    const newPassInput = $id('worker-new-password');
    const confirmPassInput = $id('worker-confirm-password');

    const fullName = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const bio = bioInput?.value.trim() || '';
    const location = locInput?.value.trim() || '';
    const curPass = curPassInput?.value || '';
    const newPass = newPassInput?.value || '';
    const confirmPass = confirmPassInput?.value || '';

    let hasError = false;
    if (!fullName || fullName.length < 2) { showFieldError(nameInput, 'Full name must be at least 2 characters.'); hasError = true; }
    if (!phone || !/^[0-9+\s-]{9,15}$/.test(phone)) { showFieldError(phoneInput, 'Please enter a valid phone number.'); hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError(emailInput, 'Please enter a valid email address.'); hasError = true; }
    if (!bio || bio.length < 10) { showFieldError(bioInput, 'Please write a brief description (at least 10 characters).'); hasError = true; }
    if (!location || location.length < 2) { showFieldError(locInput, 'Please enter your service area or location.'); hasError = true; }

    if (newPass) {
      if (newPass.length < 6) { showFieldError(newPassInput, 'New password must be at least 6 characters.'); hasError = true; }
      if (newPass !== confirmPass) { showFieldError(confirmPassInput, 'New passwords do not match.'); hasError = true; }
      if (!curPass) { showFieldError(curPassInput, 'Current password is required to set a new password.'); hasError = true; }
    }

    if (hasError) {
      showToast('Please correct the highlighted errors.', 'error');
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...', async () => {
      try {
        const res = await apiFetch('workers.php?action=update', {
          method: 'POST',
          body: JSON.stringify({ full_name: fullName, phone, bio, address: location })
        });

        if (res.ok && res.data?.status === 'success') {
          const curUser = getLoggedInUser();
          if (curUser) {
            curUser.name = fullName;
            curUser.phone = phone;
            localStorage.setItem('jodkade_logged_user', JSON.stringify(curUser));
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
            if (curPassInput) curPassInput.value = '';
            if (newPassInput) newPassInput.value = '';
            if (confirmPassInput) confirmPassInput.value = '';
            showToast('Profile and password updated successfully!', 'success');
          } else {
            showToast(res.data?.message || 'Profile updated successfully!', 'success');
          }
        } else {
          showToast(res.data?.message || 'Profile saved locally.', res.ok ? 'success' : 'info');
        }
      } catch (err) {
        showToast('Profile updated!', 'success');
      }
    });
  });
}

// ==========================================
// 3. Subscription & Wallet Handlers
// ==========================================

function initSubscriptionFlow() {
  document.querySelectorAll('.choose-plan-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const planId = this.getAttribute('data-plan-id') || 1;
      const planName = this.getAttribute('data-plan-name') || 'Monthly Plan';
      const planPrice = parseFloat(this.getAttribute('data-plan-price') || 3000);

      const titleEl = $id('selected-plan-title');
      const priceEl = $id('selected-plan-price-display');
      const idInput = $id('selected-plan-id');

      if (titleEl) titleEl.textContent = planName;
      if (priceEl) priceEl.textContent = formatLKR(planPrice);
      if (idInput) idInput.value = planId;

      openModal('payment-modal');
    });
  });

  const confirmPaymentBtn = $id('confirm-payment');
  confirmPaymentBtn?.addEventListener('click', async () => {
    const planId = parseInt($id('selected-plan-id')?.value || 1, 10);
    await withBtnLoading(confirmPaymentBtn, '<i data-lucide="loader" class="spin" width="16" height="16"></i> Activating...', async () => {
      try {
        const res = await apiFetch('subscriptions.php?action=pay', {
          method: 'POST',
          body: JSON.stringify({ plan_id: planId, payment_method: 'Online IPG (Card/Visa/Master)' })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('payment-modal');
          showToast('Subscription activated! Your commission is now reduced to 5%.', 'success');
          setTimeout(() => window.location.reload(), 1200);
        } else {
          showToast(res.data?.message || 'Subscription payment failed.', 'error');
        }
      } catch (err) {
        showToast('Error activating subscription: ' + err.message, 'error');
      }
    });
  });

  if (window.location.pathname.includes('subscription.html')) {
    apiFetch('wallet.php?action=balance').then(res => {
      if (res.ok && res.data?.wallet) {
        const w = res.data.wallet;
        const isSub = parseFloat(w.commission_rate || 0.10) <= 0.05;
        const title = $id('current-plan-title');
        const desc = $id('current-plan-desc');
        const badge = $id('subscription-badge');

        if (isSub) {
          if (title) title.innerHTML = `<span style="color:#16A34A;">${w.subscription_plan_name || 'Active Membership'}</span>`;
          if (desc) desc.textContent = 'Active subscription enabled. You are enjoying the discounted 5% platform commission rate!';
          if (badge) {
            badge.style.background = '#ECFDF5';
            badge.style.color = '#16A34A';
            badge.innerHTML = '<i data-lucide="check-circle" width="16" height="16"></i> 5% Discount Active';
          }
        } else {
          if (title) title.textContent = 'Standard Tier (10% Commission)';
          if (desc) desc.textContent = 'No active subscription. You pay standard 10% platform fee per completed job. Subscribe below to drop to 5%!';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }).catch(e => console.warn('Could not load plan status:', e));
  }
}

// ==========================================
// 4. Invoices & Marketplace Access Gating
// ==========================================

let workerModalMap = null;
let workerModalMarker = null;
let isWorkerSubscribed = false;

function initWorkerInvoiceAndAccess() {
  apiFetch('wallet.php?action=balance').then(res => {
    if (res.ok && res.data?.wallet) {
      isWorkerSubscribed = (res.data.wallet.commission_rate <= 0.05);
      const banner = $id('job-access-banner');
      if (banner && res.data.wallet.has_job_access) banner.style.display = 'none';
    }
  }).catch(e => console.warn(e));

  const btnPayAccess = $id('btn-pay-access-pass');
  btnPayAccess?.addEventListener('click', async () => {
    if (!confirm('Pay one-time marketplace access fee of Rs. 1,000 to unlock direct customer contacts and accept unlimited jobs?')) return;
    await withBtnLoading(btnPayAccess, '<i data-lucide="loader" width="14" height="14" class="spin"></i> Processing...', async () => {
      try {
        const res = await apiFetch('wallet.php?action=pay-access-fee', { method: 'POST', body: '{}' });
        if (res.ok && res.data?.status === 'success') {
          showToast('Job marketplace access activated successfully!', 'success');
          $id('job-access-banner')?.remove();
          loadOpenJobsForWorker();
        } else {
          showToast(res.data?.message || 'Payment failed.', 'error');
        }
      } catch (err) {
        showToast('Payment failed: ' + err.message, 'error');
      }
    });
  });

  $id('inv-amount')?.addEventListener('input', updateInvoiceBreakdown);

  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-open-invoice-modal');
    if (!btn) return;

    const jobId = btn.getAttribute('data-job-id');
    const jobTitle = btn.getAttribute('data-job-title') || 'Job Request';

    if ($id('inv-job-id')) $id('inv-job-id').value = jobId;
    if ($id('inv-job-title')) $id('inv-job-title').textContent = `${jobTitle} (#${jobId})`;
    if ($id('inv-amount')) $id('inv-amount').value = '';
    if ($id('inv-notes')) $id('inv-notes').value = '';

    updateInvoiceBreakdown();
    openModal('invoice-modal');
  });

  const invForm = $id('worker-invoice-form');
  invForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const jobId = $id('inv-job-id')?.value;
    const amountVal = parseFloat($id('inv-amount')?.value || 0);
    const notesVal = $id('inv-notes')?.value || '';

    if (!jobId || isNaN(amountVal) || amountVal < 100) {
      showToast('Please enter a valid price (min Rs. 100).', 'error');
      return;
    }

    const submitBtn = $id('btn-submit-invoice');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="16" height="16" class="spin"></i> Submitting...', async () => {
      try {
        const res = await apiFetch('jobs.php?action=create-invoice', {
          method: 'POST',
          body: JSON.stringify({ job_id: parseInt(jobId, 10), amount: amountVal, notes: notesVal })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('invoice-modal');
          showToast(`Invoice for Rs. ${amountVal.toLocaleString()} sent to customer!`, 'success');
          loadOpenJobsForWorker();
        } else {
          showToast(res.data?.message || 'Could not create invoice.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });
}

function updateInvoiceBreakdown() {
  const amountInput = $id('inv-amount');
  const amount = Math.max(0, parseFloat(amountInput?.value || 0) || 0);

  const rate = isWorkerSubscribed ? 0.05 : 0.10;
  const commission = amount * rate;
  const net = amount - commission;

  if ($id('breakdown-rate-label')) $id('breakdown-rate-label').textContent = (rate * 100).toFixed(0) + '%';
  if ($id('breakdown-sub-badge')) $id('breakdown-sub-badge').style.display = isWorkerSubscribed ? 'inline-block' : 'none';
  if ($id('breakdown-total')) $id('breakdown-total').textContent = formatLKR(amount);
  if ($id('breakdown-commission')) $id('breakdown-commission').textContent = '- ' + formatLKR(commission);
  if ($id('breakdown-net')) $id('breakdown-net').textContent = formatLKR(net);
  if ($id('online-net-note')) $id('online-net-note').textContent = formatLKR(net).replace('Rs. ', '');
}

// ==========================================
// 5. Jobs & Map Modal
// ==========================================

function initWorkerJobMapModal() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-view-job-map');
    if (!btn) return;

    const lat = parseFloat(btn.getAttribute('data-lat') || '6.9271');
    const lng = parseFloat(btn.getAttribute('data-lng') || '79.8612');
    const address = btn.getAttribute('data-address') || 'Colombo';
    const title = btn.getAttribute('data-title') || 'Job Location';
    const customerId = btn.getAttribute('data-customer-id') || '2';
    const jobId = btn.getAttribute('data-job-id') || '';

    const titleEl = $id('modal-map-title');
    const addrEl = $id('modal-map-address');
    const msgBtn = $id('modal-map-msg-btn');

    if (titleEl) titleEl.textContent = title;
    if (addrEl) {
      addrEl.innerHTML = `<i data-lucide="map-pin" width="14" height="14" style="display:inline; vertical-align:middle; color:var(--primary);"></i> <span>${address} (${lat.toFixed(4)}, ${lng.toFixed(4)})</span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (msgBtn) {
      msgBtn.href = `../messages.html?user_id=${customerId}${jobId ? `&job_id=${jobId}` : ''}`;
    }

    openModal('job-map-modal');

    setTimeout(() => {
      const mapDiv = $id('worker-job-map');
      if (!mapDiv || typeof L === 'undefined') return;

      if (!workerModalMap) {
        workerModalMap = L.map('worker-job-map').setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(workerModalMap);
        workerModalMarker = L.marker([lat, lng]).addTo(workerModalMap);
      } else {
        workerModalMap.setView([lat, lng], 14);
        workerModalMarker.setLatLng([lat, lng]);
      }
      workerModalMarker.bindPopup(`<b>${title}</b><br>${address}`).openPopup();
      workerModalMap.invalidateSize();
    }, 200);
  });
}

async function loadOpenJobsForWorker() {
  const grid = $id('worker-jobs-container');
  if (!grid || !window.location.pathname.includes('jobs.html')) return;

  const verifyBanner = $id('job-verification-banner');
  const accessBanner = $id('job-access-banner');

  try {
    const res = await apiFetch('jobs.php?action=list');

    if (res.status === 403 || (!res.ok && res.status === 403)) {
      if (accessBanner) accessBanner.style.display = 'none';
      const message = res.data?.message || 'Your account is pending admin verification. You will be able to view customer job requests once your documents are verified.';

      if (verifyBanner) {
        verifyBanner.style.display = 'flex';
        const msgEl = $id('job-verification-msg');
        if (msgEl) msgEl.textContent = message;
      }

      grid.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 20px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(245, 158, 11, 0.12); color: #d97706; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <i data-lucide="shield-alert" style="width: 28px; height: 28px;"></i>
          </div>
          <h3 style="margin-bottom: 8px; color: var(--text-primary); font-size: 1.2rem;">Account Verification Required</h3>
          <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 20px; font-size: 0.92rem; line-height: 1.5;">${message}</p>
          <a href="kyc.html" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;">
            <i data-lucide="shield-check" width="16" height="16"></i> Go to Identity & KYC
          </a>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    if (verifyBanner) verifyBanner.style.display = 'none';

    if (res.ok && res.data?.status === 'success' && res.data.jobs?.length > 0) {
      if (res.data.has_job_access && accessBanner) accessBanner.style.display = 'none';

      grid.innerHTML = res.data.jobs.map(j => {
        const lat = j.latitude || 6.9271;
        const lng = j.longitude || 79.8612;
        const addr = j.address || 'Colombo';
        const custId = j.customer_id || 2;
        const jId = j.id || '';
        const safeTitle = (j.title || 'Job Request').replace(/"/g, '&quot;');

        return `
          <div class="job-card">
            <div class="job-card-header"><h3 class="job-card-title">${j.title}</h3><span class="badge badge-open">Active</span></div>
            <div class="job-card-meta">
              <span><i data-lucide="user" width="14" height="14"></i> ${j.customer_name || 'Customer'}</span>
              <span><i data-lucide="map-pin" width="14" height="14"></i> ${addr}</span>
              <span><i data-lucide="clock" width="14" height="14"></i> ${j.created_at || 'Recently'}</span>
              <span><i data-lucide="tag" width="14" height="14"></i> ${j.category_name || 'Service'}</span>
            </div>
            <p class="job-card-desc">${j.description}</p>
            <div class="job-card-actions">
              <a href="../messages.html?user_id=${custId}&job_id=${jId}" class="btn btn-primary btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Message Customer</a>
              <button class="btn btn-success btn-sm btn-open-invoice-modal" data-job-id="${jId}" data-job-title="${safeTitle}" style="font-weight:600;"><i data-lucide="check-circle" width="14" height="14"></i> Mark Done & Set Price</button>
              <button class="btn btn-outline btn-sm btn-view-job-map" data-lat="${lat}" data-lng="${lng}" data-address="${addr}" data-title="${safeTitle}" data-customer-id="${custId}" data-job-id="${jId}"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>
              ${j.customer_phone ? `<a href="tel:${j.customer_phone}" class="btn btn-ghost btn-sm"><i data-lucide="phone" width="14" height="14"></i> Call</a>` : ''}
            </div>
          </div>`;
      }).join('');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <i data-lucide="inbox" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Open Job Requests</h3>
          <p style="color: var(--text-secondary);">There are currently no open customer requests matching your area.</p>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } catch (err) {
    console.warn('loadOpenJobsForWorker error:', err);
    grid.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px;"><p style="color: var(--error);">Failed to load jobs. Please check your connection.</p></div>';
  }
}

async function loadMyServicesForWorker() {
  const container = $id('worker-services-container');
  if (!container || !window.location.pathname.includes('my-services.html')) return;

  try {
    const res = await apiFetch('workers.php?action=my-services');
    if (res.ok && res.data?.status === 'success' && res.data.services?.length > 0) {
      container.innerHTML = res.data.services.map(s => {
        const priceFormatted = formatLKR(s.price || 0).replace('Rs. ', '');
        const pricingUnit = (s.pricing_type === 'starting_at') ? ' (Starting)' : ' (Job Rate)';
        const catName = s.category_name || 'General';

        return `
          <div class="service-manage-card" data-service-id="${s.id}" style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; justify-content:space-between; position:relative;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <span class="badge badge-open" style="font-size:0.8rem;"><i data-lucide="tag" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> ${catName}</span>
                <span style="font-weight:700; font-size:1.1rem; color:var(--primary);">Rs. ${priceFormatted} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-secondary);">${pricingUnit}</span></span>
              </div>
              <h3 style="margin:0 0 8px; font-size:1.15rem; color:var(--text-primary);">${s.title}</h3>
              <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:16px; line-height:1.5;">${s.description || 'No description provided.'}</p>
              <div style="display:flex; gap:12px; font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
                <span><i data-lucide="map-pin" width="14" height="14" style="display:inline;vertical-align:middle;"></i> ${s.location || 'Colombo'}</span>
                <span><i data-lucide="check-circle" width="14" height="14" style="display:inline;vertical-align:middle;color:var(--success);"></i> Active</span>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--border); padding-top:12px;">
              <button type="button" class="btn btn-outline btn-sm delete-service-btn" data-service-id="${s.id}" style="color:var(--error); border-color:rgba(239,68,68,0.3);"><i data-lucide="trash-2" width="14" height="14"></i> Delete</button>
            </div>
          </div>`;
      }).join('');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); grid-column: 1 / -1;">
          <i data-lucide="briefcase" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Services Added Yet</h3>
          <p style="color: var(--text-secondary); margin-bottom: 20px;">List your specialized skills, pricing, and services to attract direct client requests.</p>
          <a href="add-service.html" class="btn btn-primary"><i data-lucide="plus" width="16" height="16"></i> Add Your First Service</a>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } catch (err) {
    console.warn('loadMyServicesForWorker error:', err);
    container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px; grid-column: 1 / -1;"><p style="color: var(--error);">Failed to load your services. Please refresh or log in.</p></div>';
  }
}

// ==========================================
// 6. Worker Settings & Wallet
// ==========================================

async function initWorkerSettings() {
  const form = $id('worker-settings-form');
  if (!form || !window.location.pathname.includes('settings.html')) return;

  const prefJobAlerts = $id('pref-job-alerts');
  const prefEmailNotifs = $id('pref-email-notifs');
  const prefSmsNotifs = $id('pref-sms-notifs');
  const prefShowPhone = $id('pref-show-phone');
  const prefShowWhatsapp = $id('pref-show-whatsapp');

  const curPassInput = $id('current-password-input');
  const newPassInput = $id('new-password-input');
  const confirmPassInput = $id('confirm-password-input');
  const submitBtn = $id('btn-save-settings') || form.querySelector('button[type="submit"]');

  try {
    const res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data?.user?.notification_prefs) {
      const prefs = typeof res.data.user.notification_prefs === 'string'
        ? JSON.parse(res.data.user.notification_prefs)
        : res.data.user.notification_prefs;

      if (prefJobAlerts && prefs.job_alerts !== undefined) prefJobAlerts.checked = !!prefs.job_alerts;
      if (prefEmailNotifs && prefs.email_notifs !== undefined) prefEmailNotifs.checked = !!prefs.email_notifs;
      if (prefSmsNotifs && prefs.sms_notifs !== undefined) prefSmsNotifs.checked = !!prefs.sms_notifs;
      if (prefShowPhone && prefs.show_phone !== undefined) prefShowPhone.checked = !!prefs.show_phone;
      if (prefShowWhatsapp && prefs.show_whatsapp !== undefined) prefShowWhatsapp.checked = !!prefs.show_whatsapp;
    }
  } catch (err) {
    console.warn('Could not load user settings:', err);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearFormErrors(form);

    const curPass = curPassInput?.value || '';
    const newPass = newPassInput?.value || '';
    const confirmPass = confirmPassInput?.value || '';

    if (newPass) {
      let hasError = false;
      if (newPass.length < 6) { showFieldError(newPassInput, 'New password must be at least 6 characters.'); hasError = true; }
      if (newPass !== confirmPass) { showFieldError(confirmPassInput, 'New passwords do not match.'); hasError = true; }
      if (!curPass) { showFieldError(curPassInput, 'Current password is required to set a new password.'); hasError = true; }
      if (hasError) {
        showToast('Please fix the password errors.', 'error');
        return;
      }
    }

    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...', async () => {
      try {
        const notificationPrefsObj = {
          job_alerts: prefJobAlerts ? prefJobAlerts.checked : true,
          email_notifs: prefEmailNotifs ? prefEmailNotifs.checked : true,
          sms_notifs: prefSmsNotifs ? prefSmsNotifs.checked : false,
          show_phone: prefShowPhone ? prefShowPhone.checked : true,
          show_whatsapp: prefShowWhatsapp ? prefShowWhatsapp.checked : true
        };

        await apiFetch('auth.php?action=update-profile', {
          method: 'POST',
          body: JSON.stringify({ notification_prefs: JSON.stringify(notificationPrefsObj) })
        });

        if (newPass) {
          const passRes = await apiFetch('auth.php?action=change-password', {
            method: 'POST',
            body: JSON.stringify({ current_password: curPass, new_password: newPass })
          });
          if (!passRes.ok || passRes.data?.status !== 'success') {
            showToast(passRes.data?.message || 'Preferences saved, but password change failed.', 'warning');
            return;
          }
          if (curPassInput) curPassInput.value = '';
          if (newPassInput) newPassInput.value = '';
          if (confirmPassInput) confirmPassInput.value = '';
        }
        showToast('Settings saved successfully!', 'success');
      } catch (err) {
        showToast('Error saving settings: ' + err.message, 'error');
      }
    });
  });
}

async function initWorkerWalletPage() {
  if (!window.location.pathname.includes('wallet.html')) return;

  const balDisplay = $id('wallet-balance-display');
  const earnDisplay = $id('wallet-earnings-display');
  const rateDisplay = $id('wallet-commission-rate-display');
  const planTag = $id('wallet-plan-tag');
  const negBanner = $id('negative-balance-alert');
  const tbody = $id('wallet-transactions-tbody');
  const countLabel = $id('tx-count-label');

  $id('btn-open-payout')?.addEventListener('click', () => openModal('payout-modal'));
  $id('btn-open-topup')?.addEventListener('click', () => openModal('topup-modal'));

  async function loadWalletData() {
    try {
      const [balRes, txRes] = await Promise.all([
        apiFetch('wallet.php?action=balance'),
        apiFetch('wallet.php?action=transactions').catch(() => ({ ok: false }))
      ]);

      if (balRes.ok && balRes.data?.wallet) {
        const w = balRes.data.wallet;
        const bal = parseFloat(w.balance || 0);
        const earnings = parseFloat(w.total_earnings || 0);
        const rate = (w.commission_rate !== undefined) ? (parseFloat(w.commission_rate) * 100).toFixed(0) + '%' : '10%';
        const isSub = (w.commission_rate !== undefined && parseFloat(w.commission_rate) <= 0.05);

        if (balDisplay) {
          balDisplay.textContent = (bal < 0 ? '- ' : '') + formatLKR(Math.abs(bal));
          balDisplay.style.color = (bal < 0) ? 'var(--error)' : 'var(--text-primary)';
        }
        if (earnDisplay) earnDisplay.textContent = formatLKR(earnings);
        if (rateDisplay) rateDisplay.textContent = rate;
        if (planTag) {
          planTag.innerHTML = isSub
            ? '<span class="badge badge-success" style="font-size:0.75rem;">Premium 5% Rate Active</span>'
            : 'Standard Rate (<a href="subscription.html" style="color:var(--primary);font-weight:600;">Upgrade for 5%</a>)';
        }
        if (negBanner) negBanner.style.display = (bal < 0) ? 'block' : 'none';
      }

      if (txRes.ok && txRes.data?.transactions?.length > 0) {
        const txs = txRes.data.transactions;
        if (countLabel) countLabel.textContent = txs.length + ' transactions recorded';

        tbody.innerHTML = txs.map(t => {
          const amt = parseFloat(t.amount || 0);
          const isCredit = (t.type === 'credit' || amt > 0);
          const amtClass = isCredit ? 'amount-credit' : 'amount-debit';
          const sign = isCredit ? '+ ' : '- ';
          const balAfter = (t.balance_after !== null && t.balance_after !== undefined) ? formatLKR(t.balance_after) : '—';

          return `
            <tr>
              <td style="white-space:nowrap; color:var(--text-secondary);">${t.created_at || 'Just now'}</td>
              <td style="font-family:monospace; font-size:0.85rem; color:var(--text-muted);">#${t.reference_id || t.id}</td>
              <td><strong>${t.description || 'Transaction'}</strong></td>
              <td><span class="badge badge-outline" style="text-transform:capitalize;">${t.payment_method || 'System'}</span></td>
              <td class="${amtClass}">${sign}${formatLKR(Math.abs(amt))}</td>
              <td style="font-weight:600;">${balAfter}</td>
            </tr>`;
        }).join('');
      } else if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);"><i data-lucide="receipt" style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:0.4;"></i>No transactions recorded yet. Completed job payouts and settlements will appear here.</td></tr>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    } catch (err) {
      console.warn('loadWalletData error:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--error);">Failed to load wallet ledger.</td></tr>';
    }
  }

  loadWalletData();

  const payoutForm = $id('wallet-payout-form');
  payoutForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const amount = parseFloat($id('payout-amount')?.value || 0);
    const bank = $id('payout-bank')?.value;
    const accNum = $id('payout-account-num')?.value.trim();
    const accName = $id('payout-account-name')?.value.trim();
    const branch = $id('payout-branch')?.value.trim() || '';

    if (isNaN(amount) || amount < 1000) { showToast('Minimum payout amount is Rs. 1,000.', 'error'); return; }
    if (!bank || !accNum || !accName) { showToast('Please fill in all required bank account fields.', 'error'); return; }

    const submitBtn = $id('btn-submit-payout');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing...', async () => {
      try {
        const res = await apiFetch('wallet.php?action=request-payout', {
          method: 'POST',
          body: JSON.stringify({ amount, bank_name: bank, account_number: accNum, account_name: accName, branch_name: branch })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('payout-modal');
          showToast(`Payout request for Rs. ${amount.toLocaleString()} submitted successfully!`, 'success');
          payoutForm.reset();
          loadWalletData();
        } else {
          showToast(res.data?.message || 'Could not process payout request.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });

  const topupForm = $id('wallet-topup-form');
  topupForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const amount = parseFloat($id('topup-amount')?.value || 0);
    if (isNaN(amount) || amount < 100) { showToast('Minimum top-up amount is Rs. 100.', 'error'); return; }

    const submitBtn = $id('btn-submit-topup');
    await withBtnLoading(submitBtn, '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing...', async () => {
      try {
        const res = await apiFetch('wallet.php?action=topup', {
          method: 'POST',
          body: JSON.stringify({ amount })
        });

        if (res.ok && res.data?.status === 'success') {
          closeModal('topup-modal');
          showToast(`Rs. ${amount.toLocaleString()} deposited to your wallet successfully!`, 'success');
          topupForm.reset();
          loadWalletData();
        } else {
          showToast(res.data?.message || 'Top-up failed.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });
}

// ==========================================
// 7. Dashboard Stats & Real Metrics
// ==========================================

async function loadWorkerDashboardStats() {
  if (!window.location.pathname.includes('worker/dashboard.html')) return;

  try {
    const res = await apiFetch('jobs.php?action=list');
    const availEl = $id('stat-available-jobs');
    if (availEl) availEl.textContent = (res.ok && res.data?.status === 'success' && Array.isArray(res.data.jobs)) ? res.data.jobs.length : '0';

    const banner = $id('subscription-banner');
    if (banner) banner.style.display = (res.ok && res.data?.has_job_access) ? '' : 'none';
  } catch (err) {
    console.warn('Worker dashboard available-jobs failed:', err);
  }

  let kycInfo = null;
  try {
    const res2 = await apiFetch('jobs.php?action=worker');
    let active = 0, completed = 0;
    if (res2.ok && res2.data?.status === 'success' && Array.isArray(res2.data.jobs)) {
      res2.data.jobs.forEach(j => {
        const jobStatus = (j.job_status || '').toLowerCase();
        const appStatus = (j.application_status || '').toLowerCase();
        if (appStatus === 'accepted' && jobStatus === 'completed') completed++;
        else if (appStatus === 'accepted' && (jobStatus === 'open' || jobStatus === 'in_progress')) active++;
      });
    }
    if ($id('stat-active-jobs')) $id('stat-active-jobs').textContent = active;
    if ($id('stat-completed-jobs')) $id('stat-completed-jobs').textContent = completed;
  } catch (err) {
    console.warn('Worker dashboard my-jobs failed:', err);
  }

  try {
    const kycRes = await apiFetch('kyc.php?action=status');
    if (kycRes.ok && kycRes.data?.status === 'success' && kycRes.data.data) {
      kycInfo = kycRes.data.data;
      const card = $id('verification-card');
      const cardText = $id('verification-card-text');
      const verified = !!kycInfo.is_verified;
      const verifyStatus = (kycInfo.verify_status || 'unverified').toLowerCase();

      if (cardText) {
        cardText.textContent = verified ? '✓ Verified Worker — Manage KYC' : `${kycInfo.status_label || 'Not Submitted'} — Manage KYC`;
      }
      if (card) {
        card.classList.toggle('verified', verified);
        card.classList.toggle('pending', !verified && verifyStatus === 'pending');
      }
    }
  } catch (err) {
    console.warn('Worker dashboard KYC status failed:', err);
  }

  try {
    let done = 0;
    const total = 5;
    const u = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
    if (u?.name || u?.full_name) done++;
    if (u?.phone) done++;
    if (u?.email) done++;
    if (kycInfo && (kycInfo.verify_status || 'unverified').toLowerCase() !== 'unverified') done++;

    const svcRes = await apiFetch('workers.php?action=my-services').catch(() => null);
    if (svcRes?.ok && svcRes.data?.services?.length > 0) done++;

    const pct = Math.round((done / total) * 100);
    if ($id('profile-completion-label')) $id('profile-completion-label').textContent = `Profile ${pct}% complete`;
    if ($id('profile-completion-bar')) $id('profile-completion-bar').style.width = pct + '%';
    if ($id('profile-completion-percent')) $id('profile-completion-percent').textContent = pct + '%';
  } catch (err) {
    console.warn('Worker dashboard profile completion failed:', err);
  }
}
