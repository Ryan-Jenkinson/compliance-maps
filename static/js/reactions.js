/* reactions.js — Per-emoji article reactions, picker, and activity indicators */

var _rxClient = null;
var _rxUserId = null;
// _rxMap[url][emoji] = { count: N, reacted: bool }
var _rxMap = {};

var _EMOJI_CATEGORIES = {
  'Urgent / Alert': ['🚨','⚠️','❗','🔴','😱'],
  'News Reactions': ['😤','😰','🤯','😮','🙄'],
  'Standard': ['👍','❤️','🔥','💡','✅','👀','🤔'],
};

async function initReactions(client, user) {
  _rxClient = client;
  _rxUserId = user.id;
  var urls = Array.from(document.querySelectorAll('[data-article-url]'))
    .map(function(el) { try { return JSON.parse(el.dataset.articleUrl); } catch(e) { return null; } })
    .filter(Boolean);
  if (!urls.length) return;
  var { data } = await _rxClient.from('article_reactions')
    .select('article_url, user_id, emoji').in('article_url', urls).limit(5000);
  if (!data) return;
  data.forEach(function(row) {
    if (!_rxMap[row.article_url]) _rxMap[row.article_url] = {};
    var emoji = row.emoji || '👍';
    if (!_rxMap[row.article_url][emoji]) _rxMap[row.article_url][emoji] = { count: 0, reacted: false };
    _rxMap[row.article_url][emoji].count++;
    if (row.user_id === _rxUserId) _rxMap[row.article_url][emoji].reacted = true;
  });
  urls.forEach(function(url) { _renderActivityRow(url); });
}

async function toggleEmojiReaction(url, emoji, anchorEl) {
  if (!_rxClient || !_rxUserId) return;
  if (!_rxMap[url]) _rxMap[url] = {};
  var state = _rxMap[url][emoji] || { count: 0, reacted: false };
  if (state.reacted) {
    await _rxClient.from('article_reactions').delete()
      .eq('user_id', _rxUserId).eq('article_url', url).eq('emoji', emoji);
    _rxMap[url][emoji] = { count: Math.max(0, state.count - 1), reacted: false };
  } else {
    await _rxClient.from('article_reactions').insert({ user_id: _rxUserId, article_url: url, emoji: emoji });
    _rxMap[url][emoji] = { count: state.count + 1, reacted: true };
  }
  _closeEmojiPicker();
  _renderActivityRow(url);
}

// ── Activity row renderer ───────────────────────────────────────────────────

function _renderActivityRow(url) {
  document.querySelectorAll('.article-item[data-article-url], .la-item[data-article-url]').forEach(function(item) {
    var itemUrl;
    try { itemUrl = JSON.parse(item.dataset.articleUrl); } catch(e) { return; }
    if (itemUrl !== url) return;

    var row = item.querySelector('.article-activity-row');
    if (!row) return;

    var reactions = _rxMap[url] || {};
    // _cCommentCounts is exposed by comments.js
    var commentCount = (typeof _cCommentCounts !== 'undefined' && _cCommentCounts[url]) || 0;
    var activeEmojis = Object.keys(reactions).filter(function(e) { return reactions[e].count > 0; });
    var hasActivity = commentCount > 0 || activeEmojis.length > 0;

    if (!hasActivity) {
      row.style.display = 'none';
      item.style.removeProperty('border-left');
      var preview = item.querySelector('.art-emoji-preview');
      if (preview) preview.style.display = 'none';
      return;
    }

    // Blue left border
    item.style.borderLeft = '3px solid var(--blue, #1565c0)';
    row.style.display = 'flex';

    // Emoji preview (top-right, up to 2 + overflow)
    var preview = item.querySelector('.art-emoji-preview');
    if (preview && activeEmojis.length) {
      var top2 = activeEmojis.slice(0, 2);
      var overflow = activeEmojis.length > 2 ? activeEmojis.length - 2 : 0;
      preview.style.display = 'flex';
      preview.innerHTML = top2.map(function(e) {
        return '<span style="font-size:13px;line-height:1;">' + e + '</span>';
      }).join('')
      + (overflow ? '<span style="background:var(--blue-bg,#ebf3fd);color:var(--blue,#1565c0);font-size:10px;font-weight:700;border-radius:8px;padding:1px 5px;margin-left:1px;">+' + overflow + '</span>' : '');
    } else if (preview) {
      preview.style.display = 'none';
    }

    // Comment count in activity row
    var commentStat = row.querySelector('.art-comment-stat');
    if (commentStat) {
      if (commentCount > 0) {
        commentStat.textContent = '\uD83D\uDCAC\u00a0' + commentCount;
        commentStat.style.display = 'inline';
      } else {
        commentStat.style.display = 'none';
      }
    }

    // Reaction counts
    var reactionStats = row.querySelector('.art-reaction-stats');
    if (reactionStats) {
      reactionStats.innerHTML = activeEmojis.map(function(emoji) {
        var s = reactions[emoji];
        return '<span class="art-rx-count" data-emoji="' + _escRx(emoji) + '" data-url="' + _escRx(url) + '" style="font-size:12px;color:var(--text-muted);padding:2px 5px;border-radius:4px;cursor:pointer;' + (s.reacted ? 'background:var(--blue-bg,#ebf3fd);color:var(--blue,#1565c0);' : '') + '">' + emoji + '\u00a0' + s.count + '</span>';
      }).join('');
      reactionStats.querySelectorAll('.art-rx-count').forEach(function(span) {
        span.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleEmojiReaction(span.dataset.url, span.dataset.emoji, span);
        });
      });
    }
  });
}

