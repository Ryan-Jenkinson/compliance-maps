/* tags.js — Tag CRUD, color, pills, sidebar, autocomplete, #parsing */

// ── State ──────────────────────────────────────────────────────────────────
var _tags = [];          // [{ id, name, parent_id, created_at }] for current user
var _tagArticleMap = {}; // { article_url: [tag_id, ...] }

// ── Init ───────────────────────────────────────────────────────────────────

async function initTags() {
  var profile = getProfile();
  if (!profile) return;
  var sb = getClient();

  var [tagsRes, taRes] = await Promise.all([
    sb.from('tags').select('id,name,parent_id,created_at').eq('user_id', profile.id).order('name'),
    sb.from('tag_articles').select('tag_id,article_url').eq('user_id', profile.id),
  ]);

  _tags = tagsRes.data || [];
  _tagArticleMap = {};
  (taRes.data || []).forEach(function(r) {
    if (!_tagArticleMap[r.article_url]) _tagArticleMap[r.article_url] = [];
    _tagArticleMap[r.article_url].push(r.tag_id);
  });

  _renderSidebarTags();
  _renderAllArticleTagPills();
}

// ── Color ──────────────────────────────────────────────────────────────────

function _tagHue(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 360) + 360) % 360;
}

function _tagColor(name) {
  return 'hsl(' + _tagHue(name) + ',60%,55%)';
}

function _tagBg(name) {
  return 'hsla(' + _tagHue(name) + ',60%,55%,0.15)';
}

function _tagBorder(name) {
  return 'hsla(' + _tagHue(name) + ',60%,55%,0.35)';
}

// ── Pill HTML ──────────────────────────────────────────────────────────────

function tagPillHtml(tag, opts) {
  // opts: { removable: bool, onclick: string }
  opts = opts || {};
  var hue = _tagHue(tag.name);
  var removeBtn = opts.removable
    ? '<span onclick="event.stopPropagation();removeTagFromArticle(\'' + tag.id + '\',event)" style="margin-left:4px;opacity:0.6;cursor:pointer;" title="Remove tag">&times;</span>'
    : '';
  var click = opts.onclick ? ' onclick="' + opts.onclick + '"' : ' onclick="navigateToTag(\'' + tag.id + '\')"';
  return '<span class="tag-pill"' + click
    + ' data-tag-id="' + tag.id + '"'
    + ' style="background:' + _tagBg(tag.name) + ';border:1px solid ' + _tagBorder(tag.name) + ';border-radius:12px;padding:2px 8px 2px 6px;font-family:var(--mono);font-size:10px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap;">'
    + '<span style="width:6px;height:6px;border-radius:50%;background:' + _tagColor(tag.name) + ';flex-shrink:0;"></span>'
    + _escTag(tag.name)
    + removeBtn
    + '</span>';
}

// ── CRUD ───────────────────────────────────────────────────────────────────

async function createTag(name, parentId) {
  name = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!name) return null;
  var profile = getProfile();
  var existing = _tags.find(function(t) { return t.name === name; });
  if (existing) return existing;
  var r = await getClient().from('tags').insert({
    user_id: profile.id, name: name, parent_id: parentId || null,
  }).select().single();
  if (r.error) return null;
  _tags.push(r.data);
  _tags.sort(function(a, b) { return a.name.localeCompare(b.name); });
  _renderSidebarTags();
  return r.data;
}

async function deleteTag(tagId) {
  var r = await getClient().from('tags').delete().eq('id', tagId);
  if (!r.error) {
    _tags = _tags.filter(function(t) { return t.id !== tagId && t.parent_id !== tagId; });
    Object.keys(_tagArticleMap).forEach(function(url) {
      _tagArticleMap[url] = _tagArticleMap[url].filter(function(id) { return id !== tagId; });
    });
    _renderSidebarTags();
    _renderAllArticleTagPills();
  }
}

// ── Article tagging ────────────────────────────────────────────────────────

async function addTagToArticle(url, tagId) {
  var profile = getProfile();
  var r = await getClient().from('tag_articles').insert({
    tag_id: tagId, user_id: profile.id, article_url: url,
  }).select().single();
  if (!r.error) {
    if (!_tagArticleMap[url]) _tagArticleMap[url] = [];
    if (_tagArticleMap[url].indexOf(tagId) === -1) _tagArticleMap[url].push(tagId);
    _renderArticleTagPills(url);
    _renderSidebarTags();
  }
}

