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
  initWorkerJobTabs();
  loadMyServicesForWorker();
  initWorkerSettings();
  initWorkerWalletPage();
  initWorkerJobMapModal();
  initWorkerInvoiceAndAccess();
  initWorkerReviews();
});

// reusable utilities

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
}

// service management & deletion

// Sri Lankan District Coordinates Lookup for Map Centering
const SRI_LANKA_DISTRICTS = {
  'Colombo': [6.9271, 79.8612],
  'Gampaha': [7.0840, 80.0098],
  'Kalutara': [6.5854, 79.9607],
  'Kandy': [7.2906, 80.6337],
  'Matale': [7.4675, 80.6234],
  'Nuwara Eliya': [6.9497, 80.7891],
  'Galle': [6.0535, 80.2210],
  'Matara': [5.9549, 80.5550],
  'Hambantota': [6.1429, 81.1212],
  'Jaffna': [9.6615, 80.0255],
  'Kilinochchi': [9.3803, 80.3770],
  'Mannar': [8.9810, 79.9044],
  'Vavuniya': [8.7542, 80.4982],
  'Mullaitivu': [9.2671, 80.8142],
  'Batticaloa': [7.7310, 81.6747],
  'Ampara': [7.2912, 81.6724],
  'Trincomalee': [8.5874, 81.2152],
  'Kurunegala': [7.4863, 80.3623],
  'Puttalam': [8.0408, 79.8394],
  'Anuradhapura': [8.3114, 80.4037],
  'Polonnaruwa': [7.9403, 81.0188],
  'Badulla': [6.9934, 81.0550],
  'Moneragala': [6.8728, 81.3507],
  'Ratnapura': [6.6828, 80.3992],
  'Kegalle': [7.2513, 80.3464]
};

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

  // Initialize Map Pin Picker for Add Service
  const mapContainer = $id('service-location-map');
  let serviceMap = null;
  let serviceMarker = null;
  let curLat = 6.9271;
  let curLng = 79.8612;

  function updateServiceCoords(lat, lng) {
    curLat = parseFloat(lat);
    curLng = parseFloat(lng);
    const latInput = $id('service-latitude');
    const lngInput = $id('service-longitude');
    const coordDisplay = $id('service-coord-display');

    if (latInput) latInput.value = curLat.toFixed(7);
    if (lngInput) lngInput.value = curLng.toFixed(7);
    if (coordDisplay) {
      coordDisplay.textContent = `Coordinates: ${Math.abs(curLat).toFixed(4)}° ${curLat >= 0 ? 'N' : 'S'}, ${Math.abs(curLng).toFixed(4)}° ${curLng >= 0 ? 'E' : 'W'}`;
    }
    if (serviceMarker) serviceMarker.setLatLng([curLat, curLng]);
  }

  if (mapContainer && typeof L !== 'undefined') {
    try {
      serviceMap = L.map('service-location-map').setView([curLat, curLng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(serviceMap);

      serviceMarker = L.marker([curLat, curLng], { draggable: true }).addTo(serviceMap);
      serviceMarker.bindPopup('<b>Service Location Pin</b><br>Drag pin or click map').openPopup();

      serviceMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        updateServiceCoords(pos.lat, pos.lng);
      });

      serviceMap.on('click', (e) => {
        updateServiceCoords(e.latlng.lat, e.latlng.lng);
        serviceMarker.openPopup();
      });

      setTimeout(() => serviceMap?.invalidateSize(), 300);
    } catch (err) {
      console.warn('Service Leaflet map init error:', err);
    }

    // Geolocation crosshair button
    const btnCurLoc = $id('btn-service-current-loc');
    btnCurLoc?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.', 'error');
        return;
      }
      btnCurLoc.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          updateServiceCoords(latitude, longitude);
          serviceMap?.setView([latitude, longitude], 15);
          serviceMarker?.openPopup();
          showToast('Location updated to your GPS coordinates!', 'success');
          btnCurLoc.disabled = false;
        },
        (err) => {
          console.warn('Geolocation error:', err);
          showToast('Could not access GPS. Please click on the map to set location.', 'warning');
          btnCurLoc.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    // District select change centers the map
    const districtSelect = $id('service-district-input');
    districtSelect?.addEventListener('change', () => {
      const dist = districtSelect.value;
      if (dist && SRI_LANKA_DISTRICTS[dist]) {
        const [dLat, dLng] = SRI_LANKA_DISTRICTS[dist];
        updateServiceCoords(dLat, dLng);
        serviceMap?.setView([dLat, dLng], 12);
        serviceMarker?.openPopup();
      }
    });
  }

  const serviceForm = $id('service-form');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearFormErrors(this);

      const titleInput = $id('service-title-input') || this.querySelector('[name="service-title"], input[type="text"]');
      const catSelect = $id('service-category-input') || this.querySelector('select');
      const descInput = $id('service-desc-input') || this.querySelector('textarea');
      const priceInput = $id('service-price-input') || this.querySelector('input[type="number"]');
      const districtSelect = $id('service-district-input');
      const latInput = $id('service-latitude');
      const lngInput = $id('service-longitude');

      const title = titleInput?.value.trim() || '';
      const price = parseFloat(priceInput?.value || 0);
      const district = districtSelect?.value || '';

      let isValid = true;
      if (!title || title.length < 3) {
        showFieldError(titleInput, 'Service title is required (at least 3 characters).');
        isValid = false;
      }
      if (isNaN(price) || price < 0) {
        showFieldError(priceInput, 'Please specify a valid starting price (minimum 0).');
        isValid = false;
      }
      if (catSelect && !catSelect.value) {
        showFieldError(catSelect, 'Please select a service category.');
        isValid = false;
      }
      if (districtSelect && !district) {
        showFieldError(districtSelect, 'Please select a service location district.');
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
              pricing_type: 'starting_at',
              district: district || 'Colombo',
              location: district || 'Colombo',
              latitude: latInput?.value ? parseFloat(latInput.value) : curLat,
              longitude: lngInput?.value ? parseFloat(lngInput.value) : curLng
            })
          });

          if (res.ok && res.data?.status === 'success') {
            showToast('Service saved successfully!', 'success');
            setTimeout(() => { window.location.href = 'my-services.html'; }, 1000);
          } else {
            showToast(res.data?.message || 'Could not save service. Please try again.', 'error');
          }
        } catch (err) {
          console.error('Failed to save service:', err);
          showToast('Could not save service. Please try again.', 'error');
        }
      });
    });
  }

  // Optional image preview if element present
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

// worker profile & avatar

