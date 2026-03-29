/* comments.js — Comment threads on articles, deadlines, and bills */

let _cClient = null;
let _cUser = null;
var _cCommentCounts = {}; // exposed for _renderActivityRow in reactions.js

function initComments(supabaseClient, user) {
  _cClient = supabaseClient;
  _cUser = user;
  _loadAllCommentCounts();
  document.addEventListener('click', _commentClickHandler, true);
}

async function _loadAllCommentCounts() {
  if (!_cClient) return;
  const { data, error } = await _cClient.from('comments').select('target_url').neq('is_deleted', true).limit(2000);
  if (error || !data) return;
  const counts = {};
  for (const row of data) counts[row.target_url] = (counts[row.target_url] || 0) + 1;
  _cCommentCounts = counts;
  // Update count inside action buttons (hover area)
  document.querySelectorAll('.comment-btn').forEach(btn => {
    const n = counts[btn.dataset.url] || 0;
    const badge = btn.querySelector('.ct-count');
    if (badge) { badge.textContent = n || ''; badge.style.display = n ? 'inline' : 'none'; }
  });
  // Update always-visible meta pills
  document.querySelectorAll('.ct-meta-pill[data-ct-url]').forEach(pill => {
    const n = counts[pill.dataset.ctUrl] || 0;
    if (n > 0) {
      pill.textContent = '💬\u00a0' + n;
      pill.style.display = 'inline';
    }
  });
  // Refresh activity rows now that comment counts are loaded
  if (typeof _renderActivityRow === 'function') {
    Object.keys(counts).forEach(function(url) { _renderActivityRow(url); });
  }
}

function _bumpCount(url) {
  _cCommentCounts[url] = (_cCommentCounts[url] || 0) + 1;
  if (typeof _renderActivityRow === 'function') _renderActivityRow(url);
  document.querySelectorAll('.comment-btn').forEach(btn => {
    if (btn.dataset.url !== url) return;
    const badge = btn.querySelector('.ct-count');
    if (!badge) return;
    const n = (parseInt(badge.textContent || '0', 10) || 0) + 1;
    badge.textContent = n; badge.style.display = 'inline';
  });
  document.querySelectorAll('.ct-meta-pill[data-ct-url]').forEach(pill => {
    if (pill.dataset.ctUrl !== url) return;
    const n = (parseInt(pill.textContent.replace(/\D/g, '') || '0', 10) || 0) + 1;
    pill.textContent = '💬\u00a0' + n;
    pill.style.display = 'inline';
  });
}

async function toggleCommentThread(btn) {
  const card = btn.closest('.article-item, .la-item, .article-item-tp, .doc-item');
  if (!card) return;
  const thread = card.querySelector('.comment-thread');
  if (!thread) return;
  const open = thread.style.display !== 'none';
  if (open) { thread.style.display = 'none'; btn.classList.remove('ct-active'); return; }
  thread.style.display = 'block';
  btn.classList.add('ct-active');
  const list = thread.querySelector('.ct-list');
  if (list.dataset.loaded) return;
  list.innerHTML = '<div class="ct-msg">Loading…</div>';
  await _renderThread(btn.dataset.url, btn.dataset.title, btn.dataset.type || 'article', thread);
}

function _isAdmin() {
  return typeof _profile !== 'undefined' && _profile && (_profile.role === 'admin' || _profile.role === 'super_admin');
}

async function _renderThread(url, title, type, threadEl) {
  const list = threadEl.querySelector('.ct-list');
  const { data: comments, error } = await _cClient
    .from('comments')
    .select('id, body, created_at, edited_at, author_id, parent_id, is_flagged, profiles(full_name)')
    .eq('target_url', url)
    .neq('is_deleted', true)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) { list.innerHTML = '<div class="ct-msg ct-error">Failed to load.</div>'; return; }
  const topLevel = comments.filter(c => !c.parent_id);
  const replyMap = {};
  for (const c of comments) if (c.parent_id) (replyMap[c.parent_id] = replyMap[c.parent_id] || []).push(c);
  list.innerHTML = topLevel.length
    ? topLevel.map(c => _commentHtml(c, replyMap[c.id] || [])).join('')
    : '<div class="ct-msg">No comments yet.</div>';
  list.dataset.loaded = '1';
  list.dataset.url = url;
  list.dataset.title = title;
  list.dataset.type = type;
}

