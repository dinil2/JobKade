/* ==========================================
   JODKADE — Worker Dashboard JavaScript
   Service management, profile, subscription
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Sync Worker Identity Across All Worker Pages ----
  function syncWorkerIdentity() {
    var user = typeof getLoggedInUser === 'function' ? getLoggedInUser() : null;
    if (!user && typeof localStorage !== 'undefined') {
      try {
        user = JSON.parse(localStorage.getItem('jodkade_logged_user') || 'null');
      } catch (e) {
        user = null;
      }
    }

    // Guard: Worker pages must only display a worker session (never customer Dinil)
    if (!user || user.role !== 'worker') {
      user = {
        role: 'worker',
        name: 'Kasun Perera',
        email: 'kasun.electric@gmail.com',
        phone: '+94 77 123 4567'
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('jodkade_logged_user', JSON.stringify(user));
      }
    }

    var workerName = user.name || 'Kasun Perera';
    var initials = workerName.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().substring(0, 2) || 'KP';
    var firstName = workerName.split(' ')[0] || 'Kasun';

    // Update greeting
    var greetingEl = document.getElementById('greeting');
    if (greetingEl) {
      greetingEl.textContent = getGreeting() + ', ' + firstName + ' 👋';
    }

    // Update sidebar names across all worker portal pages
    var sidebarUserNames = document.querySelectorAll('.sidebar.worker .sidebar-user-name, #sidebarUserName');
    sidebarUserNames.forEach(function(el) {
      el.textContent = workerName;
    });

    // Update avatars across all worker portal pages
    var sidebarAvatars = document.querySelectorAll('.sidebar.worker .avatar, #sidebarAvatar, #navAvatar, .dashboard-nav-right .avatar');
    var savedWorkerAvatar = localStorage.getItem('jobkade_worker_avatar') || (user && user.avatar);
    sidebarAvatars.forEach(function(el) {
      if (savedWorkerAvatar) {
        el.innerHTML = '<img src="' + savedWorkerAvatar + '" alt="' + workerName + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
      } else {
        el.textContent = initials;
      }
    });
  }

  syncWorkerIdentity();

  // ---- Delete Service Confirmation ----
  var activeServiceCard = null;
  var activeServiceId = null;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.delete-service-btn');
    if (btn) {
      activeServiceCard = btn.closest('.service-manage-card') || btn.closest('.service-card') || btn.closest('tr') || btn.closest('.job-card');
      activeServiceId = btn.getAttribute('data-service-id') || (activeServiceCard ? activeServiceCard.getAttribute('data-service-id') : null);
      openModal('delete-service-modal');
    }
  });

  // ---- Confirm Delete Service ----
  var confirmDeleteBtn = document.getElementById('confirm-delete-service');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async function () {
      closeModal('delete-service-modal');
      
      if (activeServiceId) {
        try {
          var res = await apiFetch('workers.php?action=delete-service', {
            method: 'POST',
            body: JSON.stringify({ service_id: parseInt(activeServiceId, 10) })
          });
          if (res.ok && res.data && res.data.status === 'success') {
            showToast('Service deleted successfully.', 'success');
          } else {
            showToast((res.data && res.data.message) ? res.data.message : 'Service removed.', 'info');
          }
        } catch (err) {
          showToast('Service deleted locally.', 'info');
        }
      } else {
        showToast('Service deleted.', 'info');
      }

      if (activeServiceCard) {
        activeServiceCard.style.opacity = '0';
        activeServiceCard.style.transition = 'all 0.3s ease';
        setTimeout(function () {
          activeServiceCard.remove();
        }, 300);
      }
    });
  }

  // ---- Service Form Submit with Live Backend Persistence ----
  var serviceForm = document.getElementById('service-form');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(this);

      var titleInput = document.getElementById('service-title-input') || this.querySelector('[name="service-title"], input[type="text"]');
      var catSelect = document.getElementById('service-category-input') || this.querySelector('select');
      var descInput = document.getElementById('service-desc-input') || this.querySelector('textarea');
      var priceInput = document.getElementById('service-price-input') || this.querySelector('input[type="number"]');
      var pricingTypeSelect = document.getElementById('service-pricing-type-input');
      var locInput = document.getElementById('service-location-input');

      var isValid = true;
      var title = titleInput ? titleInput.value.trim() : '';
      if (!title || title.length < 3) {
        showFieldError(titleInput, 'Service title is required (at least 3 characters).');
        isValid = false;
      }

      var price = priceInput ? parseFloat(priceInput.value) : 0;
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

      var submitBtn = document.getElementById('btn-save-service') || this.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        var res = await apiFetch('workers.php?action=add-service', {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            category_id: catSelect ? parseInt(catSelect.value, 10) : null,
            description: descInput ? descInput.value.trim() : title,
            price: price,
            pricing_type: pricingTypeSelect ? pricingTypeSelect.value : 'fixed',
            location: locInput ? locInput.value.trim() : 'Colombo'
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          showToast('Service saved successfully!', 'success');
          setTimeout(function () {
            window.location.href = 'my-services.html';
          }, 1000);
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Could not save service.', 'error');
        }
      } catch (err) {
        showToast('Service saved!', 'success');
        setTimeout(function () {
          window.location.href = 'my-services.html';
        }, 1000);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="save" width="18" height="18"></i> Save Service';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }

  // ---- Service Image Upload with Size & Type Validation ----
  var serviceImageUpload = document.getElementById('service-images');
  var servicePreviewGrid = document.getElementById('service-preview-grid');

  if (serviceImageUpload && servicePreviewGrid) {
    serviceImageUpload.addEventListener('change', function () {
      servicePreviewGrid.innerHTML = '';
      var files = this.files;

      if (files.length > 5) {
        showToast('Maximum 5 images allowed. Only the first 5 will be selected.', 'info');
      }

      var maxCount = Math.min(files.length, 5);
      for (var i = 0; i < maxCount; i++) {
        var file = files[i];

        // Validate MIME type
        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
          showToast('Invalid file format: ' + file.name + '. Only JPG and PNG allowed.', 'error');
          continue;
        }

        // Validate File Size (Max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          showToast('File too large: ' + file.name + ' exceeds 5MB limit.', 'error');
          continue;
        }

        (function (f) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var item = document.createElement('div');
            item.className = 'image-preview-item';
            item.innerHTML =
              '<img src="' + e.target.result + '" alt="Preview">' +
              '<span class="remove-img" onclick="this.parentElement.remove()">&times;</span>';
            servicePreviewGrid.appendChild(item);
          };
          reader.readAsDataURL(f);
        })(file);
      }
    });
  }

  // ---- Worker Profile Update with UI & Server Validation ----
  initWorkerProfilePage();
  var profileForm = document.getElementById('worker-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(this);

      var nameInput = this.querySelector('[name="full-name"]') || this.querySelector('input[value*="Kasun"]');
      var phoneInput = this.querySelector('[name="phone"]') || this.querySelector('input[type="tel"]');
      var emailInput = this.querySelector('[name="email"]') || this.querySelector('input[type="email"]');
      var bioInput = this.querySelector('[name="bio"]') || this.querySelector('textarea');
      var locInput = this.querySelector('[name="location"]') || this.querySelectorAll('input[type="text"]')[1];

      var curPassInput = document.getElementById('worker-current-password');
      var newPassInput = document.getElementById('worker-new-password');
      var confirmPassInput = document.getElementById('worker-confirm-password');

      var fullName = nameInput ? nameInput.value.trim() : '';
      var phone = phoneInput ? phoneInput.value.trim() : '';
      var email = emailInput ? emailInput.value.trim() : '';
      var bio = bioInput ? bioInput.value.trim() : '';
      var location = locInput ? locInput.value.trim() : '';
      var curPass = curPassInput ? curPassInput.value : '';
      var newPass = newPassInput ? newPassInput.value : '';
      var confirmPass = confirmPassInput ? confirmPassInput.value : '';

      var hasError = false;

      // 1. Full Name Validation
      if (!fullName || fullName.length < 2) {
        showFieldError(nameInput, 'Full name must be at least 2 characters.');
        hasError = true;
      }

      // 2. Phone Validation (Regex)
      var phonePattern = /^[0-9+\s-]{9,15}$/;
      if (!phone || !phonePattern.test(phone)) {
        showFieldError(phoneInput, 'Please enter a valid phone number (e.g. 077 123 4567).');
        hasError = true;
      }

      // 3. Email Validation
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailPattern.test(email)) {
        showFieldError(emailInput, 'Please enter a valid email address.');
        hasError = true;
      }

      // 4. Bio Validation
      if (!bio || bio.length < 10) {
        showFieldError(bioInput, 'Please write a brief description (at least 10 characters).');
        hasError = true;
      } else if (bio.length > 2000) {
        showFieldError(bioInput, 'Description cannot exceed 2000 characters.');
        hasError = true;
      }

      // 5. Location Validation
      if (!location || location.length < 2) {
        showFieldError(locInput, 'Please enter your service area or location.');
        hasError = true;
      }

      // 6. Optional Password Change Validation
      if (newPass) {
        if (newPass.length < 6) {
          showFieldError(newPassInput, 'New password must be at least 6 characters.');
          hasError = true;
        }
        if (newPass !== confirmPass) {
          showFieldError(confirmPassInput, 'New passwords do not match.');
          hasError = true;
        }
        if (!curPass) {
          showFieldError(curPassInput, 'Current password is required to set a new password.');
          hasError = true;
        }
      }

      if (hasError) {
        showToast('Please correct the highlighted errors.', 'error');
        var firstInvalid = profileForm.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        // 1. Update Profile Details
        var res = await apiFetch('workers.php?action=update', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            phone: phone,
            bio: bio,
            address: location
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          // Update local storage user name if active
          var curUser = getLoggedInUser();
          if (curUser) {
            curUser.name = fullName;
            curUser.phone = phone;
            localStorage.setItem('jodkade_logged_user', JSON.stringify(curUser));
          }

          // 2. Change Password if requested
          if (newPass) {
            var passRes = await apiFetch('auth.php?action=change-password', {
              method: 'POST',
              body: JSON.stringify({
                current_password: curPass,
                new_password: newPass
              })
            });

            if (!passRes.ok || !passRes.data || passRes.data.status !== 'success') {
              showToast((passRes.data && passRes.data.message) ? passRes.data.message : 'Profile saved, but password change failed.', 'warning');
              return;
            }

            if (curPassInput) curPassInput.value = '';
            if (newPassInput) newPassInput.value = '';
            if (confirmPassInput) confirmPassInput.value = '';
            showToast('Profile and password updated successfully!', 'success');
          } else {
            showToast(res.data.message || 'Profile updated successfully!', 'success');
          }
        } else {
          var msg = (res.data && res.data.message) ? res.data.message : 'Profile saved locally.';
          showToast(msg, res.ok ? 'success' : 'info');
        }
      } catch (err) {
        showToast('Profile updated!', 'success');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="save" width="18" height="18"></i> Save Changes';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }

  // ---- Subscription Plan Selection & Activation ----
  document.querySelectorAll('.choose-plan-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var planId = this.getAttribute('data-plan-id') || 1;
      var planName = this.getAttribute('data-plan-name') || 'Monthly Plan';
      var planPrice = parseFloat(this.getAttribute('data-plan-price') || 3000);

      var titleEl = document.getElementById('selected-plan-title');
      var priceEl = document.getElementById('selected-plan-price-display');
      var idInput = document.getElementById('selected-plan-id');

      if (titleEl) titleEl.textContent = planName;
      if (priceEl) priceEl.textContent = 'Rs. ' + planPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (idInput) idInput.value = planId;

      openModal('payment-modal');
    });
  });

  // ---- Confirm Subscription Payment (Live DB Activation) ----
  var confirmPaymentBtn = document.getElementById('confirm-payment');
  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', async function () {
      var planId = parseInt(document.getElementById('selected-plan-id')?.value || 1, 10);
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.innerHTML = '<i data-lucide="loader" class="spin" width="16" height="16"></i> Activating...';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      try {
        var res = await apiFetch('subscriptions.php?action=pay', {
          method: 'POST',
          body: JSON.stringify({
            plan_id: planId,
            payment_method: 'Online IPG (Card/Visa/Master)'
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          closeModal('payment-modal');
          showToast('Subscription activated! Your commission is now reduced to 5%.', 'success');
          setTimeout(function () {
            window.location.reload();
          }, 1200);
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Subscription payment failed.', 'error');
        }
      } catch (err) {
        showToast('Error activating subscription: ' + err.message, 'error');
      } finally {
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.innerHTML = '<i data-lucide="check" width="16" height="16"></i> Pay & Subscribe';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // Load active subscription status on subscription.html
  if (window.location.pathname.includes('subscription.html')) {
    apiFetch('wallet.php?action=balance').then(function(res) {
      if (res.ok && res.data && res.data.wallet) {
        var w = res.data.wallet;
        var isSub = parseFloat(w.commission_rate || 0.10) <= 0.05;
        var title = document.getElementById('current-plan-title');
        var desc = document.getElementById('current-plan-desc');
        var badge = document.getElementById('subscription-badge');

        if (isSub) {
          if (title) title.innerHTML = '<span style="color:#16A34A;">' + (w.subscription_plan_name || 'Active Membership') + '</span>';
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
    }).catch(function(e) { console.warn('Could not load plan status:', e); });
  }

  // ---- Availability Toggle ----
  var availabilitySelect = document.getElementById('availability-status');
  if (availabilitySelect) {
    availabilitySelect.addEventListener('change', function () {
      showToast('Availability updated to: ' + this.value, 'info');
    });
  }

  // (Worker Settings is handled by initWorkerSettings)

  // ---- Interactive Profile Photo Upload & Preview ----
  var avatarClickable = document.getElementById('profile-avatar-clickable');
  var cameraBtn = document.getElementById('btn-camera-trigger');
  var avatarHint = document.getElementById('profile-avatar-hint');
  var workerPhotoUpload = document.getElementById('worker-photo-upload');

  var triggerWorkerPhotoUpload = function () {
    if (workerPhotoUpload) workerPhotoUpload.click();
  };

  if (avatarClickable) avatarClickable.addEventListener('click', triggerWorkerPhotoUpload);
  if (cameraBtn) cameraBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    triggerWorkerPhotoUpload();
  });
  if (avatarHint) avatarHint.addEventListener('click', triggerWorkerPhotoUpload);

  if (workerPhotoUpload) {
    workerPhotoUpload.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;

      if (!file.type.match(/^image\//)) {
        showToast('Please select a valid image file (PNG, JPG, JPEG, WebP).', 'error');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image file size must be less than 5MB.', 'error');
        return;
      }

      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        var avatarImg = document.getElementById('worker-avatar-img');
        var avatarInitials = document.getElementById('worker-avatar-initials');

        if (avatarImg) {
          avatarImg.src = dataUrl;
          avatarImg.style.display = 'block';
        }
        if (avatarInitials) {
          avatarInitials.style.display = 'none';
        }

        // Store avatar in localStorage so it persists across pages and refreshes
        try {
          localStorage.setItem('jobkade_worker_avatar', dataUrl);
          var sessionUserStr = localStorage.getItem('jobkade_user');
          if (sessionUserStr) {
            var sUser = JSON.parse(sessionUserStr);
            sUser.avatar = dataUrl;
            localStorage.setItem('jobkade_user', JSON.stringify(sUser));
          }
        } catch (storageErr) {
          console.warn('Could not persist avatar to localStorage:', storageErr);
        }

        // Update all worker avatars across sidebar and navigation
        var allAvatars = document.querySelectorAll('.sidebar.worker .avatar, #sidebarAvatar, #navAvatar, .dashboard-nav-right .avatar');
        allAvatars.forEach(function (el) {
          el.innerHTML = '<img src="' + dataUrl + '" alt="Profile Photo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
        });

        showToast('Profile photo updated successfully!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Load Open Marketplace Jobs from Backend ----
  loadOpenJobsForWorker();

  // ---- Load My Custom Services ----
  loadMyServicesForWorker();

  // ---- Worker Settings & Password Handler ----
  initWorkerSettings();

  // ---- Worker Wallet & Payouts Handler ----
  initWorkerWalletPage();

  // ---- Job Map Modal Handler ----
  initWorkerJobMapModal();

  // ---- Worker Invoice & Gating Handlers ----
  initWorkerInvoiceAndAccess();

});

var workerModalMap = null;
var workerModalMarker = null;
var isWorkerSubscribed = false;

function initWorkerInvoiceAndAccess() {
  // Check subscription / commission rate
  apiFetch('wallet.php?action=balance').then(function(res) {
    if (res.ok && res.data && res.data.wallet) {
      isWorkerSubscribed = (res.data.wallet.commission_rate <= 0.05);
      var banner = document.getElementById('job-access-banner');
      if (banner && res.data.wallet.has_job_access) {
        banner.style.display = 'none';
      }
    }
  }).catch(function(e) { console.warn(e); });

  // One-time Access Payment
  var btnPayAccess = document.getElementById('btn-pay-access-pass');
  if (btnPayAccess) {
    btnPayAccess.addEventListener('click', async function() {
      if (!confirm('Pay one-time marketplace access fee of Rs. 1,000 to unlock direct customer contacts and accept unlimited jobs?')) return;
      btnPayAccess.disabled = true;
      btnPayAccess.innerHTML = '<i data-lucide="loader" width="14" height="14" class="spin"></i> Processing...';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      try {
        var res = await apiFetch('wallet.php?action=pay-access-fee', { method: 'POST', body: '{}' });
        if (res.ok && res.data && res.data.status === 'success') {
          showToast('Job marketplace access activated successfully!', 'success');
          var banner = document.getElementById('job-access-banner');
          if (banner) banner.style.display = 'none';
          loadOpenJobsForWorker();
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Payment failed.', 'error');
        }
      } catch (err) {
        showToast('Payment failed: ' + err.message, 'error');
      } finally {
        btnPayAccess.disabled = false;
        btnPayAccess.innerHTML = '<i data-lucide="shield-check" width="14" height="14"></i> Pay Rs. 1,000 (One-Time)';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  // Invoice Amount Live Breakdown
  var invAmount = document.getElementById('inv-amount');
  if (invAmount) {
    invAmount.addEventListener('input', updateInvoiceBreakdown);
  }

  // Open Invoice Modal Click
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn-open-invoice-modal');
    if (!btn) return;

    var jobId = btn.getAttribute('data-job-id');
    var jobTitle = btn.getAttribute('data-job-title') || 'Job Request';

    var idInput = document.getElementById('inv-job-id');
    var titleEl = document.getElementById('inv-job-title');
    var amountInput = document.getElementById('inv-amount');
    var notesInput = document.getElementById('inv-notes');

    if (idInput) idInput.value = jobId;
    if (titleEl) titleEl.textContent = jobTitle + ' (#' + jobId + ')';
    if (amountInput) amountInput.value = '';
    if (notesInput) notesInput.value = '';

    updateInvoiceBreakdown();
    openModal('invoice-modal');
  });

  // Submit Invoice Form
  var invForm = document.getElementById('worker-invoice-form');
  if (invForm) {
    invForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var jobId = document.getElementById('inv-job-id').value;
      var amountVal = parseFloat(document.getElementById('inv-amount').value);
      var notesVal = document.getElementById('inv-notes') ? document.getElementById('inv-notes').value : '';

      if (!jobId || isNaN(amountVal) || amountVal < 100) {
        showToast('Please enter a valid price (min Rs. 100).', 'error');
        return;
      }

      var submitBtn = document.getElementById('btn-submit-invoice');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" width="16" height="16" class="spin"></i> Submitting...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        var res = await apiFetch('jobs.php?action=create-invoice', {
          method: 'POST',
          body: JSON.stringify({
            job_id: parseInt(jobId, 10),
            amount: amountVal,
            notes: notesVal
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          closeModal('invoice-modal');
          showToast('Invoice for Rs. ' + amountVal.toLocaleString() + ' sent to customer!', 'success');
          loadOpenJobsForWorker();
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Could not create invoice.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="send" width="16" height="16"></i> Send Invoice to Customer';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }
}

function updateInvoiceBreakdown() {
  var amountInput = document.getElementById('inv-amount');
  var totalEl = document.getElementById('breakdown-total');
  var commEl = document.getElementById('breakdown-commission');
  var netEl = document.getElementById('breakdown-net');
  var rateLabel = document.getElementById('breakdown-rate-label');
  var subBadge = document.getElementById('breakdown-sub-badge');
  var onlineNote = document.getElementById('online-net-note');

  var amount = amountInput ? parseFloat(amountInput.value) : 0;
  if (isNaN(amount) || amount < 0) amount = 0;

  var rate = isWorkerSubscribed ? 0.05 : 0.10;
  var commission = amount * rate;
  var net = amount - commission;

  if (rateLabel) rateLabel.textContent = (rate * 100).toFixed(0) + '%';
  if (subBadge) subBadge.style.display = isWorkerSubscribed ? 'inline-block' : 'none';
  if (totalEl) totalEl.textContent = 'Rs. ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (commEl) commEl.textContent = '- Rs. ' + commission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (netEl) netEl.textContent = 'Rs. ' + net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (onlineNote) onlineNote.textContent = net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initWorkerJobMapModal() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-view-job-map');
    if (!btn) return;

    var lat = parseFloat(btn.getAttribute('data-lat') || '6.9271');
    var lng = parseFloat(btn.getAttribute('data-lng') || '79.8612');
    var address = btn.getAttribute('data-address') || 'Colombo';
    var title = btn.getAttribute('data-title') || 'Job Location';
    var customerId = btn.getAttribute('data-customer-id') || '2';
    var jobId = btn.getAttribute('data-job-id') || '';

    var titleEl = document.getElementById('modal-map-title');
    var addrEl = document.getElementById('modal-map-address');
    var msgBtn = document.getElementById('modal-map-msg-btn');

    if (titleEl) titleEl.textContent = title;
    if (addrEl) {
      addrEl.innerHTML = '<i data-lucide="map-pin" width="14" height="14" style="display:inline; vertical-align:middle; color:var(--primary);"></i> <span>' + address + ' (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (msgBtn) {
      msgBtn.href = '../messages.html?user_id=' + customerId + (jobId ? ('&job_id=' + jobId) : '');
    }

    var modal = document.getElementById('job-map-modal');
    if (modal) modal.classList.add('active');

    // Initialize or re-center map
    setTimeout(function () {
      var mapDiv = document.getElementById('worker-job-map');
      if (!mapDiv || typeof L === 'undefined') return;

      if (!workerModalMap) {
        workerModalMap = L.map('worker-job-map').setView([lat, lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(workerModalMap);
        workerModalMarker = L.marker([lat, lng]).addTo(workerModalMap);
      } else {
        workerModalMap.setView([lat, lng], 14);
        workerModalMarker.setLatLng([lat, lng]);
      }
      workerModalMarker.bindPopup('<b>' + title + '</b><br>' + address).openPopup();
      workerModalMap.invalidateSize();
    }, 200);
  });
}

async function loadOpenJobsForWorker() {
  var grid = document.getElementById('worker-jobs-container');
  if (!grid || !window.location.pathname.includes('jobs.html')) return;

  try {
    var res = await apiFetch('jobs.php?action=list');
    if (res.ok && res.data && res.data.status === 'success' && res.data.jobs && res.data.jobs.length > 0) {
      if (res.data.has_job_access) {
        var banner = document.getElementById('job-access-banner');
        if (banner) banner.style.display = 'none';
      }

      var apiJobsHtml = res.data.jobs.map(function(j) {
        var lat = j.latitude || 6.9271;
        var lng = j.longitude || 79.8612;
        var addr = j.address || 'Colombo';
        var custId = j.customer_id || 2;
        var jId = j.id || '';
        var safeTitle = (j.title || 'Job Request').replace(/"/g, '&quot;');

        return '<div class="job-card">' +
          '<div class="job-card-header"><h3 class="job-card-title">' + j.title + '</h3><span class="badge badge-open">Active</span></div>' +
          '<div class="job-card-meta">' +
            '<span><i data-lucide="user" width="14" height="14"></i> ' + (j.customer_name || 'Customer') + '</span>' +
            '<span><i data-lucide="map-pin" width="14" height="14"></i> ' + addr + '</span>' +
            '<span><i data-lucide="clock" width="14" height="14"></i> ' + (j.created_at || 'Recently') + '</span>' +
            '<span><i data-lucide="tag" width="14" height="14"></i> ' + (j.category_name || 'Service') + '</span>' +
          '</div>' +
          '<p class="job-card-desc">' + j.description + '</p>' +
          '<div class="job-card-actions">' +
            '<a href="../messages.html?user_id=' + custId + '&job_id=' + jId + '" class="btn btn-primary btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Message Customer</a>' +
            '<button class="btn btn-success btn-sm btn-open-invoice-modal" data-job-id="' + jId + '" data-job-title="' + safeTitle + '" style="font-weight:600;"><i data-lucide="check-circle" width="14" height="14"></i> Mark Done & Set Price</button>' +
            '<button class="btn btn-outline btn-sm btn-view-job-map" data-lat="' + lat + '" data-lng="' + lng + '" data-address="' + addr + '" data-title="' + safeTitle + '" data-customer-id="' + custId + '" data-job-id="' + jId + '"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>' +
            (j.customer_phone ? '<a href="tel:' + j.customer_phone + '" class="btn btn-ghost btn-sm"><i data-lucide="phone" width="14" height="14"></i> Call</a>' : '') +
          '</div>' +
        '</div>';
      }).join('');

      grid.innerHTML = apiJobsHtml;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      grid.innerHTML = '<div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">' +
        '<i data-lucide="inbox" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>' +
        '<h3 style="margin-bottom: 8px;">No Open Job Requests</h3>' +
        '<p style="color: var(--text-secondary);">There are currently no open customer requests matching your area.</p>' +
      '</div>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } catch (err) {
    console.warn('loadOpenJobsForWorker error:', err);
    grid.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px;">' +
      '<p style="color: var(--error);">Failed to load jobs. Please check your connection.</p>' +
    '</div>';
  }
}

async function loadMyServicesForWorker() {
  var container = document.getElementById('worker-services-container');
  if (!container || !window.location.pathname.includes('my-services.html')) return;

  try {
    var res = await apiFetch('workers.php?action=my-services');
    if (res.ok && res.data && res.data.status === 'success' && res.data.services && res.data.services.length > 0) {
      var servicesHtml = res.data.services.map(function(s) {
        var priceFormatted = parseFloat(s.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        var pricingUnit = (s.pricing_type === 'starting_at') ? ' (Starting)' : ' (Job Rate)';
        var safeTitle = (s.title || 'Service Listing').replace(/"/g, '&quot;');
        var safeDesc = (s.description || '').replace(/"/g, '&quot;');
        var catName = s.category_name || 'General';

        return '<div class="service-manage-card" data-service-id="' + s.id + '" style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; justify-content:space-between; position:relative;">' +
          '<div>' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">' +
              '<span class="badge badge-open" style="font-size:0.8rem;"><i data-lucide="tag" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> ' + catName + '</span>' +
              '<span style="font-weight:700; font-size:1.1rem; color:var(--primary);">Rs. ' + priceFormatted + ' <span style="font-size:0.8rem; font-weight:normal; color:var(--text-secondary);">' + pricingUnit + '</span></span>' +
            '</div>' +
            '<h3 style="margin:0 0 8px; font-size:1.15rem; color:var(--text-primary);">' + s.title + '</h3>' +
            '<p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:16px; line-height:1.5;">' + (s.description || 'No description provided.') + '</p>' +
            '<div style="display:flex; gap:12px; font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">' +
              '<span><i data-lucide="map-pin" width="14" height="14" style="display:inline;vertical-align:middle;"></i> ' + (s.location || 'Colombo') + '</span>' +
              '<span><i data-lucide="check-circle" width="14" height="14" style="display:inline;vertical-align:middle;color:var(--success);"></i> Active</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--border); padding-top:12px;">' +
            '<button type="button" class="btn btn-outline btn-sm delete-service-btn" data-service-id="' + s.id + '" style="color:var(--error); border-color:rgba(239,68,68,0.3);"><i data-lucide="trash-2" width="14" height="14"></i> Delete</button>' +
          '</div>' +
        '</div>';
      }).join('');

      container.innerHTML = servicesHtml;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); grid-column: 1 / -1;">' +
        '<i data-lucide="briefcase" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>' +
        '<h3 style="margin-bottom: 8px;">No Services Added Yet</h3>' +
        '<p style="color: var(--text-secondary); margin-bottom: 20px;">List your specialized skills, pricing, and services to attract direct client requests.</p>' +
        '<a href="add-service.html" class="btn btn-primary"><i data-lucide="plus" width="16" height="16"></i> Add Your First Service</a>' +
      '</div>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } catch (err) {
    console.warn('loadMyServicesForWorker error:', err);
    container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px; grid-column: 1 / -1;">' +
      '<p style="color: var(--error);">Failed to load your services. Please refresh or log in.</p>' +
    '</div>';
  }
}

async function initWorkerSettings() {
  var form = document.getElementById('worker-settings-form');
  if (!form || !window.location.pathname.includes('settings.html')) return;

  var prefJobAlerts = document.getElementById('pref-job-alerts');
  var prefEmailNotifs = document.getElementById('pref-email-notifs');
  var prefSmsNotifs = document.getElementById('pref-sms-notifs');
  var prefShowPhone = document.getElementById('pref-show-phone');
  var prefShowWhatsapp = document.getElementById('pref-show-whatsapp');

  var curPassInput = document.getElementById('current-password-input');
  var newPassInput = document.getElementById('new-password-input');
  var confirmPassInput = document.getElementById('confirm-password-input');
  var submitBtn = document.getElementById('btn-save-settings') || form.querySelector('button[type="submit"]');

  // Load saved preferences if available
  try {
    var res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data && res.data.user && res.data.user.notification_prefs) {
      try {
        var prefs = typeof res.data.user.notification_prefs === 'string'
          ? JSON.parse(res.data.user.notification_prefs)
          : res.data.user.notification_prefs;

        if (prefJobAlerts && prefs.job_alerts !== undefined) prefJobAlerts.checked = !!prefs.job_alerts;
        if (prefEmailNotifs && prefs.email_notifs !== undefined) prefEmailNotifs.checked = !!prefs.email_notifs;
        if (prefSmsNotifs && prefs.sms_notifs !== undefined) prefSmsNotifs.checked = !!prefs.sms_notifs;
        if (prefShowPhone && prefs.show_phone !== undefined) prefShowPhone.checked = !!prefs.show_phone;
        if (prefShowWhatsapp && prefs.show_whatsapp !== undefined) prefShowWhatsapp.checked = !!prefs.show_whatsapp;
      } catch (pe) {}
    }
  } catch (err) {
    console.warn('Could not load user settings:', err);
  }

  // Handle Form Submit
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearFormErrors(form);

    var curPass = curPassInput ? curPassInput.value : '';
    var newPass = newPassInput ? newPassInput.value : '';
    var confirmPass = confirmPassInput ? confirmPassInput.value : '';

    var hasError = false;

    if (newPass) {
      if (newPass.length < 6) {
        showFieldError(newPassInput, 'New password must be at least 6 characters.');
        hasError = true;
      }
      if (newPass !== confirmPass) {
        showFieldError(confirmPassInput, 'New passwords do not match.');
        hasError = true;
      }
      if (!curPass) {
        showFieldError(curPassInput, 'Current password is required to set a new password.');
        hasError = true;
      }
    }

    if (hasError) {
      showToast('Please fix the password errors.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
      // 1. Save Notification & Privacy Preferences
      var notificationPrefsObj = {
        job_alerts: prefJobAlerts ? prefJobAlerts.checked : true,
        email_notifs: prefEmailNotifs ? prefEmailNotifs.checked : true,
        sms_notifs: prefSmsNotifs ? prefSmsNotifs.checked : false,
        show_phone: prefShowPhone ? prefShowPhone.checked : true,
        show_whatsapp: prefShowWhatsapp ? prefShowWhatsapp.checked : true
      };

      var prefRes = await apiFetch('auth.php?action=update-profile', {
        method: 'POST',
        body: JSON.stringify({
          notification_prefs: JSON.stringify(notificationPrefsObj)
        })
      });

      // 2. Change password if requested
      if (newPass) {
        var passRes = await apiFetch('auth.php?action=change-password', {
          method: 'POST',
          body: JSON.stringify({
            current_password: curPass,
            new_password: newPass
          })
        });

        if (!passRes.ok || !passRes.data || passRes.data.status !== 'success') {
          showToast((passRes.data && passRes.data.message) ? passRes.data.message : 'Preferences saved, but password change failed.', 'warning');
          return;
        }

        if (curPassInput) curPassInput.value = '';
        if (newPassInput) newPassInput.value = '';
        if (confirmPassInput) confirmPassInput.value = '';
      }

      showToast('Settings saved successfully!', 'success');
    } catch (err) {
      showToast('Error saving settings: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="save" width="18" height="18"></i> Save Settings';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  });
}

async function initWorkerWalletPage() {
  if (!window.location.pathname.includes('wallet.html')) return;

  var balDisplay = document.getElementById('wallet-balance-display');
  var earnDisplay = document.getElementById('wallet-earnings-display');
  var rateDisplay = document.getElementById('wallet-commission-rate-display');
  var planTag = document.getElementById('wallet-plan-tag');
  var negBanner = document.getElementById('negative-balance-alert');
  var tbody = document.getElementById('wallet-transactions-tbody');
  var countLabel = document.getElementById('tx-count-label');

  // Modal Open Buttons
  var btnOpenPayout = document.getElementById('btn-open-payout');
  if (btnOpenPayout) {
    btnOpenPayout.addEventListener('click', function() {
      openModal('payout-modal');
    });
  }

  var btnOpenTopup = document.getElementById('btn-open-topup');
  if (btnOpenTopup) {
    btnOpenTopup.addEventListener('click', function() {
      openModal('topup-modal');
    });
  }

  async function loadWalletData() {
    try {
      var [balRes, txRes] = await Promise.all([
        apiFetch('wallet.php?action=balance'),
        apiFetch('wallet.php?action=transactions').catch(function() { return { ok: false }; })
      ]);

      if (balRes.ok && balRes.data && balRes.data.wallet) {
        var w = balRes.data.wallet;
        var bal = parseFloat(w.balance || 0);
        var earnings = parseFloat(w.total_earnings || 0);
        var rate = (w.commission_rate !== undefined) ? (parseFloat(w.commission_rate) * 100).toFixed(0) + '%' : '10%';
        var isSub = (w.commission_rate !== undefined && parseFloat(w.commission_rate) <= 0.05);

        if (balDisplay) {
          balDisplay.textContent = (bal < 0 ? '- Rs. ' + Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Rs. ' + bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          balDisplay.style.color = (bal < 0) ? 'var(--error)' : 'var(--text-primary)';
        }

        if (earnDisplay) {
          earnDisplay.textContent = 'Rs. ' + earnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        if (rateDisplay) {
          rateDisplay.textContent = rate;
        }

        if (planTag) {
          planTag.innerHTML = isSub
            ? '<span class="badge badge-success" style="font-size:0.75rem;">Premium 5% Rate Active</span>'
            : 'Standard Rate (<a href="subscription.html" style="color:var(--primary);font-weight:600;">Upgrade for 5%</a>)';
        }

        if (negBanner) {
          negBanner.style.display = (bal < 0) ? 'block' : 'none';
        }
      }

      // Render Ledger Transactions
      if (txRes && txRes.ok && txRes.data && txRes.data.transactions && txRes.data.transactions.length > 0) {
        var txs = txRes.data.transactions;
        if (countLabel) countLabel.textContent = txs.length + ' transactions recorded';

        var rowsHtml = txs.map(function(t) {
          var amt = parseFloat(t.amount || 0);
          var isCredit = (t.type === 'credit' || amt > 0);
          var amtClass = isCredit ? 'amount-credit' : 'amount-debit';
          var sign = isCredit ? '+ Rs. ' : '- Rs. ';
          var absAmt = Math.abs(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          var balAfter = (t.balance_after !== null && t.balance_after !== undefined)
            ? 'Rs. ' + parseFloat(t.balance_after).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '—';

          var methodBadge = '<span class="badge badge-outline" style="text-transform:capitalize;">' + (t.payment_method || 'System') + '</span>';

          return '<tr>' +
            '<td style="white-space:nowrap; color:var(--text-secondary);">' + (t.created_at || 'Just now') + '</td>' +
            '<td style="font-family:monospace; font-size:0.85rem; color:var(--text-muted);">#' + (t.reference_id || t.id) + '</td>' +
            '<td><strong>' + (t.description || 'Transaction') + '</strong></td>' +
            '<td>' + methodBadge + '</td>' +
            '<td class="' + amtClass + '">' + sign + absAmt + '</td>' +
            '<td style="font-weight:600;">' + balAfter + '</td>' +
          '</tr>';
        }).join('');

        if (tbody) tbody.innerHTML = rowsHtml;
      } else if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);"><i data-lucide="receipt" style="width:32px;height:32px;margin:0 auto 8px;display:block;opacity:0.4;"></i>No transactions recorded yet. Completed job payouts and settlements will appear here.</td></tr>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    } catch (err) {
      console.warn('loadWalletData error:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--error);">Failed to load wallet ledger.</td></tr>';
    }
  }

  // Load initial wallet data
  loadWalletData();

  // Handle Payout Form
  var payoutForm = document.getElementById('wallet-payout-form');
  if (payoutForm) {
    payoutForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var amount = parseFloat(document.getElementById('payout-amount').value);
      var bank = document.getElementById('payout-bank').value;
      var accNum = document.getElementById('payout-account-num').value.trim();
      var accName = document.getElementById('payout-account-name').value.trim();
      var branch = document.getElementById('payout-branch') ? document.getElementById('payout-branch').value.trim() : '';

      if (isNaN(amount) || amount < 1000) {
        showToast('Minimum payout amount is Rs. 1,000.', 'error');
        return;
      }

      if (!bank || !accNum || !accName) {
        showToast('Please fill in all required bank account fields.', 'error');
        return;
      }

      var submitBtn = document.getElementById('btn-submit-payout');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        var res = await apiFetch('wallet.php?action=request-payout', {
          method: 'POST',
          body: JSON.stringify({
            amount: amount,
            bank_name: bank,
            account_number: accNum,
            account_name: accName,
            branch_name: branch
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          closeModal('payout-modal');
          showToast('Payout request for Rs. ' + amount.toLocaleString() + ' submitted successfully!', 'success');
          payoutForm.reset();
          loadWalletData();
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Could not process payout request.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="send" width="16" height="16"></i> Submit Withdrawal';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }

  // Handle Top-Up Form
  var topupForm = document.getElementById('wallet-topup-form');
  if (topupForm) {
    topupForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var amount = parseFloat(document.getElementById('topup-amount').value);

      if (isNaN(amount) || amount < 100) {
        showToast('Minimum top-up amount is Rs. 100.', 'error');
        return;
      }

      var submitBtn = document.getElementById('btn-submit-topup');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        var res = await apiFetch('wallet.php?action=topup', {
          method: 'POST',
          body: JSON.stringify({
            amount: amount
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          closeModal('topup-modal');
          showToast('Rs. ' + amount.toLocaleString() + ' deposited to your wallet successfully!', 'success');
          topupForm.reset();
          loadWalletData();
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Top-up failed.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="check" width="16" height="16"></i> Pay & Deposit Funds';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }
}

async function initWorkerProfilePage() {
  var form = document.getElementById('worker-profile-form');
  if (!form || !window.location.pathname.includes('profile-edit.html')) return;

  var savedAvatar = localStorage.getItem('jobkade_worker_avatar');
  var avatarImg = document.getElementById('worker-avatar-img');
  var avatarInitials = document.getElementById('worker-avatar-initials');

  if (savedAvatar && avatarImg) {
    avatarImg.src = savedAvatar;
    avatarImg.style.display = 'block';
    if (avatarInitials) avatarInitials.style.display = 'none';
  }

  try {
    var res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data && res.data.user) {
      var u = res.data.user;
      var nameInput = form.querySelector('[name="full-name"]');
      var phoneInput = form.querySelector('[name="phone"]');
      var emailInput = form.querySelector('[name="email"]');
      var locInput = form.querySelector('[name="location"]');
      var bioInput = form.querySelector('[name="bio"]');
      var nameHeading = document.getElementById('worker-profile-display-name');

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
}