function initProfilePhotoUpload() {
  const avatarClickable = $id('profile-avatar-clickable');
  const cameraBtn = $id('btn-camera-trigger');
  const avatarHint = $id('profile-avatar-hint');
  const changeBtnText = $id('btn-change-photo-text');
  const photoUpload = $id('worker-photo-upload');

  const triggerUpload = () => photoUpload?.click();
  avatarClickable?.addEventListener('click', triggerUpload);
  cameraBtn?.addEventListener('click', e => { e.stopPropagation(); triggerUpload(); });
  avatarHint?.addEventListener('click', triggerUpload);
  changeBtnText?.addEventListener('click', triggerUpload);

  photoUpload?.addEventListener('change', async () => {
    const file = photoUpload.files[0];
    if (!file) return;

    // Validate image format: only JPG and PNG
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isAllowedExt = ['jpg', 'jpeg', 'png'].includes(ext);
    const isAllowedMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
    if (!isAllowedExt && !isAllowedMime) {
      showToast('Please select a JPG or PNG image.', 'error');
      photoUpload.value = '';
      return;
    }

    // Validate size: max 2MB
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image file size must be less than 2MB.', 'error');
      photoUpload.value = '';
      return;
    }

    const avatarImg = $id('worker-avatar-img');
    const avatarInitials = $id('worker-avatar-initials');

    // 1. Show immediate local preview
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (avatarImg) { avatarImg.src = dataUrl; avatarImg.style.display = 'block'; }
      if (avatarInitials) avatarInitials.style.display = 'none';
    };
    reader.readAsDataURL(file);

    // 2. Upload to backend endpoint
    const formData = new FormData();
    formData.append('photo', file);

    const token = (typeof getAuthToken === 'function') ? getAuthToken() : (localStorage.getItem('jobkade_token') || '');
    const isSubfolder = ['/worker/', '/customer/', '/admin/'].some(s => window.location.pathname.includes(s));
    const apiEndpoint = (isSubfolder ? '../api/' : 'api/') + 'auth.php?action=upload-photo';

    try {
      showToast('Uploading profile photo...', 'info');
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: token ? { 'Authorization': 'Bearer ' + token } : {},
        body: formData
      });
      const data = await res.json();

      if (res.ok && data && (data.status === 'success' || data.profile_picture)) {
        const photoPath = data.profile_picture || data.photo_url || data.avatar;

        // Update local session
        const sUser = (typeof getLoggedInUser === 'function' ? getLoggedInUser() : null) || {};
        sUser.profile_picture = photoPath;
        sUser.avatar = photoPath;
        localStorage.setItem('jodkade_logged_user', JSON.stringify(sUser));
        localStorage.setItem('jobkade_user', JSON.stringify(sUser));
        localStorage.setItem('jobkade_worker_avatar', photoPath);

        // Update photo everywhere immediately without a page refresh
        const rootPath = isSubfolder ? '../' : '';
        const resolvedUrl = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(photoPath, rootPath) : rootPath + photoPath;

        if (avatarImg) {
          avatarImg.src = resolvedUrl;
          avatarImg.style.display = 'block';
        }
        if (avatarInitials) avatarInitials.style.display = 'none';

        if (typeof updateSharedAvatars === 'function') {
          updateSharedAvatars(rootPath);
        } else {
          document.querySelectorAll('.sidebar.worker .avatar, #sidebarAvatar, #navAvatar, .avatar-nav, .dashboard-nav-right .avatar').forEach(el => {
            el.innerHTML = `<img src="${resolvedUrl}" alt="Profile Photo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
          });
        }

        showToast('Profile photo updated successfully!', 'success');
      } else {
        const errMsg = data.message || 'Failed to upload profile photo.';
        showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error('Photo upload failed:', err);
      showToast('Network error while uploading photo.', 'error');
    } finally {
      photoUpload.value = '';
    }
  });
}

async function initWorkerProfilePage() {
  const form = $id('worker-profile-form');
  if (!form || !window.location.pathname.includes('profile-edit.html')) return;

  const user = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
  const avatarImg = $id('worker-avatar-img');
  const avatarInitials = $id('worker-avatar-initials');
  const nameHeading = $id('worker-profile-display-name');
  const verifyBadge = $id('worker-profile-verify-badge');

  const isSubfolder = ['/worker/', '/customer/', '/admin/'].some(s => window.location.pathname.includes(s));
  const rootPath = isSubfolder ? '../' : '';

  function setInitials(fullName) {
    if (!fullName) return;
    const parts = fullName.trim().split(/\s+/);
    let inits = 'WK';
    if (parts.length >= 2) {
      inits = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      inits = parts[0].substring(0, 2).toUpperCase();
    }
    if (avatarInitials) avatarInitials.textContent = inits;
    if (avatarImg) avatarImg.alt = fullName;
  }

  // 1. Immediately fill from cached session if available
  if (user) {
    const cachedName = user.name || user.full_name || '';
    if (cachedName) {
      const nameInput = form.querySelector('[name="full-name"]');
      if (nameInput) nameInput.value = cachedName;
      if (nameHeading) nameHeading.textContent = cachedName;
      setInitials(cachedName);
    }
    if (user.phone) {
      const phoneInput = form.querySelector('[name="phone"]');
      if (phoneInput) phoneInput.value = user.phone;
    }
    if (user.email) {
      const emailInput = form.querySelector('[name="email"]');
      if (emailInput) emailInput.value = user.email;
    }
    const savedAvatar = user.profile_picture || user.avatar || localStorage.getItem('jobkade_worker_avatar');
    if (savedAvatar && avatarImg) {
      avatarImg.src = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(savedAvatar, rootPath) : rootPath + savedAvatar;
      avatarImg.style.display = 'block';
      if (avatarInitials) avatarInitials.style.display = 'none';
    }
  }

  // 2. Fetch fresh real profile from backend
  try {
    const res = await apiFetch('auth.php?action=me');
    if (res.ok && res.data?.user) {
      const u = res.data.user;
      const wp = u.worker_profile || u.worker || {};

      const nameInput = form.querySelector('[name="full-name"]');
      const phoneInput = form.querySelector('[name="phone"]');
      const emailInput = form.querySelector('[name="email"]');
      const bioInput = form.querySelector('[name="bio"]');
      const locInput = form.querySelector('[name="location"]');

      const realName = u.full_name || u.name || '';
      if (nameInput && realName) nameInput.value = realName;
      if (nameHeading && realName) nameHeading.textContent = realName;
      setInitials(realName);

      if (phoneInput && u.phone) phoneInput.value = u.phone;
      if (emailInput && u.email) emailInput.value = u.email;

      // Real Bio and Location from worker_profile in the database
      const realBio = wp.bio || u.bio || '';
      if (bioInput && realBio) bioInput.value = realBio;

      const realAddress = wp.address || u.address || '';
      if (locInput && realAddress) locInput.value = realAddress;

      const hourlyInput = form.querySelector('[name="hourly-rate"]');
      const travellingInput = form.querySelector('[name="travelling-fee"]');
      if (hourlyInput) hourlyInput.value = wp.hourly_rate != null ? wp.hourly_rate : '1000.00';
      if (travellingInput) travellingInput.value = wp.travelling_fee != null ? wp.travelling_fee : '0.00';

      // Verification Badge
      if (verifyBadge) {
        const isVerified = (wp.is_verified == 1 || wp.verify_status === 'verified');
        const isPending = (wp.verify_status === 'pending');
        if (isVerified) {
          verifyBadge.className = 'badge badge-verified';
          verifyBadge.innerHTML = '<i data-lucide="check" width="10" height="10"></i> Verified';
        } else if (isPending) {
          verifyBadge.className = 'badge badge-pending';
          verifyBadge.innerHTML = '<i data-lucide="clock" width="10" height="10"></i> Pending Verification';
        } else {
          verifyBadge.className = 'badge badge-cancelled';
          verifyBadge.textContent = 'Unverified';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      // Avatar
      const uPhoto = u.profile_picture || u.avatar || wp.profile_picture;
      if (uPhoto && avatarImg) {
        avatarImg.src = (typeof resolveAvatarUrl === 'function') ? resolveAvatarUrl(uPhoto, rootPath) : rootPath + uPhoto;
        avatarImg.style.display = 'block';
        if (avatarInitials) avatarInitials.style.display = 'none';
        if (user) {
          user.profile_picture = uPhoto;
          user.avatar = uPhoto;
          user.name = realName;
          localStorage.setItem('jodkade_logged_user', JSON.stringify(user));
          localStorage.setItem('jobkade_user', JSON.stringify(user));
          localStorage.setItem('jobkade_worker_avatar', uPhoto);
        }
      } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarInitials) avatarInitials.style.display = 'flex';
      }

      // District & Coverage Setup
      const distSelect = $id('profile-district-select');
      const coverAllCb = $id('profile-cover-all-cities');
      const grid = $id('profile-city-checkboxes-grid');
      const distLabel = $id('profile-coverage-district-label');
      const counterBadge = $id('profile-city-count-badge');
      const errorEl = $id('profile-coverage-error');
      const errorText = $id('profile-coverage-error-text');

      const currentDistrict = wp.district || u.district || 'Colombo';
      if (distSelect && currentDistrict) {
        distSelect.value = currentDistrict;
      }

      const coverageRows = wp.coverage || [];
      const hasAllCoverage = coverageRows.some(c => c.city === 'ALL');
      const initialSelectedCities = coverageRows.filter(c => c.city !== 'ALL').map(c => c.city);

      function renderProfileCities(district, selectedCities = [], isAll = false) {
        if (distLabel) distLabel.textContent = district || 'District';
        if (!grid) return;
        if (!district) {
          grid.innerHTML = '<span style="font-size:0.8rem; color:var(--text-secondary);">Select a district to view available cities</span>';
          return;
        }

        const cities = (typeof getCitiesByDistrict === 'function')
          ? getCitiesByDistrict(district)
          : (window.SRI_LANKA_LOCATIONS?.[district] || []);

        if (cities.length === 0) {
          grid.innerHTML = '<span style="font-size:0.8rem; color:var(--text-secondary);">No cities available for this district</span>';
          return;
        }

        grid.innerHTML = cities.map(city => {
          const checked = selectedCities.includes(city) && !isAll ? 'checked' : '';
          return `
            <label style="font-size:0.82rem; margin-bottom:0; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" class="profile-city-cb" value="${city}" ${checked} ${isAll ? 'disabled' : ''}>
              <span>${city}</span>
            </label>
          `;
        }).join('');

        if (coverAllCb) coverAllCb.checked = isAll;
        updateProfileCoverageState();
      }

      function updateProfileCoverageState() {
        if (!grid) return;
        const cityCheckboxes = grid.querySelectorAll('.profile-city-cb');
        const isCoverAll = coverAllCb && coverAllCb.checked;

        if (isCoverAll) {
          cityCheckboxes.forEach(cb => {
            cb.checked = false;
            cb.disabled = true;
          });
          if (counterBadge) counterBadge.textContent = 'All cities covered';
          if (errorEl) errorEl.style.display = 'none';
          return;
        }

        cityCheckboxes.forEach(cb => {
          cb.disabled = false;
        });

        const checkedBoxes = grid.querySelectorAll('.profile-city-cb:checked');
        const count = checkedBoxes.length;

        if (counterBadge) {
          counterBadge.textContent = count > 0 ? `${count} of 3 cities selected` : 'Choose up to 3 cities';
        }

        if (count <= 3 && errorEl) {
          errorEl.style.display = 'none';
        }
      }

      if (distSelect) {
        distSelect.addEventListener('change', function () {
          if (grid) {
            grid.classList.remove('is-invalid');
            grid.parentElement?.querySelector('.form-feedback-error')?.remove();
          }
          renderProfileCities(this.value, [], true);
        });
      }

      if (coverAllCb) {
        coverAllCb.addEventListener('change', function () {
          if (this.checked && grid) {
            grid.classList.remove('is-invalid');
            grid.parentElement?.querySelector('.form-feedback-error')?.remove();
          }
          updateProfileCoverageState();
        });
      }

      if (grid) {
        grid.addEventListener('change', function (e) {
          if (e.target && e.target.classList.contains('profile-city-cb')) {
            const checkedBoxes = grid.querySelectorAll('.profile-city-cb:checked');
            if (checkedBoxes.length > 3) {
              e.target.checked = false;
              if (errorEl) {
                if (errorText) errorText.textContent = 'Maximum 3 cities allowed.';
                errorEl.style.display = 'block';
              }
              if (typeof showToast === 'function') {
                showToast('Maximum 3 cities allowed.', 'error');
              }
            } else {
              updateProfileCoverageState();
            }
          }
        });
      }

      renderProfileCities(currentDistrict, initialSelectedCities, hasAllCoverage || coverageRows.length === 0);
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
    const hourlyInput = this.querySelector('[name="hourly-rate"]');
    const travellingInput = this.querySelector('[name="travelling-fee"]');
    const distSelect = $id('profile-district-select');
    const coverAllCb = $id('profile-cover-all-cities');
    const grid = $id('profile-city-checkboxes-grid');

    const fullName = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const bio = bioInput?.value.trim() || '';
    const location = locInput?.value.trim() || '';
    const districtVal = distSelect?.value || 'Colombo';
    const isCoverAll = coverAllCb ? coverAllCb.checked : false;
    const checkedCities = grid ? Array.from(grid.querySelectorAll('.profile-city-cb:checked')).map(cb => cb.value) : [];

    const curPass = curPassInput?.value || '';
    const newPass = newPassInput?.value || '';
    const confirmPass = confirmPassInput?.value || '';
    const hourlyRate = parseFloat(hourlyInput?.value ?? '1000');
    const travellingFee = parseFloat(travellingInput?.value ?? '0');

    let hasError = false;
    if (!fullName || fullName.length < 2) { showFieldError(nameInput, 'Full name must be at least 2 characters.'); hasError = true; }
    if (!phone || !/^[0-9+\s-]{9,15}$/.test(phone)) { showFieldError(phoneInput, 'Please enter a valid phone number.'); hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError(emailInput, 'Please enter a valid email address.'); hasError = true; }
    if (!bio || bio.length < 10) { showFieldError(bioInput, 'Please write a brief description (at least 10 characters).'); hasError = true; }
    if (distSelect && !distSelect.value) { showFieldError(distSelect, 'Please select a service district.'); hasError = true; }

    if (!isCoverAll && checkedCities.length === 0) {
      if (grid) showFieldError(grid, "Please select at least 1 city or check 'Cover all cities'.");
      hasError = true;
    }
    if (!isCoverAll && checkedCities.length > 3) {
      if (grid) showFieldError(grid, "Maximum 3 cities allowed.");
      hasError = true;
    }

    if (isNaN(hourlyRate) || hourlyRate < 0) { showFieldError(hourlyInput, 'Hourly rate must be a valid number >= 0.'); hasError = true; }
    if (isNaN(travellingFee) || travellingFee < 0) { showFieldError(travellingInput, 'Travelling fee must be a valid number >= 0.'); hasError = true; }

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
          body: JSON.stringify({ 
            full_name: fullName, 
            phone, 
            bio, 
            address: location || districtVal,
            district: districtVal,
            cover_all_cities: isCoverAll ? 1 : 0,
            coverage_mode: isCoverAll ? 'all' : 'custom',
            cities: isCoverAll ? [] : checkedCities,
            coverage_cities: isCoverAll ? [] : checkedCities,
            hourly_rate: hourlyRate,
            travelling_fee: travellingFee
          })
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
          showToast(res.data?.message || 'Could not update profile.', 'error');
        }
      } catch (err) {
        console.error('Failed to update worker profile:', err);
        showToast('Could not update profile. Please try again.', 'error');
      }
    });
  });
}

// subscription & wallet handlers

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

// invoices & marketplace access gating

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

          // Immediately remove the invoiced job from cachedAvailableJobs
          const numJobId = parseInt(jobId, 10);
          const completedJob = cachedAvailableJobs.find(j => parseInt(j.id || j.job_id, 10) === numJobId);
          cachedAvailableJobs = cachedAvailableJobs.filter(j => parseInt(j.id || j.job_id, 10) !== numJobId);

          // Immediately add to cachedCompletedJobs so it is present under Completed
          if (completedJob) {
            const enrichedJob = {
              ...completedJob,
              id: numJobId,
              status: 'completed',
              job_status: 'completed',
              application_status: 'accepted'
            };
            cachedCompletedJobs = [
              enrichedJob,
              ...cachedCompletedJobs.filter(j => parseInt(j.id || j.job_id, 10) !== numJobId)
            ];
          }

          // Immediately re-render so the job disappears from Available tab without delay
          renderWorkerJobs();

          // Refresh both Available Jobs and Completed tabs from server without requiring page reload
          await loadOpenJobsForWorker();
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

// jobs & map modal

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
    const timeframe = btn.getAttribute('data-timeframe') || 'Not specified';

    const titleEl = $id('modal-map-title');
    const addrEl = $id('modal-map-address');
    const msgBtn = $id('modal-map-msg-btn');

    if (titleEl) titleEl.textContent = title;
    if (addrEl) {
      addrEl.innerHTML = `
        <div style="margin-bottom: 4px;"><i data-lucide="map-pin" width="14" height="14" style="display:inline; vertical-align:middle; color:var(--primary);"></i> <span>${address} (${lat.toFixed(4)}, ${lng.toFixed(4)})</span></div>
        <div style="font-size:0.85rem; color:var(--primary); font-weight:600;"><i data-lucide="calendar" width="14" height="14" style="display:inline; vertical-align:middle;"></i> Preferred: ${timeframe}</div>
      `;
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

let currentWorkerJobTab = 'available';
let cachedAvailableJobs = [];
let cachedOngoingJobs = [];
let cachedCompletedJobs = [];

function renderWorkerJobCard(j, tabType = 'available') {
  const lat = j.latitude || 6.9271;
  const lng = j.longitude || 79.8612;
  const addr = j.address || 'Colombo';
  const custId = j.customer_id || 2;
  const jId = j.id || j.job_id || '';
  const safeTitle = (j.title || j.job_title || 'Job Request').replace(/"/g, '&quot;');
  const status = (j.status || j.job_status || '').toLowerCase();
  const timeFrameStr = (typeof formatJobTimeFrame === 'function')
    ? formatJobTimeFrame(j.preferred_date, j.start_time, j.end_time)
    : (j.preferred_date ? `${j.preferred_date}` : 'Not specified');

  let badgeHtml = '';
  let actionsHtml = '';
  let statusBannerHtml = '';

  if (tabType === 'ongoing' || status === 'in_progress') {
    badgeHtml = '<span class="badge badge-progress"><i data-lucide="loader" width="12" height="12" class="spin"></i> In Progress</span>';
    const hasArrived = Boolean(j.arrived_at);

    if (hasArrived) {
      statusBannerHtml = `
        <div style="margin-top:12px; padding:12px 16px; background:rgba(16, 185, 129, 0.08); border:1.5px solid rgba(16, 185, 129, 0.25); border-radius:var(--radius-md); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--success); font-weight:700;"><i data-lucide="timer" width="13" height="13" style="display:inline;vertical-align:middle;margin-right:4px;"></i> Work Timer Running</div>
            <div style="font-size:1.15rem; font-weight:800; color:var(--success); margin-top:2px;">⏱️ Elapsed: <span class="job-timer-display" data-job-id="${jId}" data-arrived-at="${j.arrived_at}">00:00:00</span></div>
          </div>
          <button class="btn btn-success btn-sm btn-worker-done-job" data-job-id="${jId}" data-job-title="${safeTitle}" style="font-weight:700; padding:8px 16px; cursor:pointer;">
            <i data-lucide="check-circle" width="15" height="15"></i> Done (Complete Job)
          </button>
        </div>`;
      actionsHtml = `
        <button class="btn btn-success btn-sm btn-worker-done-job" data-job-id="${jId}" data-job-title="${safeTitle}" style="font-weight:700; cursor:pointer;">
          <i data-lucide="check-circle" width="14" height="14"></i> Done (Complete Job)
        </button>
        <a href="../messages.html?user_id=${custId}&job_id=${jId}" class="btn btn-primary btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Message Customer</a>
        <button class="btn btn-outline btn-sm btn-view-job-map" data-lat="${lat}" data-lng="${lng}" data-address="${addr}" data-title="${safeTitle}" data-customer-id="${custId}" data-job-id="${jId}" data-timeframe="${timeFrameStr}"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>
        ${j.customer_phone ? `<a href="tel:${j.customer_phone}" class="btn btn-ghost btn-sm"><i data-lucide="phone" width="14" height="14"></i> Call</a>` : ''}
      `;
    } else {
      statusBannerHtml = `
        <div style="margin-top:12px; padding:10px 14px; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:var(--radius-md); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="font-size:0.85rem; color:#d97706; font-weight:600; display:flex; align-items:center; gap:8px;">
            <i data-lucide="clock" width="16" height="16"></i> Waiting for customer to confirm arrival. Work timer starts automatically upon arrival.
          </div>
          <button class="btn btn-ghost btn-sm btn-check-arrival-status" data-job-id="${jId}" style="color:#d97706; font-size:0.8rem; padding:4px 8px; cursor:pointer;">
            <i data-lucide="refresh-cw" width="13" height="13"></i> Check Status
          </button>
        </div>`;
      actionsHtml = `
        <button class="btn btn-secondary btn-sm btn-worker-awaiting-arrival" data-job-id="${jId}" data-job-title="${safeTitle}" style="cursor:pointer;" title="Tap to check if customer has confirmed your arrival">
          <i data-lucide="lock" width="14" height="14"></i> Done (Awaiting Arrival)
        </button>
        <a href="../messages.html?user_id=${custId}&job_id=${jId}" class="btn btn-primary btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Message Customer</a>
        <button class="btn btn-outline btn-sm btn-view-job-map" data-lat="${lat}" data-lng="${lng}" data-address="${addr}" data-title="${safeTitle}" data-customer-id="${custId}" data-job-id="${jId}" data-timeframe="${timeFrameStr}"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>
        ${j.customer_phone ? `<a href="tel:${j.customer_phone}" class="btn btn-ghost btn-sm"><i data-lucide="phone" width="14" height="14"></i> Call</a>` : ''}
      `;
    }
  } else if (tabType === 'completed' || status === 'completed') {
    badgeHtml = '<span class="badge badge-completed"><i data-lucide="check" width="12" height="12"></i> Completed</span>';
    const hoursBilled = j.hours_worked ?? '1.00';
    const travellingFee = parseFloat(j.travelling_fee || 0);
    const hourlyRate = parseFloat(j.worker_hourly_rate || 1000);
    const totalAmount = parseFloat(j.job_amount || j.amount || ((hoursBilled * hourlyRate) + travellingFee));

    statusBannerHtml = `
      <div style="margin-top:12px; padding:12px 16px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius-md); font-size:0.875rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Hours Billed:</span>
          <strong>${hoursBilled} hrs</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Hourly Rate:</span>
          <strong>Rs. ${formatLKR(hourlyRate).replace('Rs. ', '')} / hr</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">Travelling Fee:</span>
          <strong>Rs. ${formatLKR(travellingFee).replace('Rs. ', '')}</strong>
        </div>
        <hr style="border:0; border-top:1px dashed var(--border); margin:6px 0;">
        <div style="display:flex; justify-content:space-between; font-size:1rem; font-weight:700;">
          <span>Total Earned:</span>
          <strong style="color:var(--primary); font-size:1.1rem;">${formatLKR(totalAmount)}</strong>
        </div>
      </div>`;

    actionsHtml = `
      <a href="../messages.html?user_id=${custId}&job_id=${jId}" class="btn btn-outline btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Messages</a>
      <button class="btn btn-outline btn-sm btn-view-job-map" data-lat="${lat}" data-lng="${lng}" data-address="${addr}" data-title="${safeTitle}" data-customer-id="${custId}" data-job-id="${jId}" data-timeframe="${timeFrameStr}"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>
    `;
  } else {
    // Available tab
    badgeHtml = '<span class="badge badge-open">Open Request</span>';
    actionsHtml = `
      <button class="btn btn-primary btn-sm btn-take-job" data-job-id="${jId}" style="font-weight:700;">
        <i data-lucide="briefcase" width="14" height="14"></i> Take Job
      </button>
      <button class="btn btn-outline btn-sm btn-view-job-map" data-lat="${lat}" data-lng="${lng}" data-address="${addr}" data-title="${safeTitle}" data-customer-id="${custId}" data-job-id="${jId}" data-timeframe="${timeFrameStr}"><i data-lucide="map-pin" width="14" height="14"></i> Map</button>
      <a href="../messages.html?user_id=${custId}&job_id=${jId}" class="btn btn-ghost btn-sm"><i data-lucide="message-square" width="14" height="14"></i> Contact</a>
      ${j.customer_phone ? `<a href="tel:${j.customer_phone}" class="btn btn-ghost btn-sm"><i data-lucide="phone" width="14" height="14"></i> Call</a>` : ''}
    `;
  }

  return `
    <div class="job-card" id="worker-job-${jId}">
      <div class="job-card-header">
        <h3 class="job-card-title">${safeTitle}</h3>
        ${badgeHtml}
      </div>
      <div class="job-card-meta">
        <span><i data-lucide="user" width="14" height="14"></i> ${j.customer_name || 'Customer'}</span>
        <span><i data-lucide="map-pin" width="14" height="14"></i> ${addr}</span>
        <span><i data-lucide="calendar" width="14" height="14"></i> Preferred: <strong>${timeFrameStr}</strong></span>
        <span><i data-lucide="clock" width="14" height="14"></i> ${j.created_at || 'Recently'}</span>
        <span><i data-lucide="tag" width="14" height="14"></i> ${j.category_name || 'Service'}</span>
      </div>
      <p class="job-card-desc">${j.description || 'No description provided.'}</p>
      ${statusBannerHtml}
      <div class="job-card-actions" style="margin-top:14px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        ${actionsHtml}
      </div>
    </div>`;
}

function renderWorkerJobs() {
  const grid = $id('worker-jobs-container');
  if (!grid) return;

  if (currentWorkerJobTab === 'ongoing') {
    if (cachedOngoingJobs && cachedOngoingJobs.length > 0) {
      grid.innerHTML = cachedOngoingJobs.map(j => renderWorkerJobCard(j, 'ongoing')).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <i data-lucide="clock" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Ongoing Jobs</h3>
          <p style="color: var(--text-secondary); margin-bottom: 16px;">You do not have any jobs currently in progress.</p>
          <button class="btn btn-outline btn-sm" onclick="switchWorkerJobTab('available')">Browse Available Jobs</button>
        </div>`;
    }
  } else if (currentWorkerJobTab === 'completed') {
    if (cachedCompletedJobs && cachedCompletedJobs.length > 0) {
      grid.innerHTML = cachedCompletedJobs.map(j => renderWorkerJobCard(j, 'completed')).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Completed Jobs</h3>
          <p style="color: var(--text-secondary);">You have no completed jobs assigned to you yet.</p>
        </div>`;
    }
  } else {
    // Available Jobs
    if (cachedAvailableJobs && cachedAvailableJobs.length > 0) {
      grid.innerHTML = cachedAvailableJobs.map(j => renderWorkerJobCard(j, 'available')).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
          <i data-lucide="inbox" style="width: 48px; height: 48px; color: var(--text-muted); margin: 0 auto 12px; display:block;"></i>
          <h3 style="margin-bottom: 8px;">No Open Job Requests</h3>
          <p style="color: var(--text-secondary);">There are currently no open customer requests matching your area.</p>
        </div>`;
    }
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateWorkerLiveJobTimers();
}

function switchWorkerJobTab(tabKey) {
  currentWorkerJobTab = tabKey;
  const tabs = document.querySelectorAll('.tabs[data-tabs] .tab');
  tabs.forEach(t => {
    const tKey = t.getAttribute('data-tab') ||
      (t.textContent.trim().toLowerCase().includes('ongoing') ? 'ongoing' :
      (t.textContent.trim().toLowerCase().includes('completed') ? 'completed' : 'available'));
    if (tKey === tabKey) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  renderWorkerJobs();
}

function initWorkerJobTabs() {
  const tabsContainer = document.querySelector('.tabs[data-tabs]');
  if (!tabsContainer || !window.location.pathname.includes('jobs.html')) return;

  const tabs = tabsContainer.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async function () {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const tabKey = this.getAttribute('data-tab') ||
        (this.textContent.trim().toLowerCase().includes('ongoing') ? 'ongoing' :
        (this.textContent.trim().toLowerCase().includes('completed') ? 'completed' : 'available'));
      currentWorkerJobTab = tabKey;
      renderWorkerJobs();
      // Pull fresh data immediately upon switching tabs
      await loadOpenJobsForWorker(true);
    });
  });

  syncWorkerArrivalPolling();
}

function parseWorkerJobArrivedAtMs(dateStr) {
  if (!dateStr) return NaN;
  let str = String(dateStr).trim();
  if (!str) return NaN;
  // If "YYYY-MM-DD HH:MM:SS" from PHP/MySQL (which writes UTC date in PHP)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
    str = str + 'Z';
  }
  const time = new Date(str).getTime();
  return isNaN(time) ? new Date(dateStr).getTime() : time;
}

