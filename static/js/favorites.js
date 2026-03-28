/* favorites.js — Bookmarks, folders, and send-to-colleague (Step 3) */

// ── State ──────────────────────────────────────────────────────────────────
var _savedMap = {};       // { article_url: { id, folder_id } } for current user
var _folders = [];        // [{ id, name, parent_id }] — flat list, sorted
var _colleagues = null;   // cached profiles for send panel
var _folderPicker = null; // shared folder picker DOM element
var _sendPanel = null;    // shared send panel DOM element
var _pickerUrl = null;
var _pickerTitle = null;
var _pickerTopic = null;
var _sendUrl = null;
var _sendTitle = null;

// ── Init ───────────────────────────────────────────────────────────────────

async function initFavorites() {
  var profile = getProfile();
  if (!profile) return;
  var sb = getClient();

  var [foldersRes, savedRes] = await Promise.all([
    sb.from('article_folders').select('id,name,parent_id').eq('user_id', profile.id).order('name'),
    sb.from('saved_articles').select('id,article_url,folder_id').eq('user_id', profile.id),
  ]);

  _folders = foldersRes.data || [];
  _savedMap = {};
  (savedRes.data || []).forEach(function(r) {
    _savedMap[r.article_url] = { id: r.id, folder_id: r.folder_id };
  });

  _renderSidebarFolders();
  _updateAllBookmarkIcons();
}

// ── Sidebar folder tree ────────────────────────────────────────────────────

