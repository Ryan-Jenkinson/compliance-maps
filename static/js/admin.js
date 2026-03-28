/* admin.js — Admin panel runtime logic.
 * auth.js must be loaded first. checkAuth() must complete before these are called.
 */

async function loadAccessRequests() {
  var sb = getClient();
  var result = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  var tbody = document.getElementById('requests-tbody');
  if (result.error) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#f08080;padding:12px;">Error: ' + result.error.message + '</td></tr>';
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
  var result = await sb.from('profiles').select('*').order('created_at', { ascending: false });

  var tbody = document.getElementById('users-tbody');
  if (result.error) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#f08080;padding:12px;">Error: ' + result.error.message + '</td></tr>';
    return;
  }
  if (!result.data || result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#5a6270;padding:12px;">No users yet.</td></tr>';
    return;
  }

  var profile = getProfile();
  tbody.innerHTML = result.data.map(function(u) {
    var isSelf = profile && u.id === profile.id;
    var isSuperAdmin = u.role === 'super_admin';
    var canEdit = !isSelf && !isSuperAdmin && profile && profile.role === 'super_admin';
    return '<tr>' +
      '<td>' + escHtml(u.full_name || '\u2014') + '</td>' +
      '<td>' + escHtml(u.email) + '</td>' +
      '<td>' +
        '<select ' + (canEdit ? 'onchange="changeRole(\'' + u.id + '\', this.value)"' : 'disabled') +
        ' style="background:#1a1f2a;border:1px solid #2e3542;color:#c8ccd4;padding:3px 6px;border-radius:3px;">' +
          ['user', 'admin', 'super_admin'].map(function(r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r + '</option>';
          }).join('') +
        '</select>' +
      '</td>' +
      '<td>' + new Date(u.created_at).toLocaleDateString() + '</td>' +
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
  var result = await sb
    .from('user_submissions')
    .select('*, profiles(first_name, last_name)')
    .order('submitted_at', { ascending: false })
    .limit(50);
  var tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;
  if (result.error || !result.data || !result.data.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:#5a6270;padding:12px;">No submissions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = result.data.map(function(s) {
    var name = s.profiles ? ((s.profiles.first_name || '') + ' ' + (s.profiles.last_name || '')).trim() : 'Unknown';
    var titleCell = s.url
      ? '<a href="' + escHtml(s.url) + '" target="_blank" style="color:#d64045;">' + escHtml(s.title || s.url) + '</a>'
      : escHtml(s.title || s.storage_path || '—');
    var date = s.submitted_at ? s.submitted_at.slice(0, 10) : '—';
    return '<tr>' +
      '<td><span style="font-family:var(--mono,monospace);font-size:10px;background:#232b3a;padding:2px 5px;border-radius:3px;">' + escHtml(s.type) + '</span></td>' +
      '<td style="font-size:12px;color:#d64045;">' + escHtml(s.topic) + '</td>' +
      '<td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + titleCell + '</td>' +
      '<td style="font-size:12px;">' + escHtml(name) + '</td>' +
      '<td style="font-size:12px;color:#5a6270;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(s.context_note || '—') + '</td>' +
      '<td style="font-size:12px;font-family:var(--mono,monospace);">' + date + '</td>' +
      '</tr>';
  }).join('');
}
