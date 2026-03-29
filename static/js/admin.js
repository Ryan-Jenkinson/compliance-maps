/* admin.js — Admin panel runtime logic.
 * auth.js must be loaded first. checkAuth() must complete before these are called.
 */

async function loadAccessRequests() {
  var sb = getClient();
  var result = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200);

  var tbody = document.getElementById('requests-tbody');
  if (result.error) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#f08080;padding:12px;">Error: ' + escHtml(result.error.message) + '</td></tr>';
    return;
  }
  if (!result.data || result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#5a6270;padding:12px;font-style:italic;">No pending requests.</td></tr>';
    return;
  }

  tbody.innerHTML = result.data.map(function(r) {
    return '<tr>' +
      '<td>' + escHtml(r.full_name) + '</td>' +
      '<td>' + escHtml(r.email) + '</td>' +
      '<td>' + (r.reason ? escHtml(r.reason) : '<span style="color:#5a6270">\u2014</span>') + '</td>' +
      '<td>' + new Date(r.created_at).toLocaleDateString() + '</td>' +
      '<td>' +
        '<button class="action-btn approve" onclick="approveRequest(\'' + r.id + '\',\'' + escHtml(r.email) + '\',\'' + escHtml(r.full_name) + '\')">Approve</button>' +
        '<button class="action-btn reject" onclick="rejectRequest(\'' + r.id + '\')">Reject</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function loadUsers() {
  var sb = getClient();
  var result = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(500);

  var tbody = document.getElementById('users-tbody');
  if (result.error) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#f08080;padding:12px;">Error: ' + escHtml(result.error.message) + '</td></tr>';
    return;
  }
  if (!result.data || result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#5a6270;padding:12px;">No users yet.</td></tr>';
    return;
  }

  var profile = getProfile();
  tbody.innerHTML = result.data.map(function(u) {
    var isSelf = profile && u.id === profile.id;
    var isSuperAdmin = u.role === 'super_admin';
    var canEditRole = !isSelf && !isSuperAdmin && profile && profile.role === 'super_admin';
    var canDelete = !isSelf && !isSuperAdmin && profile && ['admin', 'super_admin'].includes(profile.role);
    return '<tr>' +
      '<td>' + escHtml(u.full_name || '\u2014') + '</td>' +
      '<td>' + escHtml(u.email) + '</td>' +
      '<td>' +
        '<select ' + (canEditRole ? 'onchange="changeRole(\'' + u.id + '\', this.value)"' : 'disabled') +
        ' style="background:#1a1f2a;border:1px solid #2e3542;color:#c8ccd4;padding:3px 6px;border-radius:3px;">' +
          ['user', 'admin', 'super_admin'].map(function(r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r + '</option>';
          }).join('') +
        '</select>' +
      '</td>' +
      '<td>' + new Date(u.created_at).toLocaleDateString() + '</td>' +
      '<td>' +
        (canDelete
          ? '<button class="action-btn delete" onclick="deleteUser(\'' + u.id + '\',\'' + escHtml(u.full_name || 'Unknown') + '\',\'' + escHtml(u.email) + '\')">Delete</button>'
          : '<span style="color:#2e3542;font-size:11px;">\u2014</span>') +
      '</td>' +
    '</tr>';
  }).join('');
}