function formatWorkerElapsedTimer(arrivedAtStr) {
  const arrivedMs = parseWorkerJobArrivedAtMs(arrivedAtStr);
  if (isNaN(arrivedMs)) return '00:00:00';
  const diffSec = Math.max(0, Math.floor((Date.now() - arrivedMs) / 1000));
  const hrs = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateWorkerLiveJobTimers() {
  const timerEls = document.querySelectorAll('.job-timer-display');
  if (!timerEls.length) return;
  timerEls.forEach(el => {
    if (el.dataset.stopped === 'true') return;
    const arrivedAtStr = el.getAttribute('data-arrived-at');
    if (!arrivedAtStr) return;
    el.textContent = formatWorkerElapsedTimer(arrivedAtStr);
  });
}
setInterval(updateWorkerLiveJobTimers, 1000);

let workerArrivalPollTimer = null;
let isPollingWorkerArrival = false;

function hasUnconfirmedOngoingJob() {
  if (!Array.isArray(cachedOngoingJobs) || !cachedOngoingJobs.length) return false;
  return cachedOngoingJobs.some(j => {
    const status = (j.status || j.job_status || '').toLowerCase();
    return status === 'in_progress' && !j.arrived_at;
  });
}

function stopWorkerArrivalPolling() {
  if (workerArrivalPollTimer) {
    clearInterval(workerArrivalPollTimer);
    workerArrivalPollTimer = null;
  }
  isPollingWorkerArrival = false;
}

function startWorkerArrivalPolling() {
  if (!window.location.pathname.includes('jobs.html')) {
    stopWorkerArrivalPolling();
    return;
  }

  // Prevent multiple intervals running simultaneously
  if (workerArrivalPollTimer) return;

  // Poll job status every 5 seconds while an ongoing job awaits arrival confirmation
  workerArrivalPollTimer = setInterval(async () => {
    // Stop if user navigated away from jobs.html
    if (!window.location.pathname.includes('jobs.html')) {
      stopWorkerArrivalPolling();
      return;
    }

    // Stop if no unconfirmed ongoing jobs remain
    if (!hasUnconfirmedOngoingJob()) {
      stopWorkerArrivalPolling();
      return;
    }

    if (isPollingWorkerArrival) return;
    isPollingWorkerArrival = true;

    try {
      const res = await apiFetch('jobs.php?action=worker');
      if (res?.ok && res.data?.status === 'success' && Array.isArray(res.data.jobs)) {
        const myJobs = res.data.jobs;
        const freshOngoing = myJobs.filter(j => (j.status || j.job_status || '').toLowerCase() === 'in_progress');

        let newlyConfirmed = false;
        freshOngoing.forEach(fj => {
          const fjId = String(fj.id || fj.job_id);
          const existing = cachedOngoingJobs.find(cj => String(cj.id || cj.job_id) === fjId);
          if (fj.arrived_at && (!existing || !existing.arrived_at)) {
            newlyConfirmed = true;
          }
        });

        cachedOngoingJobs = freshOngoing;

        if (newlyConfirmed) {
          showToast('Customer confirmed your arrival! Work timer started.', 'success');
          if (currentWorkerJobTab !== 'ongoing') {
            switchWorkerJobTab('ongoing');
          } else {
            renderWorkerJobs();
            updateWorkerLiveJobTimers();
          }
        }

        // The moment arrived_at appears for all ongoing jobs, stop polling
        if (!hasUnconfirmedOngoingJob()) {
          stopWorkerArrivalPolling();
        }
      }
    } catch (err) {
      console.warn('Worker arrival poll check error:', err);
    } finally {
      isPollingWorkerArrival = false;
    }
  }, 5000);
}

function syncWorkerArrivalPolling() {
  if (hasUnconfirmedOngoingJob()) {
    startWorkerArrivalPolling();
  } else {
    stopWorkerArrivalPolling();
  }
}

// Ensure polling stops once the page is left
window.addEventListener('beforeunload', stopWorkerArrivalPolling);
window.addEventListener('pagehide', stopWorkerArrivalPolling);

async function loadOpenJobsForWorker(silent = false) {
  const grid = $id('worker-jobs-container');
  if (!grid || !window.location.pathname.includes('jobs.html')) return;

  const verifyBanner = $id('job-verification-banner');
  const accessBanner = $id('job-access-banner');

  if (!silent && !cachedAvailableJobs.length && !cachedOngoingJobs.length && !cachedCompletedJobs.length) {
    grid.innerHTML = `
      <div class="empty-state" id="worker-jobs-loading" style="text-align:center; padding: 40px 16px;">
        <i data-lucide="loader" class="spin" style="width: 32px; height: 32px; color: var(--primary); margin-bottom: 12px;"></i>
        <p style="color: var(--text-secondary);">Loading jobs...</p>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  try {
    const [res, workerRes, invRes] = await Promise.all([
      apiFetch('jobs.php?action=list'),
      apiFetch('jobs.php?action=worker').catch(() => ({ ok: false })),
      apiFetch('jobs.php?action=invoices').catch(() => ({ ok: false }))
    ]);

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

    if (res.ok && res.data?.status === 'success') {
      if (res.data.has_job_access && accessBanner) accessBanner.style.display = 'none';
      const openJobs = Array.isArray(res.data.jobs) ? res.data.jobs : [];
      cachedAvailableJobs = openJobs.filter(j => (!j.status || j.status.toLowerCase() === 'open') && !j.worker_id);
    } else {
      cachedAvailableJobs = [];
    }

    const invoicesByJobId = {};
    if (invRes?.ok && invRes.data?.invoices) {
      invRes.data.invoices.forEach(inv => { invoicesByJobId[inv.job_id] = inv; });
    }

    const myJobs = (workerRes?.ok && workerRes.data?.status === 'success' && Array.isArray(workerRes.data.jobs))
      ? workerRes.data.jobs
      : [];

    const prevOngoingCount = cachedOngoingJobs.length;
    const prevOngoingArrivals = cachedOngoingJobs.map(j => j.arrived_at).join(',');

    cachedOngoingJobs = myJobs.filter(j => (j.status || j.job_status || '').toLowerCase() === 'in_progress');
    cachedCompletedJobs = myJobs
      .filter(j => (j.status || j.job_status || '').toLowerCase() === 'completed')
      .map(j => {
        const inv = invoicesByJobId[j.id || j.job_id];
        if (inv) {
          return {
            ...j,
            hours_worked: inv.hours_worked ?? j.hours_worked,
            travelling_fee: inv.travelling_fee ?? j.travelling_fee,
            job_amount: inv.job_amount ?? inv.amount ?? j.job_amount
          };
        }
        return j;
      });

    const newOngoingArrivals = cachedOngoingJobs.map(j => j.arrived_at).join(',');

    if (!silent || prevOngoingCount !== cachedOngoingJobs.length || prevOngoingArrivals !== newOngoingArrivals) {
      renderWorkerJobs();
    }
    updateWorkerLiveJobTimers();
    syncWorkerArrivalPolling();
  } catch (err) {
    console.warn('loadOpenJobsForWorker error:', err);
    if (!silent) {
      grid.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 16px;"><p style="color: var(--error);">Failed to load jobs. Please check your connection.</p></div>';
    }
  }
}

async function executeCompleteHourlyJob(jobId, triggerBtn = null) {
  if (!jobId) return;
  const numJobId = parseInt(jobId, 10);

  // Freeze the timer display immediately upon tapping/confirming Done
  const timerEls = document.querySelectorAll(`.job-timer-display[data-job-id="${numJobId}"], .job-timer-display`);
  timerEls.forEach(el => { el.dataset.stopped = 'true'; });

  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = '<i data-lucide="loader" width="14" height="14" class="spin"></i> Completing...';
  }

  try {
    const res = await apiFetch('jobs.php?action=complete', {
      method: 'POST',
      body: JSON.stringify({ job_id: numJobId })
    });

    if (res.ok && res.data?.status === 'success') {
      const totalAmt = res.data.job_amount || (res.data.invoice?.job_amount) || 0;
      showToast(`Job completed! Invoice generated for Rs. ${Number(totalAmt).toFixed(2)}`, 'success');
      cachedOngoingJobs = cachedOngoingJobs.filter(j => String(j.id || j.job_id) !== String(numJobId));
      syncWorkerArrivalPolling();
      switchWorkerJobTab('completed');
      await loadOpenJobsForWorker();
    } else {
      showToast(res.data?.message || 'Failed to complete job.', 'error');
      timerEls.forEach(el => { delete el.dataset.stopped; });
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = '<i data-lucide="check-circle" width="15" height="15"></i> Done (Complete Job)';
      }
    }
  } catch (err) {
    showToast('Network error while completing job: ' + err.message, 'error');
    timerEls.forEach(el => { delete el.dataset.stopped; });
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = '<i data-lucide="check-circle" width="15" height="15"></i> Done (Complete Job)';
    }
  }
}

// Global click delegation for worker actions: Take Job & Done Job
document.addEventListener('click', async e => {
  const takeBtn = e.target.closest('.btn-take-job');
  if (takeBtn) {
    const jobId = takeBtn.getAttribute('data-job-id');
    if (!jobId) return;

    takeBtn.disabled = true;
    const oldHtml = takeBtn.innerHTML;
    takeBtn.innerHTML = '<i data-lucide="loader" width="14" height="14" class="spin"></i> Taking Job...';

    try {
      const res = await apiFetch('jobs.php?action=take', {
        method: 'POST',
        body: JSON.stringify({ job_id: parseInt(jobId, 10) })
      });

      if (res.ok && res.data?.status === 'success') {
        showToast('Job assigned to you! Switched to Ongoing jobs.', 'success');
        switchWorkerJobTab('ongoing');
        await loadOpenJobsForWorker();
      } else {
        const errMsg = res.data?.message || 'Failed to take job.';
        showToast(errMsg, 'error');
        await loadOpenJobsForWorker();
      }
    } catch (err) {
      showToast('Network error while taking job.', 'error');
      takeBtn.disabled = false;
      takeBtn.innerHTML = oldHtml;
    }
    return;
  }

  // Awaiting Arrival click: friendly guidance & instant server status check
  const awaitingBtn = e.target.closest('.btn-worker-awaiting-arrival, .btn-check-arrival-status');
  if (awaitingBtn) {
    const jobId = awaitingBtn.getAttribute('data-job-id');
    showToast('Checking if customer has confirmed your arrival...', 'info');
    await loadOpenJobsForWorker(true);
    const updated = cachedOngoingJobs.find(j => String(j.id || j.job_id) === String(jobId));
    if (updated && updated.arrived_at) {
      showToast('Arrival confirmed! The work timer is running.', 'success');
      renderWorkerJobs();
      updateWorkerLiveJobTimers();
      syncWorkerArrivalPolling();
    } else {
      showToast('Waiting for customer. Please ask the customer to tap "Worker is Here" to start the work timer and unlock the Done button.', 'warning');
    }
    return;
  }

  // Done Job click: opens confirmation modal or falls back gracefully
  const doneBtn = e.target.closest('.btn-worker-done-job');
  if (doneBtn) {
    const jobId = doneBtn.getAttribute('data-job-id');
    const jobTitle = doneBtn.getAttribute('data-job-title') || 'Job Request';
    if (!jobId) return;

    const modal = $id('confirm-complete-modal');
    if (modal) {
      if ($id('complete-modal-job-id')) $id('complete-modal-job-id').value = jobId;
      if ($id('complete-modal-title')) $id('complete-modal-title').textContent = jobTitle;
      openModal('confirm-complete-modal');
      return;
    }

    if (!confirm('Mark this job as complete? The final price will be automatically calculated based on your worked time, hourly rate, and travelling fee.')) {
      return;
    }
    await executeCompleteHourlyJob(jobId, doneBtn);
    return;
  }

  // Modal confirm submit
  const confirmCompleteSubmit = e.target.closest('#btn-confirm-complete-submit');
  if (confirmCompleteSubmit) {
    const jobId = $id('complete-modal-job-id')?.value;
    if (!jobId) return;
    closeModal('confirm-complete-modal');
    await executeCompleteHourlyJob(jobId, confirmCompleteSubmit);
    return;
  }
});

async function loadMyServicesForWorker() {
  const container = $id('worker-services-container');
  if (!container || !window.location.pathname.includes('my-services.html')) return;

  try {
    const res = await apiFetch('workers.php?action=my-services');
    if (res.ok && res.data?.status === 'success' && res.data.services?.length > 0) {
      container.innerHTML = res.data.services.map(s => {
        const priceVal = parseFloat(s.price || 0);
        const priceFormatted = priceVal > 0 ? formatLKR(priceVal).replace('Rs. ', '') : '0.00';
        const pricingUnit = (priceVal === 0) ? ' (To be updated)' : ((s.pricing_type === 'starting_at') ? ' (Starting)' : ' (Job Rate)');
        const catName = s.category_name || 'General';
        const displayLocation = s.district || s.location || 'Colombo';

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
                <span><i data-lucide="map-pin" width="14" height="14" style="display:inline;vertical-align:middle;"></i> ${displayLocation}</span>
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

// worker settings & wallet

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
        const bal = parseFloat(w.wallet_balance !== undefined ? w.wallet_balance : (w.balance || 0));
        const rate = (w.commission_rate !== undefined) ? (parseFloat(w.commission_rate) * 100).toFixed(0) + '%' : '10%';
        const isSub = (w.commission_rate !== undefined && parseFloat(w.commission_rate) <= 0.05);

        if (balDisplay) {
          balDisplay.textContent = (bal < 0 ? '- ' : '') + formatLKR(Math.abs(bal));
          balDisplay.style.color = (bal < 0) ? 'var(--error)' : 'var(--text-primary)';
        }
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

// dashboard stats & real metrics

async function loadWorkerDashboardStats() {
  if (!window.location.pathname.includes('worker/dashboard.html')) return;

  try {
    const res = await apiFetch('jobs.php?action=list');
    const availEl = $id('stat-available-jobs');
    if (availEl) availEl.textContent = (res.ok && res.data?.status === 'success' && Array.isArray(res.data.jobs)) ? res.data.jobs.length : '0';

    const banner = $id('subscription-banner');
    if (banner) banner.style.display = (res.ok && res.data?.has_job_access) ? '' : 'none';

    const dashJobsContainer = $id('worker-dashboard-jobs');
    if (dashJobsContainer && res.ok && res.data?.status === 'success' && Array.isArray(res.data.jobs) && res.data.jobs.length > 0) {
      dashJobsContainer.innerHTML = res.data.jobs.slice(0, 5).map(j => {
        const timeFrameStr = (typeof formatJobTimeFrame === 'function')
          ? formatJobTimeFrame(j.preferred_date, j.start_time, j.end_time)
          : 'Not specified';
        const addr = j.address || 'Colombo';
        const safeTitle = (j.title || 'Job Request').replace(/"/g, '&quot;');
        return `
          <div class="job-card">
            <div class="job-card-header">
              <h4 class="job-card-title" style="margin:0;font-size:1.05rem;">${safeTitle}</h4>
              <span class="badge badge-open">Open Request</span>
            </div>
            <div class="job-card-meta" style="margin-top:6px;">
              <span><i data-lucide="map-pin" width="14" height="14"></i> ${addr}</span>
              <span><i data-lucide="calendar" width="14" height="14"></i> Preferred: <strong>${timeFrameStr}</strong></span>
              <span><i data-lucide="tag" width="14" height="14"></i> ${j.category_name || 'Service'}</span>
            </div>
            <p class="job-card-desc" style="margin-top:8px;">${j.description || ''}</p>
            <div class="job-card-actions" style="margin-top:10px;">
              <a href="jobs.html" class="btn btn-primary btn-sm"><i data-lucide="briefcase" width="14" height="14"></i> View Available Jobs</a>
            </div>
          </div>`;
      }).join('');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
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
}

// worker reviews management (read-only)

function renderStarsHtml(score, size = 14) {
  const val = Math.min(5, Math.max(0, Math.round(Number(score) || 0)));
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= val) {
      html += `<i data-lucide="star" width="${size}" height="${size}" style="color:#f59e0b; fill:#f59e0b;"></i>`;
    } else {
      html += `<i data-lucide="star" width="${size}" height="${size}" style="color:#cbd5e1; fill:none;"></i>`;
    }
  }
  return html;
}

async function initWorkerReviews() {
  const reviewsContainer = $id('worker-reviews-list');
  const summaryBox = $id('worker-reviews-summary');
  const dashboardPreview = $id('worker-dashboard-reviews');
  const statRatingEl = $id('stat-worker-rating');
  const statReviewsCountEl = $id('stat-reviews-count');

  if (!reviewsContainer && !summaryBox && !dashboardPreview && !statRatingEl && !statReviewsCountEl) {
    return;
  }

  // 1. Identify current worker ID
  let user = (typeof getLoggedInUser === 'function') ? getLoggedInUser() : null;
  let workerId = user?.worker_id || user?.worker?.id || user?.worker_profile?.id;

  if (!workerId) {
    try {
      const meRes = await apiFetch('auth.php?action=me');
      if (meRes.ok && meRes.data?.user) {
        const u = meRes.data.user;
        workerId = u.worker_profile?.id || u.worker_id || u.worker?.id;
        if (workerId && user) {
          user.worker_id = workerId;
          localStorage.setItem('jodkade_logged_user', JSON.stringify(user));
          localStorage.setItem('jobkade_user', JSON.stringify(user));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch worker identity from auth.php:', e);
    }
  }

  if (!workerId) {
    if (reviewsContainer) {
      reviewsContainer.innerHTML = '<div class="empty-state" style="text-align:center; padding:36px 16px;"><p style="color:var(--text-muted); margin:0;">Unable to load reviews for this worker profile.</p></div>';
    }
    return;
  }

  // 2. Fetch reviews using existing API: GET api/reviews.php?action=worker&worker_id={worker_id}
  try {
    const res = await apiFetch(`reviews.php?action=worker&worker_id=${workerId}`);
    if (res.ok && res.data && res.data.status === 'success') {
      const reviews = Array.isArray(res.data.reviews) ? res.data.reviews : [];
      const totalReviews = reviews.length;

      // Calculate score & breakdown
      const sum = reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 0), 0);
      const avgScore = totalReviews > 0 ? (sum / totalReviews).toFixed(1) : '0.0';

      const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      reviews.forEach(r => {
        const star = Math.min(5, Math.max(1, Math.round(parseFloat(r.rating) || 5)));
        counts[star] = (counts[star] || 0) + 1;
      });

      // Update stat cards if on dashboard
      if (statRatingEl) statRatingEl.textContent = avgScore;
      if (statReviewsCountEl) statReviewsCountEl.textContent = totalReviews;

      // Update Summary at the top (if on reviews.html)
      const avgScoreEl = $id('summary-avg-score');
      const starsRowEl = $id('summary-stars');
      const totalLabelEl = $id('summary-total-label');

      if (avgScoreEl) avgScoreEl.textContent = avgScore;
      if (starsRowEl) starsRowEl.innerHTML = renderStarsHtml(avgScore, 24);
      if (totalLabelEl) {
        totalLabelEl.textContent = `Based on ${totalReviews} review${totalReviews === 1 ? '' : 's'}`;
      }


      // Render Review List
      if (reviewsContainer) {
        if (totalReviews === 0) {
          reviewsContainer.innerHTML = `
            <div class="empty-state" style="text-align:center; padding: 48px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
              <i data-lucide="message-square" style="width: 40px; height: 40px; color: var(--text-muted); margin: 0 auto 12px; display:block; opacity:0.5;"></i>
              <h4 style="margin-bottom: 6px;">No reviews yet.</h4>
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">Customer reviews will appear here once you complete job requests.</p>
            </div>
          `;
        } else {
          reviewsContainer.innerHTML = reviews.map(r => {
            const cName = escapeHtml(r.customer_name || 'Verified Customer');
            const cInitials = escapeHtml((r.customer_name || 'C').substring(0, 2).toUpperCase());
            const dateStr = r.created_at
              ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : 'Recent';
            const rating = Math.min(5, Math.max(1, parseInt(r.rating || 5, 10)));
            const commentText = escapeHtml(r.comment || '');

            return `
              <div class="review-card" style="padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 16px; box-shadow: var(--shadow-sm);">
                <div class="review-header" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                  <div class="review-avatar" style="width:40px; height:40px; border-radius:50%; background:var(--bg-alt); color:var(--text-primary); font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.875rem; border:1px solid var(--border-light);">${cInitials}</div>
                  <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                      <div class="review-name" style="font-weight:600; font-size:0.95rem; color:var(--text-primary);">${cName}</div>
                      <div class="review-date" style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</div>
                    </div>
                    <div class="star-rating" style="display:inline-flex; gap:2px; color:#f59e0b; margin-top:2px;">
                      ${renderStarsHtml(rating, 14)}
                    </div>
                  </div>
                </div>
                <p class="review-text" style="font-size:0.875rem; color:var(--text-secondary); line-height:1.6; margin:0;">${commentText || '<em style="color:var(--text-muted);">No comment provided.</em>'}</p>
              </div>
            `;
          }).join('');
        }
      }

      // Render Dashboard Preview (if on dashboard.html)
      if (dashboardPreview) {
        if (totalReviews === 0) {
          dashboardPreview.innerHTML = `
            <div class="empty-state" style="text-align:center; padding: 32px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg);">
              <i data-lucide="message-square" style="width: 32px; height: 32px; color: var(--text-muted); margin: 0 auto 8px; display:block; opacity:0.5;"></i>
              <h4 style="margin-bottom: 4px; font-size: 0.95rem;">No reviews yet.</h4>
              <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0;">Reviews from customers will appear here after job completion.</p>
            </div>
          `;
        } else {
          const previewReviews = reviews.slice(0, 3);
          dashboardPreview.innerHTML = previewReviews.map(r => {
            const cName = escapeHtml(r.customer_name || 'Verified Customer');
            const cInitials = escapeHtml((r.customer_name || 'C').substring(0, 2).toUpperCase());
            const dateStr = r.created_at
              ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : 'Recent';
            const rating = Math.min(5, Math.max(1, parseInt(r.rating || 5, 10)));
            const commentText = escapeHtml(r.comment || '');

            return `
              <div class="review-card" style="padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 12px;">
                <div class="review-header" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                  <div class="review-avatar" style="width:34px; height:34px; border-radius:50%; background:var(--bg-alt); color:var(--text-primary); font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.8rem; border:1px solid var(--border-light);">${cInitials}</div>
                  <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div class="review-name" style="font-weight:600; font-size:0.9rem;">${cName}</div>
                      <div class="review-date" style="font-size:0.75rem; color:var(--text-muted);">${dateStr}</div>
                    </div>
                    <div class="star-rating" style="display:inline-flex; gap:2px; color:#f59e0b; margin-top:2px;">
                      ${renderStarsHtml(rating, 13)}
                    </div>
                  </div>
                </div>
                <p class="review-text" style="font-size:0.85rem; color:var(--text-secondary); line-height:1.5; margin:0;">${commentText || '<em style="color:var(--text-muted);">No comment provided.</em>'}</p>
              </div>
            `;
          }).join('');
        }
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      if (reviewsContainer) {
        reviewsContainer.innerHTML = '<div class="empty-state" style="text-align:center; padding:36px 16px;"><p style="color:var(--error); margin:0;">Unable to load reviews right now.</p></div>';
      }
    }
  } catch (err) {
    console.warn('initWorkerReviews failed:', err);
    if (reviewsContainer) {
      reviewsContainer.innerHTML = '<div class="empty-state" style="text-align:center; padding:36px 16px;"><p style="color:var(--error); margin:0;">Error loading reviews.</p></div>';
    }
  }
}