function _commentHtml(c, replies) {
  const isOwn = _cUser && c.author_id === _cUser.id;
  const isAdmin = _isAdmin();
  const body = `<span>${typeof linkifyTags === 'function' ? linkifyTags(_esc(c.body)) : _esc(c.body)}</span>`;
  const edited = c.edited_at ? ' <em class="ct-edited">(edited)</em>' : '';
  const flagBadge = isAdmin && c.is_flagged ? ' <span class="ct-flag-badge" title="Flagged for review">&#9873; Flagged</span>' : '';
  const editBtn = isOwn ? `<button class="ct-act ct-edit-btn" data-id="${c.id}">Edit</button>` : '';
  const delBtn = isAdmin ? `<button class="ct-act ct-del-btn" data-id="${c.id}">Delete</button>` : '';
  const reportBtn = !isOwn && !isAdmin && !c.is_flagged ? `<button class="ct-act ct-report-btn" data-id="${c.id}">Report</button>` : '';
  const replyBtn = `<button class="ct-act ct-reply-btn" data-parent="${c.id}">Reply</button>`;
  const repliesHtml = replies.map(r => {
    const rOwn = _cUser && r.author_id === _cUser.id;
    const rBody = `<span>${typeof linkifyTags === 'function' ? linkifyTags(_esc(r.body)) : _esc(r.body)}</span>`;
    const rFlagBadge = isAdmin && r.is_flagged ? ' <span class="ct-flag-badge" title="Flagged for review">&#9873; Flagged</span>' : '';
    const rEditBtn = rOwn ? `<button class="ct-act ct-edit-btn" data-id="${r.id}">Edit</button>` : '';
    const rDelBtn = isAdmin ? `<button class="ct-act ct-del-btn" data-id="${r.id}">Delete</button>` : '';
    const rReportBtn = !rOwn && !isAdmin && !r.is_flagged ? `<button class="ct-act ct-report-btn" data-id="${r.id}">Report</button>` : '';
    return `<div class="ct-reply" data-id="${r.id}">
      <div class="ct-meta"><span class="ct-author">${_esc(_authorName(r.profiles))}</span><span class="ct-time">${_ago(r.created_at)}</span>${rFlagBadge}${rEditBtn}${rDelBtn}${rReportBtn}</div>
      <div class="ct-body" id="ctb-${r.id}">${rBody}</div></div>`;
  }).join('');
  return `<div class="ct-comment" data-id="${c.id}">
    <div class="ct-meta"><span class="ct-author">${_esc(_authorName(c.profiles))}</span><span class="ct-time">${_ago(c.created_at)}</span>${edited}${flagBadge}${editBtn}${delBtn}${reportBtn}${replyBtn}</div>
    <div class="ct-body" id="ctb-${c.id}">${body}</div>
    ${repliesHtml}
    <div class="ct-replybox" id="crb-${c.id}" style="display:none">
      <div style="position:relative;">
        <textarea class="ct-input" placeholder="Reply\u2026" rows="2" style="padding-right:42px;width:100%;box-sizing:border-box;"></textarea>
        <button class="ct-post ct-reply-post" data-parent="${c.id}" title="Post reply" style="position:absolute;right:7px;bottom:7px;background:var(--blue,#1565c0);color:#fff;border:none;border-radius:5px;width:28px;height:26px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;">&#8593;</button>
      </div>
    </div></div>`;
}

async function _submitTopLevel(threadEl) {
  const input = threadEl.querySelector('.ct-compose .ct-input');
  const body = input.value.trim();
  if (!body || !_cClient || !_cUser) return;
  const list = threadEl.querySelector('.ct-list');
  const btn = threadEl.querySelector('.ct-compose .ct-post');
  btn.disabled = true;
  const { error } = await _cClient.from('comments').insert({
    author_id: _cUser.id, target_type: list.dataset.type || 'article',
    target_url: list.dataset.url, target_title: list.dataset.title, parent_id: null, body,
  });
  btn.disabled = false;
  if (error) { console.error('Comment error:', error); return; }
  _checkMentionInvites(body, list.dataset.title, list.dataset.url);
  _notifyMentionedUsers(body, list.dataset.title, list.dataset.url);
  input.value = '';
  list.dataset.loaded = '';
  await _renderThread(list.dataset.url, list.dataset.title, list.dataset.type || 'article', threadEl);
  _bumpCount(list.dataset.url);
}

