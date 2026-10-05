/* ==========================================
   JODKADE — Customer Dashboard JavaScript
   Job posting, saved workers, dashboard interactions
   ========================================== */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Authentication & Identity for Customer Area ----
  var token = typeof getAuthToken === 'function' ? getAuthToken() : (localStorage.getItem('jobkade_token') || sessionStorage.getItem('jobkade_token'));
  var user = null;
  try {
    user = (typeof getLoggedInUser === 'function' ? getLoggedInUser() : null) ||
           JSON.parse(localStorage.getItem('jodkade_logged_user') || localStorage.getItem('jobkade_user') || 'null');
  } catch (e) {
    user = null;
  }

  // Ensure authentic Customer authentication from database session
  if (window.location.pathname.includes('/customer/')) {
    if (!token || !user || (user.role || '').toLowerCase() !== 'customer') {
      window.location.href = '../auth/login.html?redirect=' + encodeURIComponent('customer/dashboard.html');
      return;
    }
  }

  // ---- Update Greeting and User Profile in UI ----
  var customerName = (user && (user.name || user.full_name)) ? (user.name || user.full_name) : 'Customer';
  var firstName = customerName.split(' ')[0] || 'Customer';
  var initials = customerName.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().substring(0, 2) || 'C';

  var greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.textContent = getGreeting() + ', ' + firstName + ' 👋';
  }

  var sidebarNameEl = document.querySelector('.sidebar.customer .sidebar-user-name');
  if (sidebarNameEl) {
    sidebarNameEl.textContent = customerName;
  }

  var sidebarAvatars = document.querySelectorAll('.sidebar.customer .avatar, .avatar-nav');
  sidebarAvatars.forEach(function (av) {
    av.textContent = initials;
  });

  // ---- Job Post Form with Image Preview & Validation ----
  var jobImageUpload = document.getElementById('job-images');
  var imagePreviewGrid = document.getElementById('image-preview-grid');

  if (jobImageUpload && imagePreviewGrid) {
    jobImageUpload.addEventListener('change', function () {
      imagePreviewGrid.innerHTML = '';
      var files = this.files;

      if (files.length > 5) {
        showToast('Maximum 5 images allowed. Only the first 5 will be uploaded.', 'info');
      }

      var maxCount = Math.min(files.length, 5);
      for (var i = 0; i < maxCount; i++) {
        var file = files[i];

        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
          showToast('Invalid format for ' + file.name + '. Only JPG and PNG allowed.', 'error');
          continue;
        }

        if (file.size > 5 * 1024 * 1024) {
          showToast('File too large: ' + file.name + ' exceeds 5MB.', 'error');
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
            imagePreviewGrid.appendChild(item);
          };
          reader.readAsDataURL(f);
        })(file);
      }
    });
  }

  // ---- Interactive Job Location Map (Leaflet.js + OpenStreetMap) ----
  var mapContainer = document.getElementById('job-location-map');
  var curLat = 6.9271;
  var curLng = 79.8612;
  var jobMap = null;
  var jobMarker = null;

  function updateJobLocation(lat, lng, reverseGeocode) {
    curLat = parseFloat(lat);
    curLng = parseFloat(lng);

    var latInput = document.getElementById('job-latitude');
    var lngInput = document.getElementById('job-longitude');
    var coordDisplay = document.getElementById('coord-display');

    if (latInput) latInput.value = curLat.toFixed(7);
    if (lngInput) lngInput.value = curLng.toFixed(7);
    if (coordDisplay) {
      coordDisplay.textContent = Math.abs(curLat).toFixed(5) + '° ' + (curLat >= 0 ? 'N' : 'S') + ', ' +
                                 Math.abs(curLng).toFixed(5) + '° ' + (curLng >= 0 ? 'E' : 'W');
    }

    if (jobMarker) {
      jobMarker.setLatLng([curLat, curLng]);
    }

    if (reverseGeocode) {
      var statusEl = document.getElementById('geo-status-indicator');
      if (statusEl) statusEl.style.display = 'inline-block';

      fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + curLat + '&lon=' + curLng)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.display_name) {
            var addrInput = document.getElementById('job-location-address');
            if (addrInput) {
              // Extract a clean readable address
              var parts = data.display_name.split(',');
              var shortAddr = parts.slice(0, 3).join(',').trim();
              addrInput.value = shortAddr || data.display_name;
            }
          }
        })
        .catch(function (err) {
          console.warn('Reverse geocoding error:', err);
        })
        .finally(function () {
          if (statusEl) statusEl.style.display = 'none';
        });
    }
  }

  if (mapContainer && typeof L !== 'undefined') {
    try {
      jobMap = L.map('job-location-map').setView([curLat, curLng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(jobMap);

      jobMarker = L.marker([curLat, curLng], { draggable: true }).addTo(jobMap);
      jobMarker.bindPopup('<b>Selected Job Location</b><br>Drag me or click map to move').openPopup();

      jobMarker.on('dragend', function (e) {
        var pos = e.target.getLatLng();
        updateJobLocation(pos.lat, pos.lng, true);
      });

      jobMap.on('click', function (e) {
        updateJobLocation(e.latlng.lat, e.latlng.lng, true);
        jobMarker.openPopup();
      });

      // Recalculate size if initialized in container
      setTimeout(function () {
        jobMap.invalidateSize();
      }, 250);
    } catch (e) {
      console.warn('Leaflet map error:', e);
    }

    // "Use My Current Location" button
    var btnUseLoc = document.getElementById('btn-use-location');
    if (btnUseLoc) {
      btnUseLoc.addEventListener('click', function () {
        if (!navigator.geolocation) {
          showToast('Geolocation is not supported by your browser.', 'error');
          return;
        }

        var statusEl = document.getElementById('geo-status-indicator');
        if (statusEl) statusEl.style.display = 'inline-block';
        btnUseLoc.disabled = true;

        navigator.geolocation.getCurrentPosition(
          function (position) {
            var uLat = position.coords.latitude;
            var uLng = position.coords.longitude;
            updateJobLocation(uLat, uLng, true);
            if (jobMap) {
              jobMap.setView([uLat, uLng], 15);
              if (jobMarker) jobMarker.openPopup();
            }
            showToast('Location updated from your GPS!', 'success');
            if (statusEl) statusEl.style.display = 'none';
            btnUseLoc.disabled = false;
          },
          function (err) {
            console.warn('Geolocation error:', err);
            showToast('Unable to detect location. Please click on the map to set location.', 'error');
            if (statusEl) statusEl.style.display = 'none';
            btnUseLoc.disabled = false;
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    // Address search / geocode on change
    var addrInput = document.getElementById('job-location-address');
    if (addrInput) {
      addrInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var query = this.value.trim();
          if (!query) return;
          fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query + ', Sri Lanka'))
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (data && data.length > 0) {
                var sLat = parseFloat(data[0].lat);
                var sLng = parseFloat(data[0].lon);
                updateJobLocation(sLat, sLng, false);
                if (jobMap) {
                  jobMap.setView([sLat, sLng], 14);
                  if (jobMarker) jobMarker.openPopup();
                }
                showToast('Map centered to ' + (data[0].display_name.split(',')[0] || query), 'info');
              }
            })
            .catch(function (err) {
              console.warn('Geocoding search error:', err);
            });
        }
      });
    }
  }

  // ---- Job Post Submit (Real Backend API & Full UI Validation) ----
  var jobPostForm = document.getElementById('job-post-form');
  if (jobPostForm) {
    jobPostForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(this);

      var titleInput = document.getElementById('job-title') || this.querySelector('[name="job-title"]');
      var catSelect = document.getElementById('job-category') || this.querySelector('select');
      var descInput = document.getElementById('job-description') || this.querySelector('textarea');
      var locInput = document.getElementById('job-location-address');
      var latInput = document.getElementById('job-latitude');
      var lngInput = document.getElementById('job-longitude');

      var title = titleInput ? titleInput.value.trim() : '';
      var desc = descInput ? descInput.value.trim() : '';
      var location = locInput ? locInput.value.trim() : '';
      var finalLat = latInput ? parseFloat(latInput.value) : curLat;
      var finalLng = lngInput ? parseFloat(lngInput.value) : curLng;

      var firstInvalid = null;

      if (!title || title.length < 3 || title.length > 150) {
        showFieldError(titleInput, 'Job title is required and must be between 3 and 150 characters.');
        if (!firstInvalid) firstInvalid = titleInput;
      }

      var catVal = catSelect ? catSelect.value : '';
      if (!catVal) {
        showFieldError(catSelect, 'Please select a service category for this job.');
        if (!firstInvalid) firstInvalid = catSelect;
      }

      if (!desc || desc.length < 10 || desc.length > 3000) {
        showFieldError(descInput, 'Please provide a detailed description (between 10 and 3,000 characters).');
        if (!firstInvalid) firstInvalid = descInput;
      }

      if (!location || location.length < 2) {
        showFieldError(locInput, 'Please provide a valid location/address for workers to reach you.');
        if (!firstInvalid) firstInvalid = locInput;
      }

      if (isNaN(finalLat) || finalLat < -90 || finalLat > 90 || isNaN(finalLng) || finalLng < -180 || finalLng > 180) {
        showToast('Please select a valid location on the map.', 'error');
        if (!firstInvalid) firstInvalid = locInput;
      }

      if (firstInvalid) {
        firstInvalid.focus();
        showToast('Please correct the highlighted fields.', 'error');
        return;
      }

      var catId = parseInt(catVal, 10);
      if (isNaN(catId) || catId <= 0) {
        var catMap = {
          'Electrical': 1, 'Plumbing': 2, 'AC Repair': 3, 'Painting': 4,
          'Carpentry': 5, 'Masonry': 6, 'Cleaning': 7, 'Appliance Repair': 8, 'Other': 9
        };
        var selectedCatText = catSelect ? catSelect.options[catSelect.selectedIndex].text : 'Electrical';
        catId = catMap[selectedCatText] || 1;
      }

      var submitBtn = this.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin" width="16" height="16"></i> Submitting...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        const res = await apiFetch('jobs.php?action=create', {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            description: desc,
            category_id: catId,
            address: location,
            latitude: finalLat,
            longitude: finalLng
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          showToast('Job request #' + (res.data.job_id || '') + ' posted successfully!', 'success');
          setTimeout(function () {
            window.location.href = 'jobs.html';
          }, 1000);
        } else {
          var msg = (res.data && res.data.message) ? res.data.message : 'Please log in as a customer to post a job.';
          showToast(msg, 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="send" width="18" height="18"></i> Post Job Request';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }

  // ---- Cancel Job ----
  var activeJobCard = null;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.cancel-job-btn');
    if (btn) {
      activeJobCard = btn.closest('.job-card');
      openModal('cancel-job-modal');
    }
  });

  var confirmCancelBtn = document.querySelector('#cancel-job-modal .btn-danger');
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', function () {
      if (activeJobCard) {
        activeJobCard.setAttribute('data-status', 'cancelled');
        var badge = activeJobCard.querySelector('.badge');
        if (badge) {
          badge.className = 'badge badge-cancelled';
          badge.textContent = 'Cancelled';
        }
        showToast('Job request marked as cancelled.', 'info');
      }
    });
  }

  // ---- Remove Saved Worker ----
  document.querySelectorAll('.remove-saved-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = this.closest('.saved-worker-card');
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(function () {
          card.remove();
          showToast('Worker removed from saved list.', 'info');
        }, 300);
      }
    });
  });

  // ---- Save Worker Button (worker cards) ----
  document.querySelectorAll('.save-worker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.toggle('saved');
      if (this.classList.contains('saved')) {
        this.innerHTML = '<i data-lucide="heart"></i>';
        this.style.color = 'var(--error)';
        showToast('Worker saved!', 'success');
      } else {
        this.innerHTML = '<i data-lucide="heart"></i>';
        this.style.color = '';
        showToast('Worker removed from saved.', 'info');
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  });

  // ---- Customer Profile Init & Live Update ----
  initCustomerProfile();

  // ---- Job Status Filter ----
  var statusFilters = document.querySelectorAll('.status-filter-btn');
  statusFilters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      statusFilters.forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');

      var filter = this.getAttribute('data-filter');
      var jobs = document.querySelectorAll('#customer-jobs-container .job-card');

      jobs.forEach(function (job) {
        if (filter === 'all' || job.getAttribute('data-status') === filter) {
          job.style.display = '';
        } else {
          job.style.display = 'none';
        }
      });
    });
  });

  // ---- Load Customer Jobs & Invoices from Backend API ----
  loadCustomerJobs();

  // ---- Customer Invoice Payment Handlers ----
  initCustomerInvoicePayment();

});

