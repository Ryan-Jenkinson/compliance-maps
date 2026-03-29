/* activity.js — Team activity feed in sidebar */

var _actClient = null;
var _actUserId = null;

async function initActivity(client, user) {
  _actClient = client;
  _actUserId = user.id;
  await _loadActivity();
}

async function _loadActivity() {
  var container = document.getElementById('activity-feed');
  if (!container) return;
  container.innerHTML = '<div style="padding:4px 14px;font-size:11px;color:var(--text-muted);font-family:var(--mono);">Loading…</div>';

  var since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Load recent comments from others
  var { data: comments } = await _actClient.from('comments')
    .select('id, author_id, target_title, target_url, created_at, profiles(full_name)')
    .neq('author_id', _actUserId)
    .neq('body', '[deleted]')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  // Load recent saves from others
  var { data: saves } = await _actClient.from('saved_articles')
    .select('id, user_id, article_url, created_at, profiles(full_name)')
    .neq('user_id', _actUserId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  // Merge and sort by created_at desc
  var events = [];
  (comments || []).forEach(function(c) {
    events.push({ type: 'comment', name: c.profiles ? (c.profiles.full_name || 'Someone') : 'Someone', title: c.target_title || c.target_url, url: c.target_url, at: c.created_at });
  });
  (saves || []).forEach(function(s) {
    events.push({ type: 'save', name: s.profiles ? (s.profiles.full_name || 'Someone') : 'Someone', title: s.article_url, url: s.article_url, at: s.created_at });
  });
  events.sort(function(a, b) { return new Date(b.at) - new Date(a.at); });
  events = events.slice(0, 15);

  if (!events.length) {
    container.innerHTML = '<div style="padding:4px 14px;font-size:11px;color:var(--text-muted);font-family:var(--mono);">No team activity in last 48h.</div>';
    return;
  }

  container.innerHTML = events.map(function(ev) {
    var icon = ev.type === 'comment' ? '💬' : '🔖';
    var verb = ev.type === 'comment' ? 'commented on' : 'saved';
    var shortTitle = ev.title ? (ev.title.length > 40 ? ev.title.slice(0, 40) + '…' : ev.title) : ev.url;
    var firstName = ev.name.split(' ')[0];
    return '<div style="padding:5px 14px;cursor:pointer;" onclick="window.open(\'' + _escAct(ev.url) + '\',\'_blank\')" title="' + _escAct(ev.title || ev.url) + '">' +
      '<div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">' +
      '<span style="margin-right:4px;">' + icon + '</span>' +
      '<strong style="color:var(--text-primary);">' + _escAct(firstName) + '</strong> ' + verb +
      '</div>' +
      '<div style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:18px;">' + _escAct(shortTitle) + '</div>' +
      '<div style="font-size:10px;color:var(--text-muted);padding-left:18px;">' + _agoAct(ev.at) + '</div>' +
      '</div>';
  }).join('');
}

function _agoAct(iso) {
  var m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function _escAct(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