function _renderSidebarFolders() {
  var container = document.getElementById('rail-folders-tree');
  if (!container) return;

  var totalSaved = Object.keys(_savedMap).length;
  var html = '';

  html += '<a class="rail-sub-link" href="saved.html" style="display:flex;justify-content:space-between;align-items:center;">'
        + '<span>All Saved</span>'
        + (totalSaved ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">' + totalSaved + '</span>' : '')
        + '</a>';

  var topFolders = _folders.filter(function(f) { return !f.parent_id; });
  topFolders.forEach(function(folder) {
    var subfolders = _folders.filter(function(f) { return f.parent_id === folder.id; });
    var folderSaved = Object.values(_savedMap).filter(function(s) { return s.folder_id === folder.id; }).length;
    subfolders.forEach(function(sf) {
      folderSaved += Object.values(_savedMap).filter(function(s) { return s.folder_id === sf.id; }).length;
    });

    html += '<div class="rail-folder-item">';
    html += '<a class="rail-sub-link" href="saved.html?folder=' + escHtml(folder.id) + '" style="display:flex;justify-content:space-between;align-items:center;padding-right:4px;">'
          + '<span>\uD83D\uDCC1 ' + escHtml(folder.name) + '</span>'
          + (folderSaved ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">' + folderSaved + '</span>' : '')
          + '</a>';

    if (subfolders.length) {
      subfolders.forEach(function(sf) {
        var sfSaved = Object.values(_savedMap).filter(function(s) { return s.folder_id === sf.id; }).length;
        html += '<a class="rail-sub-link" href="saved.html?folder=' + escHtml(sf.id) + '" style="padding-left:24px;display:flex;justify-content:space-between;">'
              + '<span>\uD83D\uDCC1 ' + escHtml(sf.name) + '</span>'
              + (sfSaved ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">' + sfSaved + '</span>' : '')
              + '</a>';
      });
    }
    html += '</div>';
  });

  html += '<div style="padding:4px 14px;">'
        + '<button onclick="createTopLevelFolder()" style="background:none;border:none;cursor:pointer;'
        + 'font-family:var(--mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;padding:0;">'
        + '+ NEW FOLDER</button></div>';

  container.innerHTML = html;
}

async function createTopLevelFolder() {
  var name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  var profile = getProfile();
  var r = await getClient().from('article_folders').insert({ user_id: profile.id, name: name.trim() }).select().single();
  if (!r.error && r.data) {
    _folders.push(r.data);
    _folders.sort(function(a, b) { return a.name.localeCompare(b.name); });
    _renderSidebarFolders();
  }
}

// ── Bookmark icons ─────────────────────────────────────────────────────────

function _updateAllBookmarkIcons() {
  document.querySelectorAll('.fav-btn').forEach(function(btn) {
    var url = btn.dataset.url;
    _applyBookmarkState(btn, !!_savedMap[url]);
  });
}

function _applyBookmarkState(btnEl, saved) {
  var icon = btnEl.querySelector('i[data-lucide]');
  if (saved) {
    btnEl.classList.add('fav-saved');
    btnEl.title = 'Saved \u2014 click to manage';
    if (icon) { icon.setAttribute('data-lucide', 'bookmark-check'); lucide.createIcons({ nodes: [icon] }); }
  } else {
    btnEl.classList.remove('fav-saved');
    btnEl.title = 'Save article';
    if (icon) { icon.setAttribute('data-lucide', 'bookmark'); lucide.createIcons({ nodes: [icon] }); }
  }
}

// ── Folder picker ──────────────────────────────────────────────────────────

function openFolderPicker(url, title, topic, btnEl) {
  if (_savedMap[url] && _folders.length === 0) { _unsaveArticle(url, btnEl); return; }
  if (!_savedMap[url] && _folders.length === 0) { _saveArticle(url, title, topic, null, btnEl); return; }

  _pickerUrl = url;
  _pickerTitle = title;
  _pickerTopic = topic;

  var picker = _ensureFolderPicker();
  _buildPickerContent(picker, url);

  var rect = btnEl.getBoundingClientRect();
  picker.style.top = (window.scrollY + rect.bottom + 6) + 'px';
  picker.style.left = Math.max(8, rect.left - 160) + 'px';
  picker.style.display = 'block';
}

function closeFolderPicker() {
  if (_folderPicker) _folderPicker.style.display = 'none';
}

function _ensureFolderPicker() {
  if (_folderPicker) return _folderPicker;
  _folderPicker = document.createElement('div');
  _folderPicker.id = 'folder-picker';
  _folderPicker.style.cssText = 'display:none;position:absolute;z-index:300;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 0;min-width:220px;box-shadow:0 4px 24px rgba(0,0,0,0.5);';
  document.body.appendChild(_folderPicker);
  return _folderPicker;
}

function _buildPickerContent(picker, url) {
  var saved = !!_savedMap[url];
  var html = '<div style="padding:4px 14px 8px;font-family:var(--mono);font-size:10px;color:var(--text-muted);letter-spacing:1px;">SAVE TO FOLDER</div>';

  var unfiledActive = saved && !_savedMap[url].folder_id;
  html += '<div class="picker-option' + (unfiledActive ? ' picker-active' : '') + '" onclick="pickerSelectFolder(null)">\uD83D\uDCC4 Unfiled</div>';

  _folders.filter(function(f) { return !f.parent_id; }).forEach(function(folder) {
    var active = saved && _savedMap[url].folder_id === folder.id;
    html += '<div class="picker-option' + (active ? ' picker-active' : '') + '" onclick="pickerSelectFolder(\'' + escHtml(folder.id) + '\')">\uD83D\uDCC1 ' + escHtml(folder.name) + '</div>';
    _folders.filter(function(f) { return f.parent_id === folder.id; }).forEach(function(sf) {
      var sfActive = saved && _savedMap[url].folder_id === sf.id;
      html += '<div class="picker-option' + (sfActive ? ' picker-active' : '') + '" style="padding-left:28px;" onclick="pickerSelectFolder(\'' + escHtml(sf.id) + '\')">\uD83D\uDCC1 ' + escHtml(sf.name) + '</div>';
    });
  });

  html += '<div style="border-top:1px solid var(--border);margin:6px 0;"></div>';
  if (saved) html += '<div class="picker-option picker-danger" onclick="pickerRemove()">\u2715 Remove bookmark</div>';
  html += '<div class="picker-option" onclick="pickerNewFolder()">+ New folder\u2026</div>';
  picker.innerHTML = html;
}

async function pickerSelectFolder(folderId) {
  var url = _pickerUrl; var title = _pickerTitle; var topic = _pickerTopic;
  closeFolderPicker();
  var btnEl = document.querySelector('.fav-btn[data-url="' + CSS.escape(url) + '"]');
  if (_savedMap[url]) {
    var r = await getClient().from('saved_articles').update({ folder_id: folderId }).eq('id', _savedMap[url].id);
    if (!r.error) { _savedMap[url].folder_id = folderId; if (btnEl) _applyBookmarkState(btnEl, true); _renderSidebarFolders(); }
  } else {
    _saveArticle(url, title, topic, folderId, btnEl);
  }
}

async function pickerRemove() {
  var url = _pickerUrl; closeFolderPicker();
  var btnEl = document.querySelector('.fav-btn[data-url="' + CSS.escape(url) + '"]');
  _unsaveArticle(url, btnEl);
}

async function pickerNewFolder() {
  var name = prompt('New folder name:');
  if (!name || !name.trim()) return;
  var profile = getProfile();
  var r = await getClient().from('article_folders').insert({ user_id: profile.id, name: name.trim() }).select().single();
  if (!r.error && r.data) {
    _folders.push(r.data);
    _folders.sort(function(a, b) { return a.name.localeCompare(b.name); });
    _renderSidebarFolders();
    var btnEl = document.querySelector('.fav-btn[data-url="' + CSS.escape(_pickerUrl) + '"]');
    if (btnEl) openFolderPicker(_pickerUrl, _pickerTitle, _pickerTopic, btnEl);
  }
}

async function _saveArticle(url, title, topic, folderId, btnEl) {
  var profile = getProfile();
  var r = await getClient().from('saved_articles').insert({
    user_id: profile.id, folder_id: folderId || null,
    article_url: url, article_title: title, article_topic: topic,
  }).select().single();
  if (!r.error && r.data) {
    _savedMap[url] = { id: r.data.id, folder_id: folderId || null };
    if (btnEl) _applyBookmarkState(btnEl, true);
    _renderSidebarFolders();
  }
}

async function _unsaveArticle(url, btnEl) {
  if (!_savedMap[url]) return;
  var r = await getClient().from('saved_articles').delete().eq('id', _savedMap[url].id);
  if (!r.error) { delete _savedMap[url]; if (btnEl) _applyBookmarkState(btnEl, false); _renderSidebarFolders(); }
}

async function toggleBookmark(url, title, topic, btnEl) {
  openFolderPicker(url, title, topic, btnEl);
}

// ── Send panel ─────────────────────────────────────────────────────────────

function openSendPanel(url, title, btnEl) {
  _sendUrl = url; _sendTitle = title;
  var panel = _ensureSendPanel();
  document.getElementById('send-panel-title').textContent = title;
  document.getElementById('send-panel-msg').style.display = 'none';
  document.getElementById('send-panel-note').value = '';
  var rect = btnEl.getBoundingClientRect();
  panel.style.top = (window.scrollY + rect.bottom + 6) + 'px';
  panel.style.left = Math.max(8, rect.left - 200) + 'px';
  panel.style.display = 'block';
  _populateSendRecipients();
}

function closeSendPanel() {
  if (_sendPanel) _sendPanel.style.display = 'none';
  _sendUrl = null; _sendTitle = null;
}

function _ensureSendPanel() {
  if (_sendPanel) return _sendPanel;
  _sendPanel = document.createElement('div');
  _sendPanel.id = 'send-panel';
  _sendPanel.style.cssText = 'display:none;position:absolute;z-index:300;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:14px 16px;min-width:280px;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
  _sendPanel.innerHTML = [
    '<div style="font-family:var(--mono);font-size:11px;color:var(--text-secondary);letter-spacing:1px;margin-bottom:10px;">SEND TO COLLEAGUE</div>',
    '<div style="font-size:13px;color:var(--text-primary);margin-bottom:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" id="send-panel-title"></div>',
    '<select id="send-panel-recipient" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);padding:7px 10px;font-size:13px;margin-bottom:8px;"><option value="">Loading\u2026</option></select>',
    '<textarea id="send-panel-note" placeholder="Add a note (optional)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);padding:7px 10px;font-size:13px;resize:none;height:56px;box-sizing:border-box;margin-bottom:10px;"></textarea>',
    '<div style="display:flex;gap:8px;">',
    '<button onclick="sendArticle()" style="flex:1;background:var(--accent);color:#fff;border:none;border-radius:4px;padding:8px;font-family:var(--mono);font-size:12px;font-weight:600;cursor:pointer;letter-spacing:1px;">SEND</button>',
    '<button onclick="closeSendPanel()" style="background:none;border:1px solid var(--border);border-radius:4px;padding:8px 14px;color:var(--text-secondary);cursor:pointer;font-size:12px;">Cancel</button>',
    '</div>',
    '<div id="send-panel-msg" style="display:none;margin-top:8px;font-size:12px;font-family:var(--mono);"></div>',
  ].join('');
  document.body.appendChild(_sendPanel);
  return _sendPanel;
}

async function _populateSendRecipients() {
  if (!_colleagues) {
    var r = await getClient().from('profiles').select('id,email,full_name');
    _colleagues = r.error ? [] : (r.data || []);
  }
  var sel = document.getElementById('send-panel-recipient');
  if (!sel) return;
  var myId = getProfile().id;
  sel.innerHTML = '<option value="">Select colleague\u2026</option>';
  _colleagues.filter(function(c) { return c.id !== myId; }).forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.full_name || c.email;
    sel.appendChild(opt);
  });
}

async function sendArticle() {
  var toId = document.getElementById('send-panel-recipient').value;
  var note = (document.getElementById('send-panel-note').value || '').trim() || null;
  var msg = document.getElementById('send-panel-msg');
  if (!toId) { msg.textContent = 'Select a colleague first.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; return; }
  var profile = getProfile();
  var r = await getClient().from('article_tags').insert({
    from_user_id: profile.id, to_user_id: toId,
    article_url: _sendUrl, article_title: _sendTitle, note: note,
  });
  if (r.error) { msg.textContent = 'Failed \u2014 try again.'; msg.style.color = 'var(--red)'; msg.style.display = 'block'; }
  else {
    msg.textContent = 'Sent!'; msg.style.color = 'var(--green)'; msg.style.display = 'block';
    setTimeout(closeSendPanel, 800);
    var senderName = (profile.first_name || '') + ' ' + (profile.last_name || '');
    if (typeof createNotification === 'function') {
      createNotification(toId, 'article_tag', senderName.trim() + ' shared an article with you: ' + (_sendTitle || _sendUrl), 'dashboard.html');
    }
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

document.addEventListener('click', function(e) {
  if (_folderPicker && _folderPicker.style.display !== 'none' && !_folderPicker.contains(e.target) && !e.target.closest('.fav-btn')) closeFolderPicker();
  if (_sendPanel && _sendPanel.style.display !== 'none' && !_sendPanel.contains(e.target) && !e.target.closest('.send-btn')) closeSendPanel();
});