async function _submitReply(parentId, replyBtn) {
  const box = document.getElementById(`crb-${parentId}`);
  const input = box.querySelector('.ct-input');
  const body = input.value.trim();
  if (!body || !_cClient || !_cUser) return;
  const threadEl = replyBtn.closest('.comment-thread');
  const list = threadEl.querySelector('.ct-list');
  replyBtn.disabled = true;
  const { error } = await _cClient.from('comments').insert({
    author_id: _cUser.id, target_type: list.dataset.type || 'article',
    target_url: list.dataset.url, target_title: list.dataset.title, parent_id: parentId, body,
  });
  replyBtn.disabled = false;
  if (error) { console.error('Reply error:', error); return; }
  _checkMentionInvites(body, list.dataset.title, list.dataset.url);
  _notifyMentionedUsers(body, list.dataset.title, list.dataset.url);
  // Notify parent comment author if it's not the same person
  const { data: parent } = await _cClient.from('comments').select('author_id').eq('id', parentId).single();
  if (parent && parent.author_id && parent.author_id !== _cUser.id && typeof createNotification === 'function') {
    const replierName = _cUser.user_metadata?.full_name || '';
    createNotification(parent.author_id, 'comment_reply',
      (replierName.trim() || 'Someone') + ' replied to your comment on: ' + (list.dataset.title || list.dataset.url),
      list.dataset.url);
  }
  list.dataset.loaded = '';
  await _renderThread(list.dataset.url, list.dataset.title, list.dataset.type || 'article', threadEl);
  _bumpCount(list.dataset.url);
}

function _showReplyBox(parentId) {
  const box = document.getElementById(`crb-${parentId}`);
  if (!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : 'block';
  if (!open) box.querySelector('.ct-input').focus();
}

function _editComment(id) {
  const bodyEl = document.getElementById(`ctb-${id}`);
  if (!bodyEl) return;
  const current = bodyEl.querySelector('span')?.textContent || bodyEl.textContent;
  bodyEl.innerHTML = `<textarea class="ct-input ct-edit-input" rows="2">${_esc(current)}</textarea><button class="ct-post ct-save-btn" data-id="${id}">Save</button><button class="ct-act ct-cancel-btn" data-id="${id}" data-orig="${_attr(current)}">Cancel</button>`;
  bodyEl.querySelector('textarea').focus();
}

async function _saveEdit(id) {
  const bodyEl = document.getElementById(`ctb-${id}`);
  const newBody = bodyEl.querySelector('.ct-edit-input').value.trim();
  if (!newBody) return;
  const { error } = await _cClient.from('comments').update({ body: newBody, edited_at: new Date().toISOString() }).eq('id', id);
  if (!error) {
    const _rendered = typeof linkifyTags === 'function' ? linkifyTags(_esc(newBody)) : _esc(newBody);
    bodyEl.innerHTML = `<span>${_rendered}</span>`;
  }
}

function _cancelEdit(id, orig) {
  const bodyEl = document.getElementById(`ctb-${id}`);
  if (bodyEl) bodyEl.innerHTML = `<span>${_esc(orig)}</span>`;
}

async function _deleteComment(id) {
  if (!_isAdmin()) return;
  if (!confirm('Delete this comment? It will be hidden from all users.')) return;
  const { error } = await _cClient.from('comments').update({ is_deleted: true }).eq('id', id);
  if (!error) {
    const row = document.querySelector(`.ct-comment[data-id="${id}"], .ct-reply[data-id="${id}"]`);
    if (row) row.remove();
  }
}

async function _reportComment(id) {
  if (!_cClient || !_cUser) return;
  const { error } = await _cClient.from('comments').update({ is_flagged: true }).eq('id', id);
  if (!error) {
    const btn = document.querySelector(`.ct-report-btn[data-id="${id}"]`);
    if (btn) { btn.textContent = 'Reported'; btn.disabled = true; }
  }
}

document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t.classList.contains('ct-input')) return;
  // Enter (no Shift) submits; Shift+Enter is newline
  const isSubmit = (e.key === 'Enter' && !e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'Enter');
  if (!isSubmit) return;
  // Don't intercept Enter on edit inputs (they may be single-line inline editors)
  if (t.classList.contains('ct-edit-input')) {
    if (!((e.ctrlKey || e.metaKey) && e.key === 'Enter')) return;
  }
  e.preventDefault();
  const thread = t.closest('.comment-thread');
  if (t.closest('.ct-compose')) { _submitTopLevel(thread); return; }
  const replyPost = t.closest('.ct-replybox')?.querySelector('.ct-reply-post');
  if (replyPost) { _submitReply(replyPost.dataset.parent, replyPost); return; }
  const saveBtn = t.closest('[id^="ctb-"]')?.querySelector('.ct-save-btn');
  if (saveBtn) { _saveEdit(saveBtn.dataset.id); }
}, true);