async function removeTagFromArticle(tagId, event) {
  // Find which article this remove was triggered on
  var pill = event && event.target && event.target.closest('[data-article-url]');
  var url = pill ? pill.dataset.articleUrl : null;
  if (!url) return;
  var r = await getClient().from('tag_articles').delete()
    .eq('tag_id', tagId).eq('article_url', url).eq('user_id', getProfile().id);
  if (!r.error) {
    if (_tagArticleMap[url]) {
      _tagArticleMap[url] = _tagArticleMap[url].filter(function(id) { return id !== tagId; });
    }
    _renderArticleTagPills(url);
    _renderSidebarTags();
  }
}

function getTagsForArticle(url) {
  var ids = _tagArticleMap[url] || [];
  return _tags.filter(function(t) { return ids.indexOf(t.id) !== -1; });
}

// ── Pill rendering on article cards ───────────────────────────────────────

function _renderAllArticleTagPills() {
  document.querySelectorAll('[data-article-url]').forEach(function(el) {
    var url = el.dataset.articleUrl;
    if (url) _renderArticleTagPillsForEl(url, el);
  });
}

function _renderArticleTagPills(url) {
  document.querySelectorAll('[data-article-url="' + CSS.escape(url) + '"]').forEach(function(el) {
    _renderArticleTagPillsForEl(url, el);
  });
}

function _renderArticleTagPillsForEl(url, containerEl) {
  var tagsContainer = containerEl.querySelector('.article-tag-pills');
  if (!tagsContainer) return;
  var articleTags = getTagsForArticle(url);
  var html = articleTags.map(function(t) { return tagPillHtml(t, { removable: true }); }).join(' ');
  tagsContainer.innerHTML = html;
}

// ── Sidebar tags ───────────────────────────────────────────────────────────

