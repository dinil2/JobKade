/* ==========================================================
   Job Kade — In-App Messaging Client Logic (Vanilla JS + Fetch API)
   Strictly Pure Database-Backed Architecture (No Mocks/Static Dummies)
   ========================================================== */

document.addEventListener('DOMContentLoaded', function () {
  const token = getAuthToken();
  const user = getLoggedInUser();

  const chatContainer = document.querySelector('.chat-container');
  const conversationsList = document.getElementById('conversations-list');
  const chatHeaderUser = document.getElementById('chat-header-user');
  const chatHeaderActions = document.getElementById('chat-header-actions');
  const chatJobBanner = document.getElementById('chat-job-banner');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const searchInput = document.getElementById('search-conversations');
  const chatBackBtn = document.getElementById('chat-back-btn');

  // Check authentication immediately
  if (!token || !user) {
    if (conversationsList) {
      conversationsList.innerHTML = `
        <div style="padding: 30px 16px; text-align: center; color: var(--text-muted);">
          <i data-lucide="lock" width="32" height="32" style="margin: 0 auto 10px; display: block; color: var(--text-muted);"></i>
          <p style="font-weight: 600; margin-bottom: 4px;">Login Required</p>
          <p style="font-size: 0.8rem; margin-bottom: 12px;">Please log in to view your conversations.</p>
          <a href="auth/login.html" class="btn btn-primary btn-sm">Sign In</a>
        </div>`;
    }
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon"><i data-lucide="lock" width="32" height="32"></i></div>
          <h3>Authentication Required</h3>
          <p>You need an active session to send and receive direct messages.</p>
          <a href="auth/login.html" class="btn btn-primary" style="margin-top: 12px; display: inline-block;">Go to Login</a>
        </div>`;
    }
    if (chatInput) chatInput.disabled = true;
    if (btnSend) btnSend.disabled = true;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Adapt Sidebar for Logged-In Role
  setupSidebarForRole(user);

  // Messaging State
  let activeUserId = null;
  let activeJobId = null;
  let activeContact = null;
  let allConversations = [];
  let pollInterval = null;
  let pollAbortController = null;
  let lastMessageCount = -1;
  let isSending = false;

  const currentUserId = parseInt(user.id || user.user_id || 0, 10);

  // ---- Helper: Format Timestamp to HH:mm ----
  function formatTimeHHmm(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split(/[- :]/);
      let dateObj;
      if (parts.length >= 5) {
        dateObj = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0);
      } else {
        dateObj = new Date(dateStr);
      }

      if (isNaN(dateObj.getTime())) return dateStr;

      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (e) {
      return dateStr;
    }
  }

  // Format short date for day separators
  function formatDateLabel(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split(/[- :]/);
      let d;
      if (parts.length >= 3) {
        d = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        d = new Date(dateStr);
      }

      const today = new Date();
      if (d.toDateString() === today.toDateString()) {
        return 'Today';
      }

      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }

      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  // ---- Setup Sidebar Based on User Role ----
  function setupSidebarForRole(curUser) {
    const aside = document.querySelector('.sidebar');
    if (!aside) return;

    const initial = (curUser.name || curUser.full_name || 'U').charAt(0).toUpperCase();
    const role = (curUser.role || 'customer').toLowerCase();
    const avatarColor = role === 'worker' ? 'avatar-green' : (role === 'admin' ? 'avatar-purple' : 'avatar-blue');

    aside.className = 'sidebar ' + role;
    const headerEl = aside.querySelector('.sidebar-header');
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="sidebar-user">
          <div class="avatar avatar-md ${avatarColor}">${initial}</div>
          <div>
            <div class="sidebar-user-name">${escapeHtml(curUser.name || curUser.full_name || 'User')}</div>
            <div class="sidebar-user-role" style="text-transform: capitalize;">${role}</div>
          </div>
        </div>`;
    }

    const navEl = aside.querySelector('.sidebar-nav');
    if (navEl) {
      if (role === 'worker') {
        navEl.innerHTML = `
          <div class="sidebar-label">Main</div>
          <a href="worker/dashboard.html" class="sidebar-link"><i data-lucide="layout-dashboard"></i> Dashboard</a>
          <a href="worker/profile-edit.html" class="sidebar-link"><i data-lucide="user"></i> My Profile</a>
          <a href="worker/kyc.html" class="sidebar-link"><i data-lucide="shield-check"></i> Identity & KYC</a>
          <a href="worker/my-services.html" class="sidebar-link"><i data-lucide="briefcase"></i> My Services</a>
          <a href="worker/jobs.html" class="sidebar-link"><i data-lucide="file-text"></i> Customer Jobs</a>
          <a href="worker/subscription.html" class="sidebar-link"><i data-lucide="credit-card"></i> Subscriptions</a>
          <div class="sidebar-label">Account</div>
          <a href="messages.html" class="sidebar-link active"><i data-lucide="message-square"></i> Messages</a>`;
      } else if (role === 'admin') {
        navEl.innerHTML = `
          <div class="sidebar-label">Management</div>
          <a href="admin/dashboard.html" class="sidebar-link"><i data-lucide="layout-dashboard"></i> Overview</a>
          <a href="admin/kyc-moderation.html" class="sidebar-link"><i data-lucide="shield-check"></i> KYC Moderation</a>
          <a href="admin/workers.html" class="sidebar-link"><i data-lucide="users"></i> Manage Workers</a>
          <a href="admin/customers.html" class="sidebar-link"><i data-lucide="user-check"></i> Manage Customers</a>
          <a href="admin/jobs.html" class="sidebar-link"><i data-lucide="file-text"></i> Job Requests</a>
          <div class="sidebar-label">Account</div>
          <a href="messages.html" class="sidebar-link active"><i data-lucide="message-square"></i> Messages</a>`;
      } else {
        navEl.innerHTML = `
          <div class="sidebar-label">Main</div>
          <a href="customer/dashboard.html" class="sidebar-link"><i data-lucide="layout-dashboard"></i> Dashboard</a>
          <a href="workers.html" class="sidebar-link"><i data-lucide="search"></i> Find Workers</a>
          <a href="customer/jobs.html" class="sidebar-link"><i data-lucide="file-text"></i> My Job Requests</a>
          <a href="customer/post-job.html" class="sidebar-link"><i data-lucide="plus-circle"></i> Post a Job</a>
          <a href="customer/saved-workers.html" class="sidebar-link"><i data-lucide="heart"></i> Saved Workers</a>
          <div class="sidebar-label">Account</div>
          <a href="messages.html" class="sidebar-link active"><i data-lucide="message-square"></i> Messages</a>
          <a href="customer/profile.html" class="sidebar-link"><i data-lucide="user"></i> Profile</a>`;
      }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // ---- Fetch & Render Conversation Threads ----
  async function loadConversations(targetUserIdToSelect) {
    try {
      const res = await apiFetch('messages.php?action=conversations');
      if (res.ok && res.data && res.data.status === 'success') {
        allConversations = res.data.conversations || [];
      } else {
        allConversations = [];
      }

      // Check if target user exists in conversation list
      if (targetUserIdToSelect) {
        const found = allConversations.find(c => parseInt(c.other_user_id) === parseInt(targetUserIdToSelect));
        if (!found) {
          // Prepend temporary conversation item to list for new contact
          try {
            const contactRes = await apiFetch('messages.php?action=contact_info&user_id=' + targetUserIdToSelect);
            if (contactRes.ok && contactRes.data && contactRes.data.contact) {
              const c = contactRes.data.contact;
              allConversations.unshift({
                other_user_id: c.id,
                other_user_name: c.full_name,
                other_user_role: c.role,
                other_user_phone: c.phone,
                last_message: 'Starting new conversation...',
                last_message_time: new Date().toISOString().replace('T', ' ').substring(0, 19),
                unread_count: 0
              });
            }
          } catch (e) {
            console.warn('Could not fetch new contact info:', e);
          }
        }
      }

      renderConversationsList(allConversations);

      if (targetUserIdToSelect) {
        selectConversation(targetUserIdToSelect, activeJobId);
      } else if (!activeUserId && allConversations.length > 0 && window.innerWidth > 820) {
        // Auto-select first conversation on wide screens
        selectConversation(allConversations[0].other_user_id, null, allConversations[0]);
      }
    } catch (err) {
      console.error('Error loading conversations from API:', err);
      allConversations = [];
      renderConversationsList(allConversations);
    }
  }

  // ---- Render Conversations List (Sidebar) ----
  function renderConversationsList(list) {
    if (!conversationsList) return;
    conversationsList.innerHTML = '';

    if (!list || list.length === 0) {
      conversationsList.innerHTML = `
        <div style="padding: 30px 16px; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">
          <i data-lucide="message-square-off" width="32" height="32" style="margin: 0 auto 10px; color: var(--text-muted); display: block;"></i>
          <p style="margin:0 0 6px; font-weight: 600;">No conversations yet</p>
          <p style="margin:0; font-size: 0.75rem;">Contact a verified worker or customer to begin messaging.</p>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    list.forEach(function (conv) {
      const li = document.createElement('li');
      const isSelected = (parseInt(conv.other_user_id) === activeUserId);
      const unreadCount = parseInt(conv.unread_count || 0);

      li.className = 'conversation-item' + (isSelected ? ' active' : '') + (unreadCount > 0 ? ' unread' : '');
      li.setAttribute('data-user-id', conv.other_user_id);

      const name = conv.other_user_name || 'User #' + conv.other_user_id;
      const initial = name.charAt(0).toUpperCase();
      const role = conv.other_user_role || 'member';
      const roleClass = role === 'worker' ? 'worker' : (role === 'customer' ? 'customer' : 'admin');
      const avatarClass = role === 'worker' ? 'avatar-green' : 'avatar-blue';
      const timeStr = formatTimeHHmm(conv.last_message_time);
      const preview = conv.last_message ? conv.last_message : 'No messages yet';

      li.innerHTML = `
        <div class="conversation-avatar-wrap">
          <div class="avatar ${avatarClass}">${initial}</div>
          <span class="online-dot"></span>
        </div>
        <div class="conversation-body">
          <div class="conversation-top">
            <span class="conversation-name">${escapeHtml(name)}</span>
            <span class="conversation-time">${timeStr}</span>
          </div>
          <div class="conversation-preview">
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(preview)}</span>
            <span class="role-pill ${roleClass}">${role}</span>
            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
          </div>
        </div>`;

      li.addEventListener('click', function () {
        selectConversation(conv.other_user_id, null, conv);
      });

      conversationsList.appendChild(li);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // ---- Select a Conversation ----
  async function selectConversation(userId, jobId, knownUserObj) {
    // Cancel any in-flight polling request from previous conversation
    if (pollAbortController) {
      pollAbortController.abort();
      pollAbortController = null;
    }

    activeUserId = parseInt(userId, 10);
    if (jobId) activeJobId = parseInt(jobId, 10);

    // Update active highlight in list
    document.querySelectorAll('.conversation-item').forEach(function (el) {
      if (parseInt(el.getAttribute('data-user-id')) === activeUserId) {
        el.classList.add('active');
        el.classList.remove('unread');
        const badge = el.querySelector('.unread-badge');
        if (badge) badge.remove();
      } else {
        el.classList.remove('active');
      }
    });

    if (chatContainer) chatContainer.classList.add('thread-open');

    // Fetch contact details from API
    activeContact = knownUserObj || null;
    if (!activeContact || !activeContact.phone) {
      try {
        const contactRes = await apiFetch('messages.php?action=contact_info&user_id=' + activeUserId);
        if (contactRes.ok && contactRes.data && contactRes.data.contact) {
          activeContact = contactRes.data.contact;
        }
      } catch (e) {
        console.warn('Could not load contact details:', e);
      }
    }

    renderChatHeader(activeContact);
    lastMessageCount = -1; // Force fresh render

    // Automatically trigger markAsRead upon opening conversation
    triggerMarkAsRead(activeUserId);

    await loadThreadMessages(true);

    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
    if (btnSend) btnSend.disabled = false;
  }

  // ---- Mark Conversation Messages As Read ----
  async function triggerMarkAsRead(senderId) {
    if (!senderId) return;
    try {
      await apiFetch('messages.php?action=read', {
        method: 'POST',
        body: JSON.stringify({ sender_id: senderId })
      });
    } catch (e) {
      // Background silent sync
    }
  }

  // ---- Render Active Chat Header ----
  function renderChatHeader(contact) {
    if (!chatHeaderUser) return;

    const name = contact ? (contact.full_name || contact.other_user_name || ('User #' + activeUserId)) : ('User #' + activeUserId);
    const initial = name.charAt(0).toUpperCase();
    const role = contact ? (contact.role || contact.other_user_role || 'member') : 'member';
    const roleClass = role === 'worker' ? 'worker' : 'customer';
    const avatarClass = role === 'worker' ? 'avatar-green' : 'avatar-blue';

    const isVerified = contact && (contact.is_verified == 1 || contact.verify_status === 'verified');

    chatHeaderUser.innerHTML = `
      <div class="avatar avatar-sm ${avatarClass}">${initial}</div>
      <div>
        <div class="chat-header-name">
          ${escapeHtml(name)}
          <span class="role-pill ${roleClass}">${role}</span>
          ${isVerified ? '<span class="badge badge-verified" style="font-size:0.65rem;padding:2px 6px;"><i data-lucide="check" width="10" height="10"></i> Verified</span>' : ''}
        </div>
        <div class="chat-header-status">
          <span class="online-dot" style="position:static; width:8px; height:8px;"></span> Active Now
        </div>
      </div>`;

    if (chatHeaderActions) {
      const phone = contact ? (contact.phone || contact.other_user_phone || '') : '';
      if (phone) {
        const phoneClean = phone.replace(/\D/g, '');
        const waNum = phoneClean.startsWith('0') ? ('94' + phoneClean.substring(1)) : phoneClean;
        chatHeaderActions.innerHTML = `
          <a href="tel:${escapeHtml(phone)}" class="btn btn-call btn-sm btn-icon-sm" title="Call directly">
            <i data-lucide="phone" width="16" height="16"></i>
          </a>
          <a href="https://wa.me/${waNum}" target="_blank" class="btn btn-whatsapp btn-sm btn-icon-sm" title="Open WhatsApp">
            <i data-lucide="message-circle" width="16" height="16"></i>
          </a>`;
      } else {
        chatHeaderActions.innerHTML = '';
      }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // ---- Load Thread Messages via API with AbortController Support ----
  async function loadThreadMessages(scrollToBottom, signal) {
    if (!activeUserId || !chatMessages) return;

    try {
      let endpoint = 'messages.php?action=conversation&with_user_id=' + activeUserId;
      if (activeJobId) {
        endpoint += '&job_id=' + activeJobId;
      }

      const res = await apiFetch(endpoint, { signal: signal });
      if (res.ok && res.data && res.data.status === 'success') {
        const messages = res.data.messages || [];

        // Check if messages count changed to prevent redundant reflows
        if (!scrollToBottom && messages.length === lastMessageCount) {
          return;
        }

        const isNearBottom = (chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 100);
        lastMessageCount = messages.length;

        renderThreadMessages(messages);

        // Maintain responsive scroll anchoring
        if (scrollToBottom || isNearBottom) {
          scrollChatToBottom();
        }
      } else if (res.status === 401) {
        showToast('Session expired. Please log in again.', 'error');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load message thread from API:', err);
      }
    }
  }

  // ---- Render Messages Stream ----
  function renderThreadMessages(messages) {
    if (!chatMessages) return;
    chatMessages.innerHTML = '';

    // Render optional job context banner
    let linkedJobTitle = null;
    messages.forEach(m => { if (m.job_title) linkedJobTitle = m.job_title; });
    if (linkedJobTitle && chatJobBanner) {
      chatJobBanner.style.display = 'flex';
      chatJobBanner.innerHTML = `
        <div><i data-lucide="briefcase" width="14" height="14" style="display:inline; vertical-align:middle; margin-right:4px;"></i> In reference to job: <strong>${escapeHtml(linkedJobTitle)}</strong></div>
        <span class="badge badge-open">In Discussion</span>`;
    } else if (chatJobBanner) {
      chatJobBanner.style.display = 'none';
    }

    // Clean Empty State when conversation has no messages
    if (!messages || messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon"><i data-lucide="message-square" width="32" height="32"></i></div>
          <h3>No messages yet. Start the conversation!</h3>
          <p>Send a message to discuss project details, availability, or quotations.</p>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    let lastDate = null;
    messages.forEach(function (msg) {
      const senderId = parseInt(msg.sender_id, 10);
      const isOutgoing = (senderId === currentUserId);
      const msgDate = msg.created_at ? msg.created_at.split(' ')[0] : null;

      // Date Separator (Today, Yesterday, Date)
      if (msgDate && msgDate !== lastDate) {
        lastDate = msgDate;
        const dateDiv = document.createElement('div');
        dateDiv.className = 'chat-date-separator';
        dateDiv.textContent = formatDateLabel(msgDate);
        chatMessages.appendChild(dateDiv);
      }

      // Message Group: Left (incoming) vs Right (outgoing)
      const groupDiv = document.createElement('div');
      groupDiv.className = 'message-group ' + (isOutgoing ? 'outgoing' : 'incoming');

      // Bubble (Gray for incoming, Primary for outgoing)
      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'message-bubble';
      bubbleDiv.textContent = msg.message_text;

      // Meta: Human-readable timestamp in HH:mm format
      const metaDiv = document.createElement('div');
      metaDiv.className = 'message-meta';
      const timeStr = formatTimeHHmm(msg.created_at);

      metaDiv.innerHTML = `
        <span>${timeStr}</span>
        ${isOutgoing ? `<i data-lucide="${parseInt(msg.is_read) === 1 ? 'check-check' : 'check'}" width="12" height="12" class="msg-status-icon"></i>` : ''}
      `;

      groupDiv.appendChild(bubbleDiv);
      groupDiv.appendChild(metaDiv);
      chatMessages.appendChild(groupDiv);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function scrollChatToBottom() {
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  // ---- Handle Sending Messages ----
  async function handleSendMessage() {
    if (!chatInput || isSending) return;
    if (!activeUserId) {
      showToast('Please select a recipient from the list before sending a message.', 'error');
      return;
    }

    const rawText = chatInput.value.trim();
    if (!rawText || rawText.length === 0) {
      chatInput.focus();
      return;
    }

    if (rawText.length > 2000) {
      showToast('Message exceeds maximum limit of 2,000 characters.', 'error');
      return;
    }

    isSending = true;
    if (btnSend) btnSend.disabled = true;
    chatInput.value = '';

    try {
      const res = await apiFetch('messages.php?action=send', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: activeUserId,
          message_text: rawText,
          job_id: activeJobId
        })
      });

      if (res.ok && res.data && res.data.status === 'success') {
        await loadThreadMessages(true);
        loadConversations(); // refresh snippet & unread status
      } else {
        const errorMsg = (res.data && res.data.message) ? res.data.message : 'Failed to send message. Please try again.';
        showToast(errorMsg, 'error');
        // Restore unsent text
        chatInput.value = rawText;
      }
    } catch (err) {
      console.error('Error sending message:', err);
      showToast('Network error while sending message.', 'error');
      chatInput.value = rawText;
    } finally {
      isSending = false;
      if (btnSend) btnSend.disabled = false;
      if (chatInput) chatInput.focus();
    }
  }

  // ---- Event Bindings ----
  if (btnSend) {
    btnSend.addEventListener('click', handleSendMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  // Filter Conversations in Search Input
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      const q = this.value.toLowerCase().trim();
      if (!q) {
        renderConversationsList(allConversations);
        return;
      }
      const filtered = allConversations.filter(function (c) {
        return (c.other_user_name && c.other_user_name.toLowerCase().includes(q)) ||
               (c.last_message && c.last_message.toLowerCase().includes(q));
      });
      renderConversationsList(filtered);
    });
  }

  // Mobile Back Button to Return to Conversation List
  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', function () {
      if (chatContainer) chatContainer.classList.remove('thread-open');
    });
  }

  // Utility to escape HTML strings safely
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Parse URL Parameters (?recipient_id=X or ?user_id=X or ?with_user_id=X)
  const urlParams = new URLSearchParams(window.location.search);
  const targetUserId = urlParams.get('recipient_id') || urlParams.get('with_user_id') || urlParams.get('user_id');
  const targetJobId = urlParams.get('job_id');
  if (targetJobId) activeJobId = parseInt(targetJobId, 10);

  // Initial Load
  loadConversations(targetUserId ? parseInt(targetUserId, 10) : null);

  // Safe Dynamic Polling: Fetch active conversation every 3.5 seconds using AbortController (only when page is visible)
  pollInterval = setInterval(function () {
    if (document.visibilityState === 'visible' && activeUserId && !isSending) {
      if (pollAbortController) {
        pollAbortController.abort();
      }
      pollAbortController = new AbortController();
      loadThreadMessages(false, pollAbortController.signal);
    }
  }, 3500);

  window.addEventListener('beforeunload', function () {
    if (pollInterval) clearInterval(pollInterval);
    if (pollAbortController) pollAbortController.abort();
  });
});