// ── Emoji picker ────────────────────────────────────────────────────────────

var _emojiPicker = null;
var _emojiPickerUrl = null;

function openEmojiPickerFromBtn(btn) {
  var url = btn.dataset.url;
  _openEmojiPicker(url, btn);
}

function _openEmojiPicker(url, anchorEl) {
  _emojiPickerUrl = url;
  var picker = _ensureEmojiPicker();
  _buildEmojiPickerContent(picker, url);
  picker.style.display = 'block';
  // Position: try above anchor, fall back to below
  var rect = anchorEl.getBoundingClientRect();
  picker.style.left = Math.max(8, rect.right - 224) + 'px';
  picker.style.top = '-9999px'; // measure first
  var ph = picker.offsetHeight;
  var top = rect.top - ph - 6;
  if (top < 8) top = rect.bottom + 6;
  picker.style.top = top + 'px';
}

function _closeEmojiPicker() {
  if (_emojiPicker) _emojiPicker.style.display = 'none';
}

function _ensureEmojiPicker() {
  if (_emojiPicker) return _emojiPicker;
  _emojiPicker = document.createElement('div');
  _emojiPicker.id = 'emoji-picker-panel';
  _emojiPicker.style.cssText = 'display:none;position:fixed;z-index:9002;background:var(--surface,#fff);border:1px solid var(--border,#d8dbe0);border-radius:10px;padding:12px;min-width:224px;box-shadow:0 8px 24px rgba(0,0,0,0.15);';
  document.body.appendChild(_emojiPicker);
  document.addEventListener('click', function(e) {
    if (_emojiPicker && _emojiPicker.style.display !== 'none'
        && !_emojiPicker.contains(e.target)
        && !e.target.closest('.art-react-trigger')) {
      _closeEmojiPicker();
    }
  });
  return _emojiPicker;
}

function _buildEmojiPickerContent(picker, url) {
  var state = _rxMap[url] || {};
  var html = '';
  Object.keys(_EMOJI_CATEGORIES).forEach(function(cat) {
    html += '<div style="font-size:10px;color:var(--text-muted,#7a8194);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;font-family:var(--mono);">' + cat + '</div>';
    html += '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:10px;">';
    _EMOJI_CATEGORIES[cat].forEach(function(emoji) {
      var reacted = state[emoji] && state[emoji].reacted;
      html += '<span class="ep-emoji" data-emoji="' + _escRx(emoji) + '" style="font-size:20px;cursor:pointer;padding:4px;border-radius:5px;transition:background 0.1s;'
           + (reacted ? 'background:var(--blue-bg,#ebf3fd);outline:1px solid var(--blue,#1565c0);' : '')
           + '">' + emoji + '</span>';
    });
    html += '</div>';
  });
  picker.innerHTML = html;
  picker.querySelectorAll('.ep-emoji').forEach(function(span) {
    span.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleEmojiReaction(_emojiPickerUrl, span.dataset.emoji, span);
    });
    span.addEventListener('mouseover', function() { if (!span.style.outline) span.style.background = 'var(--surface-sunken,#ebedf0)'; });
    span.addEventListener('mouseout', function() { if (!span.style.outline) span.style.background = ''; });
  });
}

function _escRx(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
