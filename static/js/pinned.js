/* pinned.js — Admin-pinned items shown at top of dashboard */

var _pnClient = null;
var _pnUser = null;
var _pnIsAdmin = false;
var _pnItems = [];

async function initPinned(client, user, profile) {
  _pnClient = client;
  _pnUser = user;
  _pnIsAdmin = profile && (profile.role === 'admin' || profile.role === 'super_admin');
  var { data } = await _pnClient.from('pinned_items').select('*').order('created_at', { ascending: false }).limit(10);
  _pnItems = data || [];
  _renderPinned();
}

function _renderPinned() {
  var container = document.getElementById('pinned-section');
  if (!container) return;
  if (!_pnItems.length && !_pnIsAdmin) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
  html += '<span style="font-family:var(--mono);font-size:11px;font-weight:600;color:#FBBF24;letter-spacing:1px;">&#128204; PINNED</span>';
  if (_pnIsAdmin) {
    html += '<button onclick="openPinModal()" style="background:none;border:1px solid var(--border);border-radius:5px;padding:2px 8px;font-size:11px;font-family:var(--mono);color:var(--text-muted);cursor:pointer;margin-left:auto;">+ Pin item</button>';
  }
  html += '</div>';
  if (_pnItems.length === 0) {
    html += '<div style="font-size:12px;color:var(--text-muted);font-family:var(--mono);">No pinned items. Pin an article to surface it here.</div>';
  } else {
    html += _pnItems.map(function(item) {
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.2);border-radius:8px;margin-bottom:6px;">' +
        '<span style="font-size:16px;margin-top:1px;">&#128204;</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<a href="' + _escPn(item.item_url) + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:var(--text-primary);text-decoration:none;">' + _escPn(item.item_title || item.item_url) + '</a>' +
        (item.note ? '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px;">' + _escPn(item.note) + '</div>' : '') +
        '</div>' +
        (_pnIsAdmin ? '<button onclick="unpinItem(' + item.id + ')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:0 4px;flex-shrink:0;" title="Unpin">&#215;</button>' : '') +
        '</div>';
    }).join('');
  }
  container.innerHTML = html;
}

async function unpinItem(id) {
  if (!_pnIsAdmin || !confirm('Unpin this item?')) return;
  await _pnClient.from('pinned_items').delete().eq('id', id);
  _pnItems = _pnItems.filter(function(i) { return i.id !== id; });
  _renderPinned();
}

function openPinModal() {
  var url = prompt('URL to pin:');
  if (!url) return;
  var title = prompt('Title (leave blank to use URL):') || url;
  var note = prompt('Optional note (leave blank to skip):') || null;
  _pnClient.from('pinned_items').insert({ item_url: url.trim(), item_title: title.trim(), item_type: 'article', pinned_by: _pnUser.id, note: note }).then(function(res) {
    if (res.error) { alert('Failed to pin: ' + res.error.message); return; }
    initPinned(_pnClient, _pnUser, { role: _pnIsAdmin ? 'admin' : 'user' });
  });
}

function _escPn(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
