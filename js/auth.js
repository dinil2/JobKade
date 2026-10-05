/* ==========================================
   JODKADE — Auth Page JavaScript
   Login, Registration, Role Selection
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Role Selection (Register page) ----
  const roleCards = document.querySelectorAll('.role-card, .role-select-box');
  const customerForm = document.getElementById('customer-form');
  const workerForm = document.getElementById('worker-form');
  const roleStep = document.getElementById('role-step');
  const formStep = document.getElementById('form-step');

  roleCards.forEach(function (card) {
    card.addEventListener('click', function () {
      var role = this.getAttribute('data-role');

      // Highlight selected card
      roleCards.forEach(function (c) { c.classList.remove('selected'); });
      this.classList.add('selected');

      // Show appropriate form after a short delay
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

        // Scroll form panel cleanly to top so Full Name and Phone are immediately visible
        var leftPanel = document.querySelector('.auth-left-panel');
        if (leftPanel) {
          leftPanel.scrollTop = 0;
        }
      }, 300);
    });
  });

  // ---- Back to Role Selection ----
  const backBtns = document.querySelectorAll('.back-to-roles');
  backBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (formStep) formStep.classList.add('hidden');
      if (roleStep) roleStep.classList.remove('hidden');
      roleCards.forEach(function (c) { c.classList.remove('selected'); });

      var leftPanel = document.querySelector('.auth-left-panel');
      if (leftPanel) {
        leftPanel.scrollTop = 0;
      }
    });
  });

  // ---- Login Form Submit (Real Backend API) ----
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var emailInput = this.querySelector('[name="email"]');
      var passwordInput = this.querySelector('[name="password"]');
      var email = (emailInput ? emailInput.value : '').trim();
      var password = passwordInput ? passwordInput.value : '';

      if (!email || !password) {
        showToast('Please fill in all fields.', 'error');
        return;
      }

      var submitBtn = this.querySelector('button[type="submit"]');
      var originalText = submitBtn ? submitBtn.innerHTML : 'Login';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Signing in...';
      }

      try {
        const res = await apiFetch('auth.php?action=login', {
          method: 'POST',
          body: JSON.stringify({ email: email, password: password })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          var user = res.data.user;
          var token = res.data.token;
          setLoggedInSession(token, user);
          showToast('Welcome back, ' + (user.name || user.full_name) + '!', 'success');

          var prefix = window.location.pathname.includes('/auth/') ? '../' : './';
          setTimeout(function () {
            var urlParams = new URLSearchParams(window.location.search);
            var redirectUrl = urlParams.get('redirect');
            var role = (user.role || 'customer').toLowerCase();

            // Only allow redirect if it matches the authenticated user's role and is NOT a dashboard
            var isSafeRedirect = false;
            if (redirectUrl) {
              redirectUrl = decodeURIComponent(redirectUrl).trim();
              if (!redirectUrl.startsWith('http') && !redirectUrl.startsWith('//') && !redirectUrl.match(/^[a-zA-Z]:/)) {
                if (!redirectUrl.includes('dashboard.html')) {
                  if (role === 'admin' && redirectUrl.includes('admin/')) isSafeRedirect = true;
                  if (role === 'worker' && redirectUrl.includes('worker/')) isSafeRedirect = true;
                  if (role === 'customer' && !redirectUrl.includes('admin/') && !redirectUrl.includes('worker/')) isSafeRedirect = true;
                  if (redirectUrl.includes('messages.html') || redirectUrl.includes('index.html')) isSafeRedirect = true;
                }
              }
            }

            if (isSafeRedirect && redirectUrl) {
              var target = redirectUrl.replace(/^\.?\//, '');
              window.location.href = prefix + target;
              return;
            }

            // Redirect to index.html instead of dashboard
            window.location.href = prefix + 'index.html';
          }, 600);
        } else {
          var errMsg = (res.data && res.data.message) ? res.data.message : 'Invalid login credentials.';
          showToast(errMsg, 'error');
        }
      } catch (err) {
        showToast('Connection failed: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  // ---- Registration Form Submit (Real Backend API) ----
  const registerForms = document.querySelectorAll('.register-form');
  registerForms.forEach(function (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(form);

      var isWorker = form.id === 'worker-form';
      var role = isWorker ? 'worker' : 'customer';

      var nameInput = form.querySelector('[name="full_name"]');
      var emailInput = form.querySelector('[name="email"]');
      var passwordInput = form.querySelector('[name="password"]');
      var phoneInput = form.querySelector('[name="phone"]');
      var locInput = form.querySelector('[name="location"]');

      var fullName = nameInput ? nameInput.value.trim() : '';
      var email = emailInput ? emailInput.value.trim() : '';
      var password = passwordInput ? passwordInput.value : '';
      var phone = phoneInput ? phoneInput.value.trim() : '';
      var location = locInput ? locInput.value.trim() : 'Colombo';

      var firstInvalid = null;

      if (!fullName || fullName.length < 2) {
        showFieldError(nameInput, 'Full name is required (at least 2 characters).');
        if (!firstInvalid) firstInvalid = nameInput;
      }

      var phoneDigits = phone.replace(/[\s\-]/g, '');
      if (!phone || !/^(\+94|0)?[0-9]{9,10}$/.test(phoneDigits)) {
        showFieldError(phoneInput, 'Please enter a valid phone number (e.g. 0771234567).');
        if (!firstInvalid) firstInvalid = phoneInput;
      }

      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showFieldError(emailInput, 'Please enter a valid email address.');
        if (!firstInvalid) firstInvalid = emailInput;
      }

      if (!password || password.length < 6) {
        showFieldError(passwordInput, 'Password must be at least 6 characters long.');
        if (!firstInvalid) firstInvalid = passwordInput;
      }

      var payload = {
        name: fullName,
        full_name: fullName,
        email: email,
        password: password,
        phone: phone,
        role: role,
        address: location
      };

      var submitBtn = form.querySelector('button[type="submit"]');
      var origText = submitBtn ? submitBtn.innerHTML : 'Create Account';

      if (isWorker) {
        var serviceInput = form.querySelector('[name="service"]');
        var nicInput = form.querySelector('[name="nic"]');

        var serviceVal = serviceInput ? serviceInput.value : '';
        var nic = nicInput ? nicInput.value.trim() : '';

        if (!serviceVal) {
          showFieldError(serviceInput, 'Please select your primary service.');
          if (!firstInvalid) firstInvalid = serviceInput;
        }

        if (!nic) {
          showFieldError(nicInput, 'NIC number is required for worker verification.');
          if (!firstInvalid) firstInvalid = nicInput;
        }

        if (firstInvalid) {
          firstInvalid.focus();
          showToast('Please correct the highlighted fields.', 'error');
          return;
        }

        var formData = new FormData();
        formData.append('full_name', fullName);
        formData.append('name', fullName);
        formData.append('email', email);
        formData.append('password', password);
        formData.append('phone', phone);
        formData.append('role', 'worker');
        formData.append('address', location);
        formData.append('location', location);
        formData.append('service', serviceVal);
        formData.append('category_id', parseInt(serviceVal, 10) || 1);
        formData.append('nic', nic);

        // Open Mandatory One-Time Registration Mock Payment Modal
        var payModal = document.getElementById('worker-payment-modal');
        var btnPayNow = document.getElementById('btn-pay-now-worker');
        var btnCancelPay = document.getElementById('btn-cancel-pay-worker');
        var btnClosePay = document.getElementById('btn-close-pay-modal');

        if (payModal && btnPayNow) {
          payModal.style.display = 'flex';
          if (typeof lucide !== 'undefined') lucide.createIcons();

          var closePayModal = function() {
            payModal.style.display = 'none';
          };

          if (btnCancelPay) btnCancelPay.onclick = closePayModal;
          if (btnClosePay) btnClosePay.onclick = closePayModal;

          btnPayNow.onclick = async function() {
            btnPayNow.disabled = true;
            btnPayNow.innerHTML = '<i data-lucide="loader" class="spin" width="16" height="16"></i> Processing Payment & Registering...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
              var prefixApi = window.location.pathname.includes('/auth/') ? '../' : './';
              const response = await fetch(prefixApi + 'api/auth.php?action=register', {
                method: 'POST',
                body: formData
              });

              const data = await response.json();
              if (response.ok && data.status === 'success') {
                var user = data.user;
                var token = data.token;
                setLoggedInSession(token, user);

                // Instantly activate one-time job access via mock IPG payment
                try {
                  await fetch(prefixApi + 'api/wallet.php?action=pay-access', {
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

                var prefix = window.location.pathname.includes('/auth/') ? '../' : './';
                setTimeout(function () {
                  window.location.href = prefix + 'index.html';
                }, 1000);
              } else {
                var msg = (data && data.message) ? data.message : 'Registration failed. Please check your details.';
                showToast(msg, 'error');
                payModal.style.display = 'none';
                if (msg.toLowerCase().includes('email')) {
                  showFieldError(emailInput, msg);
                  emailInput.focus();
                }
              }
            } catch (err) {
              showToast('Error during registration: ' + err.message, 'error');
              payModal.style.display = 'none';
            } finally {
              btnPayNow.disabled = false;
              btnPayNow.innerHTML = '<i data-lucide="check-circle" width="18" height="18"></i> Pay Now & Complete Registration';
              if (typeof lucide !== 'undefined') lucide.createIcons();
            }
          };
          return;
        }

        try {
          var prefixApi = window.location.pathname.includes('/auth/') ? '../' : './';
          const response = await fetch(prefixApi + 'api/auth.php?action=register', {
            method: 'POST',
            body: formData
          });

          const data = await response.json();
          if (response.ok && data.status === 'success') {
            var user = data.user;
            var token = data.token;
            setLoggedInSession(token, user);
            showToast('Worker account registered! Documents submitted for verification.', 'success');

            var prefix = window.location.pathname.includes('/auth/') ? '../' : './';
            setTimeout(function () {
              window.location.href = prefix + 'index.html';
            }, 1000);
          } else {
            var msg = (data && data.message) ? data.message : 'Registration failed. Please check your details.';
            showToast(msg, 'error');
            if (msg.toLowerCase().includes('email')) {
              showFieldError(emailInput, msg);
              emailInput.focus();
            }
          }
        } catch (err) {
          showToast('Error during registration: ' + err.message, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        }
        return;
      }

      // Customer Registration
      if (firstInvalid) {
        firstInvalid.focus();
        showToast('Please correct the highlighted fields.', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin" width="16" height="16"></i> Registering...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        const res = await apiFetch('auth.php?action=register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.status === 'success') {
          var user = res.data.user;
          var token = res.data.token;
          setLoggedInSession(token, user);
          showToast('Account registered successfully! Welcome to JodKade.', 'success');

          var prefix = window.location.pathname.includes('/auth/') ? '../' : './';
          setTimeout(function () {
            window.location.href = prefix + 'index.html';
          }, 1000);
        } else {
          var msg = (res.data && res.data.message) ? res.data.message : 'Registration failed. Please check your details.';
          showToast(msg, 'error');
          if (msg.toLowerCase().includes('email')) {
            showFieldError(emailInput, msg);
            emailInput.focus();
          }
        }
      } catch (err) {
        showToast('Error during registration: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origText;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  });

  // ---- Dropzone File Upload Previews (NIC, Police Report, Qualification) ----
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

  // ---- Profile Photo Preview ----
  const photoUpload = document.getElementById('photo-upload');
  if (photoUpload) {
    photoUpload.addEventListener('change', function () {
      var file = this.files[0];
      if (file) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var preview = document.getElementById('photo-preview');
          if (preview) {
            preview.src = e.target.result;
            preview.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // ---- Password Visibility Toggle ----
  const togglePwBtns = document.querySelectorAll('.toggle-password');
  togglePwBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = this.closest('.auth-input-wrap, .input-password-wrap') || this.parentElement;
      var input = wrap ? wrap.querySelector('input') : this.previousElementSibling;
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

});
