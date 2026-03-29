/* notifications.js — Bell feed, unread count, realtime dropdown */

let _nClient = null;
let _nUserId = null;
let _nOpen = false;

function initNotifications(supabaseClient, userId) {
  _nClient = supabaseClient;
  _nUserId = userId;
  _refreshBadge();

  // Realtime: update badge on new notification
  _nClient.channel('notif-badge')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, () => _refreshBadge())
    .subscribe();

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (_nOpen && !e.target.closest('#notif-btn') && !e.target.closest('#notif-panel')) {
      closeNotifPanel();
    }
  });
}

async function _refreshBadge() {
  const { count } = await _nClient.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', _nUserId)
    .eq('is_read', false);
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'inline-flex';
    document.title = `(${count > 9 ? '9+' : count}) ${document.title.replace(/^\(\d+\+?\)\s*/, '')}`;
  } else {
    badge.style.display = 'none';
    document.title = document.title.replace(/^\(\d+\+?\)\s*/, '');
  }
}

async function toggleNotifPanel() {
  if (_nOpen) { closeNotifPanel(); return; }
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.style.display = 'block';
  _nOpen = true;
  panel.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);">Loading…</div>';
  await _loadNotifPanel(panel);
}

function closeNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.style.display = 'none';
  _nOpen = false;
}

async function _loadNotifPanel(panel) {
  const { data, error } = await _nClient.from('notifications')
    .select('*')
    .eq('user_id', _nUserId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) { panel.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--text-muted);">Failed to load.</div>'; return; }

  const unreadIds = data.filter(n => !n.is_read).map(n => n.id);

  const icons = { article_tag: '🔖', comment_reply: '💬', mention: '@', dm: '✉️', access_approved: '✅' };

  panel.innerHTML = `
    <div class="np-header">
      <span style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:1px;">NOTIFICATIONS</span>
      ${unreadIds.length ? `<button class="np-mark-all" onclick="markAllRead()">Mark all read</button>` : ''}
    </div>
    ${data.length === 0
      ? '<div class="np-empty">No notifications yet.</div>'
      : data.map(n => `
        <div class="np-item${n.is_read ? '' : ' np-unread'}" onclick="handleNotifClick('${n.id}','${_escN(n.link)}')">
          <span class="np-icon">${icons[n.type] || '🔔'}</span>
          <div class="np-body">
            <div class="np-title">${_escN(n.title)}</div>
            <div class="np-time">${_agoN(n.created_at)}</div>
          </div>
          ${n.is_read ? '' : '<span class="np-dot"></span>'}
        </div>`).join('')
    }`;
}

async function handleNotifClick(id, link) {
  await _nClient.from('notifications').update({ is_read: true }).eq('id', id);
  closeNotifPanel();
  _refreshBadge();
  if (link) window.location.href = link;
}

async function markAllRead() {
  await _nClient.from('notifications').update({ is_read: true })
    .eq('user_id', _nUserId).eq('is_read', false);
  _refreshBadge();
  const panel = document.getElementById('notif-panel');
  if (panel && _nOpen) await _loadNotifPanel(panel);
}

// Called by favorites.js / comments.js / messages.js to insert notifications
async function createNotification(userId, type, title, link, referenceId) {
  if (!_nClient) return;
  await _nClient.from('notifications').insert({
    user_id: userId, type, title, link,
    reference_id: referenceId || null, is_read: false,
  });
}

function _escN(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _agoN(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
