/* ==========================================
   JODKADE — Auth Page JavaScript
   Login, Registration, Role Selection
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {
  initRoleSelection();
  initLoginForm();
  initRegisterForms();
  initUploadPreviews();
  initPasswordToggles();
});

// ==========================================
// Reusable Utilities & Helpers
// ==========================================

function getAppUrl(path = '') {
  const prefix = window.location.pathname.includes('/auth/') ? '../' : './';
  return prefix + path.replace(/^\.?\//, '');
}

async function withButtonLoading(btn, loadingHtml, asyncCallback) {
  if (!btn) return asyncCallback();
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = loadingHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  try {
    return await asyncCallback();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function validateFields(form, rules) {
  clearFormErrors(form);
  let firstInvalid = null;

  for (const rule of rules) {
    const input = form.querySelector(`[name="${rule.name}"]`);
    const value = input ? input.value.trim() : '';
    if (!rule.test(value, input)) {
      showFieldError(input, rule.message);
      if (!firstInvalid) firstInvalid = input;
    }
  }

  if (firstInvalid) {
    firstInvalid.focus();
    showToast('Please correct the highlighted fields.', 'error');
    return false;
  }
  return true;
}

function handleAuthRedirect(user, defaultPath = 'index.html') {
  const urlParams = new URLSearchParams(window.location.search);
  let redirectUrl = urlParams.get('redirect');
  const role = (user.role || 'customer').toLowerCase();

  let isSafeRedirect = false;
  if (redirectUrl) {
    redirectUrl = decodeURIComponent(redirectUrl).trim();
    if (!redirectUrl.startsWith('http') && !redirectUrl.startsWith('//') && !redirectUrl.match(/^[a-zA-Z]:/)) {
      if (role === 'admin' && redirectUrl.includes('admin/')) isSafeRedirect = true;
      if (role === 'worker' && redirectUrl.includes('worker/')) isSafeRedirect = true;
      if (role === 'customer' && !redirectUrl.includes('admin/') && !redirectUrl.includes('worker/')) isSafeRedirect = true;
      if (redirectUrl.includes('messages.html') || redirectUrl.includes('index.html')) isSafeRedirect = true;
    }
  }

  window.location.href = getAppUrl(isSafeRedirect && redirectUrl ? redirectUrl : defaultPath);
}

function scrollAuthPanelToTop() {
  const leftPanel = document.querySelector('.auth-left-panel');
  if (leftPanel) leftPanel.scrollTop = 0;
}

// ==========================================
// 1. Role Selection (Register page)
// ==========================================

function initRoleSelection() {
  const roleCards = document.querySelectorAll('.role-card, .role-select-box');
  const customerForm = document.getElementById('customer-form');
  const workerForm = document.getElementById('worker-form');
  const roleStep = document.getElementById('role-step');
  const formStep = document.getElementById('form-step');

  roleCards.forEach(function (card) {
    card.addEventListener('click', function () {
      const role = this.getAttribute('data-role');

      roleCards.forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');

      setTimeout(function () {
        if (roleStep) roleStep.classList.add('hidden');
        if (formStep) formStep.classList.remove('hidden');

        if (role === 'customer') {
          if (customerForm) customerForm.classList.remove('hidden');
          if (workerForm) workerForm.classList.add('hidden');
        } else if (role === 'worker') {
          if (workerForm) workerForm.classList.remove('hidden');
          if (customerForm) customerForm.classList.add('hidden');
        }

        scrollAuthPanelToTop();
      }, 300);
    });
  });

  const backBtns = document.querySelectorAll('.back-to-roles');
  backBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (formStep) formStep.classList.add('hidden');
      if (roleStep) roleStep.classList.remove('hidden');
      roleCards.forEach(c => c.classList.remove('selected'));
      scrollAuthPanelToTop();
    });
  });
}

// ==========================================
// 2. Login Form
// ==========================================

function initLoginForm() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const emailInput = this.querySelector('[name="email"]');
    const passwordInput = this.querySelector('[name="password"]');
    const email = (emailInput ? emailInput.value : '').trim();
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');

    await withButtonLoading(submitBtn, 'Signing in...', async function () {
      try {
        const res = await apiFetch('auth.php?action=login', {
          method: 'POST',
          body: JSON.stringify({ email: email, password: password })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          const user = res.data.user;
          const token = res.data.token;
          setLoggedInSession(token, user);
          showToast('Welcome back, ' + (user.name || user.full_name) + '!', 'success');

          setTimeout(function () {
            handleAuthRedirect(user, 'index.html');
          }, 600);
        } else {
          const errMsg = (res.data && res.data.message) ? res.data.message : 'Invalid login credentials.';
          showToast(errMsg, 'error');
        }
      } catch (err) {
        showToast('Connection failed: ' + err.message, 'error');
      }
    });
  });
}

// ==========================================
// 3. Registration Forms (Worker & Customer)
// ==========================================

function initRegisterForms() {
  const registerForms = document.querySelectorAll('.register-form');
  registerForms.forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const isWorker = form.id === 'worker-form';
      const emailInput = form.querySelector('[name="email"]');

      // Common validations
      const baseRules = [
        { name: 'full_name', test: v => v && v.length >= 2, message: 'Full name is required (at least 2 characters).' },
        { name: 'phone', test: v => v && /^(\+94|0)?[0-9]{9,10}$/.test(v.replace(/[\s\-]/g, '')), message: 'Please enter a valid phone number (e.g. 0771234567).' },
        { name: 'email', test: v => v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Please enter a valid email address.' },
        { name: 'password', test: v => v && v.length >= 6, message: 'Password must be at least 6 characters long.' }
      ];

      if (isWorker) {
        baseRules.push(
          { name: 'service', test: v => Boolean(v), message: 'Please select your primary service.' },
          { name: 'district', test: v => Boolean(v), message: 'Please select your service location district.' },
          { name: 'nic', test: v => Boolean(v), message: 'NIC number is required for worker verification.' }
        );
      }

      if (!validateFields(form, baseRules)) {
        return;
      }

      const fullName = (form.querySelector('[name="full_name"]')?.value || '').trim();
      const email = (emailInput?.value || '').trim();
      const password = form.querySelector('[name="password"]')?.value || '';
      const phone = (form.querySelector('[name="phone"]')?.value || '').trim();
      const districtVal = form.querySelector('[name="district"]')?.value || '';
      const location = districtVal || (form.querySelector('[name="location"]')?.value || '').trim() || 'Colombo';

      if (isWorker) {
        await handleWorkerRegistration(form, { fullName, email, password, phone, location, district: districtVal || location, emailInput });
      } else {
        await handleCustomerRegistration(form, { fullName, email, password, phone, location, emailInput });
      }
    });
  });
}

async function handleWorkerRegistration(form, data) {
  const serviceInput = form.querySelector('[name="service"]');
  const nicInput = form.querySelector('[name="nic"]');
  const districtInput = form.querySelector('[name="district"]');
  const serviceVal = serviceInput ? serviceInput.value : '';
  const nic = nicInput ? nicInput.value.trim() : '';
  const district = (districtInput?.value || data.district || data.location || 'Colombo').trim();

  const formData = new FormData();
  formData.append('full_name', data.fullName);
  formData.append('name', data.fullName);
  formData.append('email', data.email);
  formData.append('password', data.password);
  formData.append('phone', data.phone);
  formData.append('role', 'worker');
  formData.append('district', district);
  formData.append('address', district);
  formData.append('location', district);
  formData.append('service', serviceVal);
  formData.append('category_id', parseInt(serviceVal, 10) || 1);
  formData.append('nic', nic);

  const payModal = document.getElementById('worker-payment-modal');
  const btnPayNow = document.getElementById('btn-pay-now-worker');
  const btnCancelPay = document.getElementById('btn-cancel-pay-worker');
  const btnClosePay = document.getElementById('btn-close-pay-modal');

  // Open Mandatory One-Time Registration Mock Payment Modal if present
  if (payModal && btnPayNow) {
    payModal.style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const closePayModal = () => { payModal.style.display = 'none'; };
    if (btnCancelPay) btnCancelPay.onclick = closePayModal;
    if (btnClosePay) btnClosePay.onclick = closePayModal;

    btnPayNow.onclick = async function () {
      await withButtonLoading(
        btnPayNow,
        '<i data-lucide="loader" class="spin" width="16" height="16"></i> Processing Payment & Registering...',
        async function () {
          try {
            const response = await fetch(getAppUrl('api/auth.php?action=register'), {
              method: 'POST',
              body: formData
            });

            const resData = await response.json();
            if (response.ok && resData.status === 'success') {
              const user = resData.user;
              const token = resData.token;
              setLoggedInSession(token, user);

              // Instantly activate one-time job access via mock IPG payment
              try {
                await fetch(getAppUrl('api/wallet.php?action=pay-access'), {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify({ payment_method: 'Online IPG (Card/Visa/Master)' })
                });
              } catch (payErr) {
                console.warn('Could not auto-trigger pay-access:', payErr);
              }

              showToast('Registration & One-Time Payment Successful! You can upload your KYC documents in your Identity & KYC section.', 'success');
              payModal.style.display = 'none';

              setTimeout(function () {
                window.location.href = getAppUrl('index.html');
              }, 1000);
            } else {
              const msg = (resData && resData.message) ? resData.message : 'Registration failed. Please check your details.';
              showToast(msg, 'error');
              payModal.style.display = 'none';
              if (msg.toLowerCase().includes('email') && data.emailInput) {
                showFieldError(data.emailInput, msg);
                data.emailInput.focus();
              }
            }
          } catch (err) {
            showToast('Error during registration: ' + err.message, 'error');
            payModal.style.display = 'none';
          }
        }
      );
      btnPayNow.innerHTML = '<i data-lucide="check-circle" width="18" height="18"></i> Pay Now & Complete Registration';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    };
    return;
  }

  // Fallback direct submission if modal is not present
  const submitBtn = form.querySelector('button[type="submit"]');
  const origText = submitBtn ? submitBtn.innerHTML : 'Create Account';

  await withButtonLoading(submitBtn, origText, async function () {
    try {
      const response = await fetch(getAppUrl('api/auth.php?action=register'), {
        method: 'POST',
        body: formData
      });

      const resData = await response.json();
      if (response.ok && resData.status === 'success') {
        setLoggedInSession(resData.token, resData.user);
        showToast('Worker account registered! Documents submitted for verification.', 'success');
        setTimeout(function () {
          window.location.href = getAppUrl('index.html');
        }, 1000);
      } else {
        const msg = (resData && resData.message) ? resData.message : 'Registration failed. Please check your details.';
        showToast(msg, 'error');
        if (msg.toLowerCase().includes('email') && data.emailInput) {
          showFieldError(data.emailInput, msg);
          data.emailInput.focus();
        }
      }
    } catch (err) {
      showToast('Error during registration: ' + err.message, 'error');
    }
  });
}

async function handleCustomerRegistration(form, data) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const payload = {
    name: data.fullName,
    full_name: data.fullName,
    email: data.email,
    password: data.password,
    phone: data.phone,
    role: 'customer',
    address: data.location
  };

  await withButtonLoading(
    submitBtn,
    '<i data-lucide="loader" class="spin" width="16" height="16"></i> Registering...',
    async function () {
      try {
        const res = await apiFetch('auth.php?action=register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.status === 'success') {
          setLoggedInSession(res.data.token, res.data.user);
          showToast('Account registered successfully! Welcome to JodKade.', 'success');
          setTimeout(function () {
            window.location.href = getAppUrl('index.html');
          }, 1000);
        } else {
          const msg = (res.data && res.data.message) ? res.data.message : 'Registration failed. Please check your details.';
          showToast(msg, 'error');
          if (msg.toLowerCase().includes('email') && data.emailInput) {
            showFieldError(data.emailInput, msg);
            data.emailInput.focus();
          }
        }
      } catch (err) {
        showToast('Error during registration: ' + err.message, 'error');
      }
    }
  );
}

// ==========================================
// 4. File Upload Previews (NIC, Police, Qual, Photo)
// ==========================================

function initUploadPreviews() {
  function setupUploadPreview(inputId, dropzoneId, labelTextId, defaultText) {
    const input = document.getElementById(inputId);
    const dropzone = document.getElementById(dropzoneId);
    const labelText = document.getElementById(labelTextId);

    if (input && dropzone) {
      input.addEventListener('change', function () {
        if (this.files && this.files[0]) {
          const file = this.files[0];
          dropzone.classList.add('has-file');
          if (labelText) {
            labelText.innerHTML = '<span class="selected-file-name">✓ Selected: ' + file.name + ' (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB)</span>';
          }
          showToast('File selected: ' + file.name, 'info');
        } else {
          dropzone.classList.remove('has-file');
          if (labelText) labelText.textContent = defaultText;
        }
      });
    }
  }

  setupUploadPreview('nic-upload', 'nic-dropzone', 'nic-label-text', 'Click to upload NIC Document *');
  setupUploadPreview('police-upload', 'police-dropzone', 'police-label-text', 'Click to upload Police Report *');
  setupUploadPreview('qual-upload', 'qual-dropzone', 'qual-label-text', 'Upload Trade Certificate (Optional)');

  const photoUpload = document.getElementById('photo-upload');
  if (photoUpload) {
    photoUpload.addEventListener('change', function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          const preview = document.getElementById('photo-preview');
          if (preview) {
            preview.src = e.target.result;
            preview.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// ==========================================
// 5. Password Visibility Toggle
// ==========================================

function initPasswordToggles() {
  const togglePwBtns = document.querySelectorAll('.toggle-password');
  togglePwBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const wrap = this.closest('.auth-input-wrap, .input-password-wrap') || this.parentElement;
      const input = wrap ? wrap.querySelector('input') : this.previousElementSibling;
      if (input && input.type === 'password') {
        input.type = 'text';
        this.innerHTML = '<i data-lucide="eye" width="18" height="18"></i>';
      } else if (input) {
        input.type = 'password';
        this.innerHTML = '<i data-lucide="eye-off" width="18" height="18"></i>';
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  });
}