function initCustomerInvoicePayment() {
  // Open Pay Modal Click
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-pay-job-invoice');
    if (!btn) return;

    var invId = btn.getAttribute('data-invoice-id');
    var jobTitle = btn.getAttribute('data-job-title') || 'Job Request';
    var amount = parseFloat(btn.getAttribute('data-amount') || '0');
    var notes = btn.getAttribute('data-notes') || '';

    var idInput = document.getElementById('pay-inv-id');
    var titleEl = document.getElementById('pay-inv-job-title');
    var amountEl = document.getElementById('pay-inv-amount');
    var notesRow = document.getElementById('pay-inv-notes-row');
    var notesEl = document.getElementById('pay-inv-notes');

    if (idInput) idInput.value = invId;
    if (titleEl) titleEl.textContent = jobTitle;
    if (amountEl) amountEl.textContent = 'Rs. ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (notes && notesRow && notesEl) {
      notesEl.textContent = notes;
      notesRow.style.display = 'block';
    } else if (notesRow) {
      notesRow.style.display = 'none';
    }

    // Set customer name on mock card if logged in
    var user = getLoggedInUser();
    var cardNameInput = document.getElementById('mock-card-name');
    if (cardNameInput && user && (user.name || user.full_name)) {
      cardNameInput.value = (user.name || user.full_name).toUpperCase();
    }

    // Toggle card fields visibility based on method
    var cardBox = document.getElementById('mockup-card-fields');
    var onlineRadio = document.getElementById('radio-pay-online');
    var cashRadio = document.getElementById('radio-pay-cash');
    if (onlineRadio && cashRadio && cardBox) {
      onlineRadio.checked = true;
      cardBox.style.display = 'flex';
      onlineRadio.addEventListener('change', function () { if (this.checked) cardBox.style.display = 'flex'; });
      cashRadio.addEventListener('change', function () { if (this.checked) cardBox.style.display = 'none'; });
    }

    // Demo autofill click
    var autofillBtn = document.getElementById('btn-autofill-demo-card');
    if (autofillBtn) {
      autofillBtn.onclick = function (e) {
        e.preventDefault();
        var numEl = document.getElementById('mock-card-number');
        var expEl = document.getElementById('mock-card-exp');
        var cvvEl = document.getElementById('mock-card-cvv');
        if (numEl) numEl.value = '4532 8812 9043 2419';
        if (expEl) expEl.value = '12/28';
        if (cvvEl) cvvEl.value = '882';
        showToast('Demo card credentials auto-filled.', 'info');
      };
    }

    openModal('pay-invoice-modal');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // Submit Pay Form
  var form = document.getElementById('customer-pay-invoice-form');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var invId = parseInt(document.getElementById('pay-inv-id').value, 10);
      var methodRadios = form.querySelectorAll('input[name="payment_method"]');
      var method = 'online';
      methodRadios.forEach(function (r) { if (r.checked) method = r.value; });

      if (isNaN(invId) || invId <= 0) {
        showToast('Invalid invoice ID.', 'error');
        return;
      }

      var submitBtn = document.getElementById('btn-confirm-pay');
      if (submitBtn) {
        submitBtn.disabled = true;
        if (method === 'online') {
          submitBtn.innerHTML = '<i data-lucide="loader" width="16" height="16" class="spin"></i> Authorizing Mockup IPG Card...';
        } else {
          submitBtn.innerHTML = '<i data-lucide="loader" width="16" height="16" class="spin"></i> Processing Settlement...';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      try {
        // If online mockup payment, simulate slight processing delay for high quality realism
        if (method === 'online') {
          await new Promise(function(resolve) { setTimeout(resolve, 800); });
        }

        var res = await apiFetch('jobs.php?action=pay-invoice', {
          method: 'POST',
          body: JSON.stringify({
            invoice_id: invId,
            payment_method: method
          })
        });

        if (res.ok && res.data && res.data.status === 'success') {
          closeModal('pay-invoice-modal');
          var jobTitle = document.getElementById('pay-inv-job-title') ? document.getElementById('pay-inv-job-title').textContent : 'Home Service';
          var jobAmt = document.getElementById('pay-inv-amount') ? document.getElementById('pay-inv-amount').textContent.replace(/[^0-9.]/g, '') : 0;

          var msg = method === 'online'
            ? 'Mockup payment successful! Funds credited to worker wallet.'
            : 'Cash settlement confirmed! Commission settled.';
          showToast(msg, 'success');

          // Open Official Digital Receipt Modal
          showCustomerReceiptModal({
            invoice_id: invId,
            receipt_no: (res.data && res.data.receipt_number) ? res.data.receipt_number : ('REC-JOB-' + invId),
            amount: jobAmt,
            job_title: jobTitle,
            worker_name: (res.data && res.data.worker_name) ? res.data.worker_name : 'Verified Skilled Worker',
            method: method,
            date: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          });

          loadCustomerJobs();
        } else {
          showToast((res.data && res.data.message) ? res.data.message : 'Payment failed.', 'error');
        }
      } catch (err) {
        showToast('Payment error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="check-circle" width="16" height="16"></i> Confirm & Complete Job';
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  }
}

function showCustomerReceiptModal(details) {
  var recNumber = document.getElementById('receipt-number');
  var recAmount = document.getElementById('receipt-amount-display');
  var recDate = document.getElementById('receipt-date');
  var recJob = document.getElementById('receipt-job-title');
  var recWorker = document.getElementById('receipt-worker-name');
  var recCust = document.getElementById('receipt-customer-name');
  var recBadge = document.getElementById('receipt-method-badge');
  var recNote = document.getElementById('receipt-commission-note');

  var user = getLoggedInUser();
  var custName = (user && user.full_name) ? user.full_name : (user && user.name ? user.name : 'Customer');
  var amtFormatted = 'Rs. ' + parseFloat(details.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (recNumber) recNumber.textContent = details.receipt_no || ('REC-JOB-' + (details.invoice_id || '2026'));
  if (recAmount) recAmount.textContent = amtFormatted;
  if (recDate) recDate.textContent = details.date || new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (recJob) recJob.textContent = details.job_title || 'Service Job';
  if (recWorker) recWorker.textContent = details.worker_name || 'Verified Skilled Worker';
  if (recCust) recCust.textContent = custName;
  if (recBadge) {
    if (details.method === 'cash') {
      recBadge.className = 'badge badge-success';
      recBadge.textContent = 'Cash on Completion';
    } else {
      recBadge.className = 'badge badge-primary';
      recBadge.textContent = 'Online Card (Mockup IPG)';
    }
  }
  if (recNote) {
    recNote.textContent = details.method === 'cash' 
      ? 'Cash collected in hand - Platform commission deducted from worker balance' 
      : 'Net earnings credited to worker wallet - Platform commission retained';
  }

  openModal('receipt-modal');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function loadCustomerJobs() {
  var container = document.getElementById('customer-jobs-container');
  if (!container || !window.location.pathname.includes('jobs.html')) return;

  try {
    var [jobsRes, invRes] = await Promise.all([
      apiFetch('jobs.php?action=customer'),
      apiFetch('jobs.php?action=invoices').catch(function() { return { ok: false }; })
    ]);

    var invoicesByJobId = {};
    if (invRes && invRes.ok && invRes.data && invRes.data.invoices) {
      invRes.data.invoices.forEach(function(inv) {
        invoicesByJobId[inv.job_id] = inv;
      });
    }

    if (jobsRes.ok && jobsRes.data && jobsRes.data.status === 'success' && jobsRes.data.jobs && jobsRes.data.jobs.length > 0) {
      var jobsHtml = jobsRes.data.jobs.map(function(j) {
        var status = (j.status || 'open').toLowerCase();
        var statusClass = status === 'completed' ? 'badge-completed' : (status === 'in_progress' ? 'badge-progress' : (status === 'cancelled' ? 'badge-cancelled' : 'badge-open'));
        var statusLabel = status === 'in_progress' ? 'In Progress' : (status.charAt(0).toUpperCase() + status.slice(1));
        var safeTitle = (j.title || 'Job Request').replace(/"/g, '&quot;');

        var inv = invoicesByJobId[j.id];
        var invoiceBanner = '';
        var payButton = '';

        if (inv) {
          var rawAmt = (inv.amount !== undefined) ? inv.amount : inv.job_amount;
          var invAmount = parseFloat(rawAmt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          var invStatus = inv.status || inv.payment_status;
          var safeNotes = (inv.notes || '').replace(/"/g, '&quot;');
          var workerName = inv.worker_name || 'Verified Skilled Worker';

          if (invStatus === 'pending') {
            invoiceBanner = '<div style="margin-top: 14px; padding: 12px 16px; background: linear-gradient(135deg, rgba(89,150,255,0.08), rgba(89,150,255,0.14)); border: 1.5px solid rgba(89,150,255,0.35); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">' +
              '<div>' +
                '<div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; font-weight:700;"><i data-lucide="receipt" width="14" height="14" style="display:inline;vertical-align:middle;color:var(--primary);margin-right:4px;"></i> Worker Final Price Added</div>' +
                '<div style="font-size:1.15rem; font-weight:800; color:var(--primary); margin-top:2px;">Rs. ' + invAmount + ' <span style="font-size:0.75rem; font-weight:500; color:var(--text-secondary);">&bull; by ' + workerName + '</span></div>' +
                (safeNotes ? '<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">Notes: <em>' + safeNotes + '</em></div>' : '') +
              '</div>' +
              '<span class="badge badge-warning" style="font-size:0.8rem; font-weight:700; padding:5px 10px;"><i data-lucide="clock" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> Payment Due</span>' +
            '</div>';
            
            payButton = '<button class="btn btn-primary btn-sm btn-pay-job-invoice" data-invoice-id="' + inv.id + '" data-amount="' + rawAmt + '" data-job-title="' + safeTitle + '" data-notes="' + safeNotes + '" style="font-weight:700;"><i data-lucide="credit-card" width="15" height="15"></i> Pay Rs. ' + invAmount + '</button>';
          } else if (invStatus === 'paid') {
            var methodLabel = (inv.payment_method === 'cash') ? 'Paid via Cash' : 'Paid Online (Mockup IPG)';
            invoiceBanner = '<div style="margin-top: 14px; padding: 12px 16px; background: rgba(102,187,106,0.08); border: 1.5px solid rgba(102,187,106,0.3); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">' +
              '<div>' +
                '<div style="font-size:0.8rem; color:var(--success); text-transform:uppercase; letter-spacing:0.04em; font-weight:700;"><i data-lucide="check-circle" width="14" height="14" style="display:inline;vertical-align:middle;margin-right:4px;"></i> Invoice Settled</div>' +
                '<div style="font-size:1.15rem; font-weight:800; color:var(--success); margin-top:2px;">Rs. ' + invAmount + ' <span style="font-size:0.75rem; font-weight:500; color:var(--text-secondary);">&bull; ' + methodLabel + '</span></div>' +
              '</div>' +
              '<span class="badge badge-success" style="font-size:0.8rem; font-weight:700; padding:5px 10px;"><i data-lucide="check" width="12" height="12" style="display:inline;vertical-align:middle;margin-right:3px;"></i> Paid & Completed</span>' +
            '</div>';
            
            payButton = '<button class="btn btn-outline btn-sm btn-view-receipt" ' +
              'data-invoice-id="' + inv.id + '" ' +
              'data-receipt-no="' + (inv.receipt_number || ('REC-JOB-' + inv.id)) + '" ' +
              'data-amount="' + rawAmt + '" ' +
              'data-job-title="' + safeTitle + '" ' +
              'data-worker-name="' + workerName + '" ' +
              'data-date="' + (inv.paid_at || j.created_at || 'Recently') + '" ' +
              'data-method="' + (inv.payment_method || 'online') + '">' +
              '<i data-lucide="receipt" width="14" height="14"></i> View Digital Receipt</button>';
          }
        }
        
        return '<div class="job-card" data-status="' + status + '">' +
          '<div class="job-card-header"><h3 class="job-card-title">' + j.title + '</h3><span class="badge ' + statusClass + '">' + statusLabel + '</span></div>' +
          '<div class="job-card-meta"><span><i data-lucide="map-pin" width="14" height="14"></i> ' + (j.address || 'Colombo') + '</span><span><i data-lucide="clock" width="14" height="14"></i> ' + (j.created_at || 'Recently') + '</span><span><i data-lucide="tag" width="14" height="14"></i> ' + (j.category_name || 'Service') + '</span></div>' +
          '<p class="job-card-desc">' + j.description + '</p>' +
          invoiceBanner +
          '<div class="job-card-actions" style="margin-top: 14px;">' +
            payButton +
            '<a href="../messages.html?job_id=' + j.id + '" class="btn btn-outline btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Messages</a>' +
            (status === 'open' ? '<button class="btn btn-ghost btn-sm cancel-job-btn" style="color:var(--error);"><i data-lucide="x" width="14" height="14"></i> Cancel Request</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');

      container.innerHTML = jobsHtml;

      // Bind View Receipt click listeners
      document.querySelectorAll('.btn-view-receipt').forEach(function(btn) {
        btn.addEventListener('click', function() {
          showCustomerReceiptModal({
            invoice_id: this.getAttribute('data-invoice-id'),
            receipt_no: this.getAttribute('data-receipt-no'),
            amount: this.getAttribute('data-amount'),
            job_title: this.getAttribute('data-job-title'),
            worker_name: this.getAttribute('data-worker-name'),
            date: this.getAttribute('data-date'),
            method: this.getAttribute('data-method')
          });
        });
      });

      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      // Empty state
      container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">' +
        '<i data-lucide="file-text" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>' +
        '<h3 style="margin-bottom: 8px;">No Job Requests Yet</h3>' +
        '<p style="color: var(--text-secondary); margin-bottom: 20px;">You have not posted any service requests yet.</p>' +
        '<a href="post-job.html" class="btn btn-primary"><i data-lucide="plus" width="16" height="16"></i> Post a Job Request</a>' +
      '</div>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } catch (err) {
    console.warn('loadCustomerJobs error:', err);
    container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px;">' +
      '<p style="color: var(--error);">Failed to load jobs. Please check your connection or log in.</p>' +
      '<a href="../auth/login.html" class="btn btn-outline btn-sm mt-2">Log In</a>' +
    '</div>';
  }
}

async function initCustomerProfile() {
  var form = document.getElementById('customer-profile-form');
  if (!form || !window.location.pathname.includes('profile.html')) return;

  var nameInput = document.getElementById('customer-name-input');
  var phoneInput = document.getElementById('customer-phone-input');
  var emailInput = document.getElementById('customer-email-input');
  var addressInput = document.getElementById('customer-address-input');
  var nameHeading = document.getElementById('customer-profile-name-heading');
  var emailHeading = document.getElementById('customer-profile-email-heading');
  var avatarInitials = document.getElementById('customer-avatar-initials');
  var avatarImg = document.getElementById('customer-avatar-img');
  var avatarClickable = document.getElementById('customer-avatar-clickable');
  var cameraBtn = document.getElementById('btn-customer-camera-trigger');
  var avatarHint = document.getElementById('customer-avatar-hint');
  var photoUpload = document.getElementById('customer-photo-upload');

  var updateCustomerAvatarsAcrossUI = function(imgUrl, initials) {
    var allAvatars = document.querySelectorAll('.sidebar.customer .avatar, .dashboard-nav-right .avatar');
    allAvatars.forEach(function (el) {
      if (imgUrl) {
        el.innerHTML = '<img src="' + imgUrl + '" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
      } else if (initials) {
        el.textContent = initials;
      }
    });
  };

  // Restore saved photo from localStorage if present
  var savedCustomerAvatar = localStorage.getItem('jobkade_customer_avatar');
  if (savedCustomerAvatar && avatarImg) {
    avatarImg.src = savedCustomerAvatar;
    avatarImg.style.display = 'block';
    if (avatarInitials) avatarInitials.style.display = 'none';
    updateCustomerAvatarsAcrossUI(savedCustomerAvatar, null);
  }

  // Interactive Avatar Click
  var triggerCustomerPhotoUpload = function () {
    if (photoUpload) photoUpload.click();
  };
  if (avatarClickable) avatarClickable.addEventListener('click', triggerCustomerPhotoUpload);
  if (cameraBtn) cameraBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    triggerCustomerPhotoUpload();
  });
  if (avatarHint) avatarHint.addEventListener('click', triggerCustomerPhotoUpload);

  if (photoUpload) {
    photoUpload.addEventListener('change', function () {
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
        if (avatarImg) {
          avatarImg.src = dataUrl;
          avatarImg.style.display = 'block';
        }
        if (avatarInitials) {
          avatarInitials.style.display = 'none';
        }

        try {
          localStorage.setItem('jobkade_customer_avatar', dataUrl);
          var sUserStr = localStorage.getItem('jobkade_user');
          if (sUserStr) {
            var sU = JSON.parse(sUserStr);
            sU.avatar = dataUrl;
            localStorage.setItem('jobkade_user', JSON.stringify(sU));
          }
        } catch (err) {
          console.warn('Could not store customer avatar:', err);
        }

        updateCustomerAvatarsAcrossUI(dataUrl, null);
        showToast('Profile photo updated successfully!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  // Load current user profile from server
  try {
    var res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data && res.data.user) {
      var u = res.data.user;
      if (nameInput) nameInput.value = u.full_name || '';
      if (phoneInput) phoneInput.value = u.phone || '';
      if (emailInput) emailInput.value = u.email || '';
      if (addressInput) addressInput.value = u.address || '';
      if (nameHeading) nameHeading.textContent = u.full_name || 'Customer';
      if (emailHeading) emailHeading.textContent = u.email || '';
      if (avatarInitials && u.full_name) {
        var init = u.full_name.split(' ').map(function(n){ return n[0]; }).join('').slice(0,2).toUpperCase();
        avatarInitials.textContent = init;
        if (!savedCustomerAvatar) updateCustomerAvatarsAcrossUI(null, init);
      }
    }
  } catch (err) {
    console.warn('Could not load customer profile from API:', err);
  }

  // Handle Form Submit
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearFormErrors(form);

    var fullName = nameInput ? nameInput.value.trim() : '';
    var phone = phoneInput ? phoneInput.value.trim() : '';
    var address = addressInput ? addressInput.value.trim() : '';
    var curPass = document.getElementById('customer-current-password') ? document.getElementById('customer-current-password').value : '';
    var newPass = document.getElementById('customer-new-password') ? document.getElementById('customer-new-password').value : '';
    var confirmPass = document.getElementById('customer-confirm-password') ? document.getElementById('customer-confirm-password').value : '';

    var hasError = false;

    if (!fullName || fullName.length < 2) {
      showFieldError(nameInput, 'Full name must be at least 2 characters.');
      hasError = true;
    }

    var phonePattern = /^[0-9+\s-]{9,15}$/;
    if (!phone || !phonePattern.test(phone)) {
      showFieldError(phoneInput, 'Please enter a valid phone number (e.g. 077 123 4567).');
      hasError = true;
    }

    if (newPass) {
      if (newPass.length < 6) {
        showFieldError(document.getElementById('customer-new-password'), 'New password must be at least 6 characters.');
        hasError = true;
      }
      if (newPass !== confirmPass) {
        showFieldError(document.getElementById('customer-confirm-password'), 'New passwords do not match.');
        hasError = true;
      }
      if (!curPass) {
        showFieldError(document.getElementById('customer-current-password'), 'Please enter your current password to change it.');
        hasError = true;
      }
    }

    if (hasError) {
      showToast('Please correct the highlighted errors.', 'error');
      var firstInvalid = form.querySelector('.is-invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    var submitBtn = document.getElementById('btn-save-customer-profile') || form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader" width="18" height="18" class="spin"></i> Saving...';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
      // 1. Update Profile Info
      var profileRes = await apiFetch('auth.php?action=update-profile', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          phone: phone,
          address: address
        })
      });

      if (!profileRes.ok || !profileRes.data || profileRes.data.status !== 'success') {
        showToast((profileRes.data && profileRes.data.message) ? profileRes.data.message : 'Failed to update profile.', 'error');
        return;
      }

      // 2. Change Password if provided
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

        // Clear password inputs
        if (document.getElementById('customer-current-password')) document.getElementById('customer-current-password').value = '';
        if (document.getElementById('customer-new-password')) document.getElementById('customer-new-password').value = '';
        if (document.getElementById('customer-confirm-password')) document.getElementById('customer-confirm-password').value = '';
      }

      showToast('Profile updated successfully!', 'success');
      if (nameHeading) nameHeading.textContent = fullName;
      if (avatarInitials) avatarInitials.textContent = fullName.split(' ').map(function(n){ return n[0]; }).join('').slice(0,2).toUpperCase();

      // Update cached session user
      var loggedUser = getLoggedInUser();
      if (loggedUser) {
        loggedUser.name = fullName;
        loggedUser.phone = phone;
        localStorage.setItem('jodkade_logged_user', JSON.stringify(loggedUser));
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="save" width="18" height="18"></i> Save Changes';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  });
}