function _commentClickHandler(e) {
  const t = e.target;
  if (t.closest('.comment-btn')) { e.stopPropagation(); toggleCommentThread(t.closest('.comment-btn')); return; }
  if (t.closest('.comment-thread')) e.stopPropagation();
  if (t.closest('.ct-compose .ct-post')) { _submitTopLevel(t.closest('.comment-thread')); return; }
  if (t.closest('.ct-reply-post')) { const b = t.closest('.ct-reply-post'); _submitReply(b.dataset.parent, b); return; }
  if (t.closest('.ct-reply-btn')) { _showReplyBox(t.closest('.ct-reply-btn').dataset.parent); return; }
  if (t.closest('.ct-edit-btn')) { _editComment(t.closest('.ct-edit-btn').dataset.id); return; }
  if (t.closest('.ct-save-btn')) { _saveEdit(t.closest('.ct-save-btn').dataset.id); return; }
  if (t.closest('.ct-cancel-btn')) { const b = t.closest('.ct-cancel-btn'); _cancelEdit(b.dataset.id, b.dataset.orig); return; }
  if (t.closest('.ct-del-btn')) { _deleteComment(t.closest('.ct-del-btn').dataset.id); return; }
  if (t.closest('.ct-report-btn')) { _reportComment(t.closest('.ct-report-btn').dataset.id); return; }
}

// ── @ mention → notify registered users ───────────────────────────────────
async function _notifyMentionedUsers(body, targetTitle, targetUrl) {
  if (!_cClient || !_cUser || typeof createNotification !== 'function') return;
  const { data: profiles } = await _cClient.from('profiles').select('id, full_name, email');
  if (!profiles) return;
  const me = profiles.find(p => p.id === _cUser.id);
  const senderName = (me?.full_name || 'Someone').trim();
  for (const profile of profiles) {
    if (profile.id === _cUser.id) continue;
    const nameMatch = profile.full_name && body.includes('@' + profile.full_name);
    const emailMatch = profile.email && body.includes('@' + profile.email);
    if (!nameMatch && !emailMatch) continue;
    createNotification(profile.id, 'mention',
      senderName + ' mentioned you in a comment on: ' + (targetTitle || targetUrl),
      targetUrl);
  }
}

// ── @ mention → invite unregistered users ─────────────────────────────────
async function _checkMentionInvites(body, targetTitle, targetUrl) {
  const emailRe = /@([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/g;
  const mentioned = [];
  let m;
  while ((m = emailRe.exec(body)) !== null) mentioned.push(m[1].toLowerCase());
  if (!mentioned.length || !_cClient || !_cUser) return;

  // Deduplicate
  const unique = [...new Set(mentioned)];

  // Get inviter display name from profiles
  const { data: myProfile } = await _cClient.from('profiles')
    .select('full_name').eq('id', _cUser.id).single();
  const inviterName = myProfile ? (myProfile.full_name || 'A colleague') : 'A colleague';

  for (const email of unique) {
    // Check if already registered
    const { data: existing } = await _cClient.from('profiles')
      .select('id').eq('email', email).maybeSingle();
    if (existing) continue;

    // Not registered — send mention invite (fire and forget)
    const msg = `${inviterName} mentioned you in a team discussion about "${targetTitle || targetUrl}". `
      + `Click below to view the message and sign up for a free account.`;
    fetch('https://compliance-ai-proxy.andersencompliance.workers.dev/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_email: email,
        inviter_name: inviterName,
        personal_message: msg,
        signup_url: 'https://tunvara.vercel.app/login.html',
      }),
    }).catch(() => {});
  }
}

function _authorName(p) { return p ? (p.full_name || 'Unknown') : 'Unknown'; }
function _ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _attr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