async function approveRequest(requestId, email, fullName) {
  var btn = event.target;
  btn.disabled = true; btn.textContent = '\u2026';

  var sb = getClient();
  var profile = getProfile();
  var result = await sb.from('access_requests').update({
    status: 'approved',
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', requestId);

  if (result.error) {
    alert('Failed to approve: ' + result.error.message);
    btn.disabled = false; btn.textContent = 'Approve';
    return;
  }

  showInviteInstructions(email, fullName);
  await loadAccessRequests();
}

async function rejectRequest(requestId) {
  if (!confirm('Reject this request?')) return;
  var sb = getClient();
  var profile = getProfile();
  var result = await sb.from('access_requests').update({
    status: 'rejected',
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', requestId);

  if (result.error) { alert('Error: ' + result.error.message); return; }
  await loadAccessRequests();
}

async function changeRole(userId, newRole) {
  var sb = getClient();
  var result = await sb.from('profiles').update({ role: newRole }).eq('id', userId);
  if (result.error) { alert('Error updating role: ' + result.error.message); await loadUsers(); }
}

function showInviteInstructions(email, fullName) {
  var panel = document.getElementById('invite-panel');
  document.getElementById('invite-email').textContent = email;
  document.getElementById('invite-name').textContent = fullName;
  document.getElementById('invite-cmd').textContent =
    'python3 subscribers/cli.py invite-user --email "' + email + '" --name "' + fullName + '"';
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadSubmissions() {
  var sb = getClient();
  var showAll = document.getElementById('show-all-submissions') && document.getElementById('show-all-submissions').checked;
  var query = sb
    .from('user_submissions')
    .select('*, profiles(full_name, email)')
    .order('submitted_at', { ascending: false })
    .limit(100);
  if (!showAll) query = query.eq('status', 'pending');

  var result = await query;
  var tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;

  if (result.error) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:#f08080;padding:12px;">Error: ' + result.error.message + '</td></tr>';
    return;
  }
  if (!result.data || !result.data.length) {
    var emptyMsg = showAll ? 'No submissions found.' : 'No pending submissions.';
    tbody.innerHTML = '<tr><td colspan="8" style="color:#5a6270;padding:12px;font-style:italic;">' + emptyMsg + '</td></tr>';
    _updateSubmissionsBadge(0);
    return;
  }

  // Count pending for badge
  if (!showAll) {
    _updateSubmissionsBadge(result.data.length);
  } else {
    // Count pending separately — the 100-row limit may not include all pending rows
    sb.from('user_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(function(countResult) {
        _updateSubmissionsBadge(countResult.count || 0);
      });
  }

  tbody.innerHTML = result.data.map(function(s) {
    var name = s.profiles ? (s.profiles.full_name || s.profiles.email || 'Unknown') : 'Unknown';
    var titleCell = s.url
      ? '<a href="' + escHtml(s.url) + '" target="_blank" style="color:#60a5fa;">' + escHtml(s.title || s.url) + '</a>'
      : escHtml(s.title || s.storage_path || '\u2014');
    var date = s.submitted_at ? s.submitted_at.slice(0, 10) : '\u2014';
    var statusBadge = _submissionStatusBadge(s.status);

    var actions = '';
    if (s.status === 'pending') {
      var rawTitle = s.title || s.url || 'this submission';
      actions =
        '<button class="action-btn approve"' +
          ' data-id="' + escHtml(s.id) + '"' +
          ' data-uid="' + escHtml(s.submitted_by) + '"' +
          ' data-title="' + escHtml(rawTitle) + '"' +
          ' onclick="_subApprove(this)">Approve</button>' +
        '<button class="action-btn reject"' +
          ' data-id="' + escHtml(s.id) + '"' +
          ' data-uid="' + escHtml(s.submitted_by) + '"' +
          ' data-title="' + escHtml(rawTitle) + '"' +
          ' onclick="_subDeny(this)">Deny</button>';
    }

    return '<tr>' +
      '<td>' + statusBadge + '</td>' +
      '<td><span style="font-family:var(--mono,monospace);font-size:10px;background:#232b3a;padding:2px 5px;border-radius:3px;">' + escHtml(s.type) + '</span></td>' +
      '<td style="font-size:12px;color:#d64045;">' + escHtml(s.topic) + '</td>' +
      '<td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + titleCell + '</td>' +
      '<td style="font-size:12px;">' + escHtml(name) + '</td>' +
      '<td style="font-size:12px;color:#5a6270;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(s.context_note || '\u2014') + '</td>' +
      '<td style="font-size:12px;font-family:var(--mono,monospace);">' + date + '</td>' +
      '<td style="white-space:nowrap;">' + actions + '</td>' +
    '</tr>';
  }).join('');
}

function _updateSubmissionsBadge(count) {
  var badge = document.getElementById('submissions-pending-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count + ' pending';
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function _submissionStatusBadge(status) {
  var map = {
    pending:  { bg: '#2a1f08', color: '#F59E0B', label: 'PENDING' },
    approved: { bg: '#0e1a12', color: '#5eb88a', label: 'APPROVED' },
    rejected: { bg: '#1a0d0d', color: '#f08080', label: 'REJECTED' },
    imported: { bg: '#0e1325', color: '#60a5fa', label: 'IMPORTED' },
  };
  var s = map[status] || { bg: '#1a1f2a', color: '#7a8290', label: (status || 'UNKNOWN').toUpperCase() };
  return '<span style="font-family:var(--mono,monospace);font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 7px;border-radius:3px;background:' + s.bg + ';color:' + s.color + ';">' + s.label + '</span>';
}

/* ── Delete User ── */

var _deleteTargetId = null;

function deleteUser(userId, name, email) {
  _deleteTargetId = userId;
  document.getElementById('delete-modal-name').textContent = name;
  document.getElementById('delete-modal-email').textContent = email;
  document.getElementById('delete-modal-status').textContent = '';
  document.getElementById('delete-confirm-btn').disabled = false;
  // Reset to anonymize
  document.querySelector('input[name="delete-mode"][value="anonymize"]').checked = true;
  document.getElementById('delete-opt-anonymize').classList.add('selected');
  document.getElementById('delete-opt-hard').classList.remove('selected');
  document.getElementById('delete-modal-overlay').classList.add('visible');
}

function _closeDeleteModal() {
  document.getElementById('delete-modal-overlay').classList.remove('visible');
  _deleteTargetId = null;
}

function _onDeleteModeChange() {
  var selected = document.querySelector('input[name="delete-mode"]:checked').value;
  document.getElementById('delete-opt-anonymize').classList.toggle('selected', selected === 'anonymize');
  document.getElementById('delete-opt-hard').classList.toggle('selected', selected === 'hard');
}

async function _confirmDeleteUser() {
  if (!_deleteTargetId) return;
  var mode = document.querySelector('input[name="delete-mode"]:checked').value;
  var confirmBtn = document.getElementById('delete-confirm-btn');
  var statusEl = document.getElementById('delete-modal-status');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting\u2026';
  statusEl.textContent = '';

  try {
    var sb = getClient();
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { statusEl.textContent = 'Not authenticated.'; confirmBtn.disabled = false; confirmBtn.textContent = 'Delete User'; return; }

    var response = await fetch(window.SUPABASE_URL + '/functions/v1/admin-delete-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ userId: _deleteTargetId, mode: mode }),
    });

    var result = await response.json();
    if (!response.ok || result.error) {
      statusEl.textContent = 'Error: ' + (result.error || 'Deletion failed');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete User';
      return;
    }

    _closeDeleteModal();
    await loadUsers();
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete User';
  }
}

/* ── Deny Submission ── */

var _denySubId = null;
var _denySubUserId = null;

function denySubmission(submissionId, submittedById, urlOrTitle) {
  _denySubId = submissionId;
  _denySubUserId = submittedById;
  document.getElementById('deny-sub-title').textContent = urlOrTitle;
  document.getElementById('deny-sub-reason').value = '';
  document.getElementById('deny-sub-status').textContent = '';
  document.getElementById('deny-sub-confirm-btn').disabled = false;
  document.getElementById('deny-sub-confirm-btn').textContent = 'Deny & Notify';
  var overlay = document.getElementById('deny-sub-modal-overlay');
  overlay.style.display = 'flex';
}

function _closeDenySubModal() {
  document.getElementById('deny-sub-modal-overlay').style.display = 'none';
  _denySubId = null;
  _denySubUserId = null;
}

async function _confirmDenySub() {
  if (!_denySubId || !_denySubUserId) return;
  var reason = document.getElementById('deny-sub-reason').value.trim();
  var btn = document.getElementById('deny-sub-confirm-btn');
  var statusEl = document.getElementById('deny-sub-status');
  var title = document.getElementById('deny-sub-title').textContent;
  btn.disabled = true;
  btn.textContent = 'Denying\u2026';
  statusEl.textContent = '';

  var sb = getClient();
  var profile = getProfile();

  // 1. Update submission status
  var { error: updateErr } = await sb.from('user_submissions').update({
    status: 'rejected',
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
    admin_notes: reason || null,
  }).eq('id', _denySubId);

  if (updateErr) {
    statusEl.textContent = 'Error: ' + updateErr.message;
    btn.disabled = false;
    btn.textContent = 'Deny & Notify';
    return;
  }

  // 2. Send message to submitter
  var messageBody = 'Your submission \u201c' + title + '\u201d was reviewed and not approved.';
  if (reason) messageBody += '\n\nReason: ' + reason;
  var { error: msgErr } = await sb.from('messages').insert({
    conversation_id: crypto.randomUUID(),
    sender_id: profile.id,
    recipient_id: _denySubUserId,
    body: messageBody,
    article_url: null,
    article_title: null,
  });
  if (msgErr) console.warn('[deny] message send failed:', msgErr.message);

  // 3. Notify submitter
  await sb.from('notifications').insert({
    user_id: _denySubUserId,
    type: 'submission_rejected',
    title: 'Submission not approved: \u201c' + title + '\u201d',
    link: 'messages.html',
    reference_id: _denySubId,
    is_read: false,
  });

  _closeDenySubModal();
  await loadSubmissions();
}

/* ── Approve Submission ── */

async function approveSubmission(submissionId, submittedById, urlOrTitle) {
  if (!confirm('Approve this submission?\n\n"' + urlOrTitle + '"\n\nIt will be picked up and processed by the pipeline on the next run.py execution.')) return;

  var sb = getClient();
  var profile = getProfile();

  var { error: updateErr } = await sb.from('user_submissions').update({
    status: 'approved',
    reviewed_by: profile.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', submissionId);

  if (updateErr) { alert('Error approving: ' + updateErr.message); return; }

  // Notify submitter
  var { error: notifErr } = await sb.from('notifications').insert({
    user_id: submittedById,
    type: 'submission_approved',
    title: 'Your submission was approved: \u201c' + urlOrTitle + '\u201d',
    link: 'dashboard.html',
    reference_id: submissionId,
    is_read: false,
  });
  if (notifErr) console.warn('[approve] notification failed:', notifErr.message);

  await loadSubmissions();
}

function _subApprove(btn) {
  approveSubmission(btn.dataset.id, btn.dataset.uid, btn.dataset.title);
}

function _subDeny(btn) {
  denySubmission(btn.dataset.id, btn.dataset.uid, btn.dataset.title);
}

async function loadGuestStatus() {
  var sb = getClient();
  var result = await sb.from('profiles').select('id, is_active').eq('is_guest', true).single();
  var badge = document.getElementById('guest-status-badge');
  var btn   = document.getElementById('guest-toggle-btn');
  if (!badge || !btn) return;
  if (result.error || !result.data) {
    badge.textContent = 'No guest account found';
    badge.style.color = '#5a6270';
    btn.style.display = 'none';
    return;
  }
  var active = result.data.is_active !== false;
  badge.textContent = active ? 'Active' : 'Inactive';
  badge.style.color  = active ? '#4ade80' : '#f08080';
  btn.textContent    = active ? 'Disable' : 'Enable';
  btn.style.borderColor = active ? '#f08080' : '#4ade80';
  btn.style.color       = active ? '#f08080' : '#4ade80';
  btn.dataset.guestId   = result.data.id;
  btn.dataset.active    = active ? 'true' : 'false';
}

async function toggleGuestAccess() {
  var btn = document.getElementById('guest-toggle-btn');
  if (!btn) return;
  btn.disabled = true;
  var sb       = getClient();
  var guestId  = btn.dataset.guestId;
  var active   = btn.dataset.active === 'true';
  var result   = await sb.from('profiles').update({ is_active: !active }).eq('id', guestId);
  btn.disabled = false;
  if (result.error) {
    alert('Error: ' + result.error.message);
    return;
  }
  loadGuestStatus();
}