function _renderSidebarTags() {
  var container = document.getElementById('rail-tags-tree');
  if (!container) return;

  if (!_tags.length) {
    container.innerHTML = '<div style="padding:4px 14px;font-size:11px;color:var(--text-muted);font-family:var(--mono);">No tags yet</div>';
    return;
  }

  var html = '';
  var topTags = _tags.filter(function(t) { return !t.parent_id; });

  topTags.forEach(function(tag) {
    var childTags = _tags.filter(function(t) { return t.parent_id === tag.id; });
    var count = Object.values(_tagArticleMap).filter(function(ids) { return ids.indexOf(tag.id) !== -1; }).length;
    childTags.forEach(function(ct) {
      count += Object.values(_tagArticleMap).filter(function(ids) { return ids.indexOf(ct.id) !== -1; }).length;
    });

    var hue = _tagHue(tag.name);
    html += '<div class="rail-tag-item">';
    html += '<a class="rail-sub-link" onclick="navigateToTag(\'' + tag.id + '\')" style="display:flex;align-items:center;justify-content:space-between;">'
          + '<span style="display:flex;align-items:center;gap:6px;">'
          + '<span style="width:7px;height:7px;border-radius:50%;background:hsl(' + hue + ',60%,55%);flex-shrink:0;"></span>'
          + _escTag(tag.name)
          + '</span>'
          + (count ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">' + count + '</span>' : '')
          + '</a>';

    if (childTags.length) {
      childTags.forEach(function(ct) {
        var cHue = _tagHue(ct.name);
        var cCount = Object.values(_tagArticleMap).filter(function(ids) { return ids.indexOf(ct.id) !== -1; }).length;
        html += '<a class="rail-sub-link" onclick="navigateToTag(\'' + ct.id + '\')" style="padding-left:36px;display:flex;align-items:center;justify-content:space-between;">'
              + '<span style="display:flex;align-items:center;gap:6px;">'
              + '<span style="width:6px;height:6px;border-radius:50%;background:hsl(' + cHue + ',60%,55%);flex-shrink:0;"></span>'
              + _escTag(ct.name)
              + '</span>'
              + (cCount ? '<span style="font-family:var(--mono);font-size:10px;color:var(--text-muted);">' + cCount + '</span>' : '')
              + '</a>';
      });
    }
    html += '</div>';
  });

  container.innerHTML = html;
}

function navigateToTag(tagId) {
  window.location.href = 'saved.html?tag=' + encodeURIComponent(tagId);
}

// ── Autocomplete ───────────────────────────────────────────────────────────

var _autocompleteEl = null;
var _autocompleteInput = null;
var _autocompleteArticleUrl = null;

function _ensureAutocomplete() {
  if (_autocompleteEl) return _autocompleteEl;
  _autocompleteEl = document.createElement('div');
  _autocompleteEl.id = 'tag-autocomplete';
  _autocompleteEl.style.cssText = 'display:none;position:absolute;z-index:400;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 0;min-width:180px;max-height:200px;overflow-y:auto;box-shadow:0 4px 24px rgba(0,0,0,0.5);';
  document.body.appendChild(_autocompleteEl);
  document.addEventListener('click', function(e) {
    if (_autocompleteEl && !_autocompleteEl.contains(e.target) && e.target !== _autocompleteInput) {
      _autocompleteEl.style.display = 'none';
    }
  });
  return _autocompleteEl;
}

function openTagInput(articleUrl, anchorEl) {
  _autocompleteArticleUrl = articleUrl;
  var ac = _ensureAutocomplete();
  _buildAutocompleteOptions(ac, '');
  var rect = anchorEl.getBoundingClientRect();
  ac.style.top = (window.scrollY + rect.bottom + 4) + 'px';
  ac.style.left = Math.max(8, rect.left) + 'px';
  ac.style.display = 'block';
}

function _buildAutocompleteOptions(ac, query) {
  var currentIds = _tagArticleMap[_autocompleteArticleUrl] || [];
  var matches = _tags.filter(function(t) {
    return (!query || t.name.indexOf(query.toLowerCase()) === 0) && currentIds.indexOf(t.id) === -1;
  });

  var html = '';
  matches.forEach(function(t) {
    html += '<div class="picker-option" onclick="tagAutocompleteSelect(\'' + t.id + '\')" style="display:flex;align-items:center;gap:8px;">'
          + '<span style="width:8px;height:8px;border-radius:50%;background:' + _tagColor(t.name) + ';flex-shrink:0;"></span>'
          + _escTag(t.name)
          + '</div>';
  });

  if (query && !_tags.find(function(t) { return t.name === query.toLowerCase(); })) {
    html += '<div class="picker-option" onclick="tagAutocompleteCreate(\'' + _escTag(query) + '\')" style="color:var(--text-muted);">'
          + '+ Create <strong style="color:var(--text-primary);">#' + _escTag(query) + '</strong>'
          + '</div>';
  }

  if (!html) {
    html = '<div style="padding:6px 14px;font-size:12px;color:var(--text-muted);font-family:var(--mono);">'
         + (query ? 'No matches' : 'Type to search tags')
         + '</div>';
  }

  // Add an input at the top for typing
  ac.innerHTML = '<div style="padding:6px 10px;border-bottom:1px solid var(--border);">'
    + '<input id="tag-ac-input" type="text" placeholder="#tagname" value="' + _escTag(query) + '"'
    + ' style="width:100%;background:transparent;border:none;outline:none;color:var(--text-primary);font-family:var(--mono);font-size:12px;"'
    + ' oninput="_tagAcInput(this.value)">'
    + '</div>' + html;

  _autocompleteInput = ac.querySelector('#tag-ac-input');
  if (_autocompleteInput) {
    _autocompleteInput.focus();
    _autocompleteInput.setSelectionRange(_autocompleteInput.value.length, _autocompleteInput.value.length);
  }
}

function _tagAcInput(val) {
  var query = val.replace(/^#/, '').trim();
  _buildAutocompleteOptions(_autocompleteEl, query);
}

async function tagAutocompleteSelect(tagId) {
  _autocompleteEl.style.display = 'none';
  await addTagToArticle(_autocompleteArticleUrl, tagId);
}

async function tagAutocompleteCreate(rawName) {
  _autocompleteEl.style.display = 'none';
  var tag = await createTag(rawName, null);
  if (tag) await addTagToArticle(_autocompleteArticleUrl, tag.id);
}

// ── Comment #tag linkification ─────────────────────────────────────────────

function linkifyTags(text) {
  // Replace #word with a clickable tag pill if the tag exists, otherwise plain #word
  return text.replace(/#([a-z0-9_-]+)/gi, function(match, name) {
    var tag = _tags.find(function(t) { return t.name === name.toLowerCase(); });
    if (tag) {
      return tagPillHtml(tag, {});
    }
    return '<span style="color:var(--text-muted);">' + match + '</span>';
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────

function _escTag(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
