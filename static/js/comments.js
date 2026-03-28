/* comments.js — Comment threads on articles, deadlines, and bills */

let _cClient = null;
let _cUser = null;

function initComments(supabaseClient, user) {
  _cClient = supabaseClient;
  _cUser = user;
  _loadAllCommentCounts();
  document.addEventListener('click', _commentClickHandler, true);
}

async function _loadAllCommentCounts() {
  if (!_cClient) return;
  const { data, error } = await _cClient.from('comments').select('target_url');
  if (error || !data) return;
  const counts = {};
  for (const row of data) counts[row.target_url] = (counts[row.target_url] || 0) + 1;
  document.querySelectorAll('.comment-btn').forEach(btn => {
    const n = counts[btn.dataset.url] || 0;
    const badge = btn.querySelector('.ct-count');
    if (badge) { badge.textContent = n || ''; badge.style.display = n ? 'inline' : 'none'; }
  });
}

function _bumpCount(url) {
  document.querySelectorAll('.comment-btn').forEach(btn => {
    if (btn.dataset.url !== url) return;
    const badge = btn.querySelector('.ct-count');
    if (!badge) return;
    const n = (parseInt(badge.textContent || '0', 10) || 0) + 1;
    badge.textContent = n; badge.style.display = 'inline';
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

async function _renderThread(url, title, type, threadEl) {
  const list = threadEl.querySelector('.ct-list');
  const { data: comments, error } = await _cClient
    .from('comments')
    .select('id, body, created_at, edited_at, author_id, parent_id, profiles(first_name, last_name)')
    .eq('target_url', url)
    .order('created_at', { ascending: true });
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
  const body = c.body === '[deleted]' ? '<em class="ct-deleted">[deleted]</em>' : `<span>${_esc(c.body)}</span>`;
  const edited = c.edited_at ? ' <em class="ct-edited">(edited)</em>' : '';
  const acts = isOwn && c.body !== '[deleted]'
    ? `<button class="ct-act ct-edit-btn" data-id="${c.id}">Edit</button><button class="ct-act ct-del-btn" data-id="${c.id}">Delete</button>` : '';
  const replyBtn = c.body !== '[deleted]' ? `<button class="ct-act ct-reply-btn" data-parent="${c.id}">Reply</button>` : '';
  const repliesHtml = replies.map(r => {
    const rOwn = _cUser && r.author_id === _cUser.id;
    const rBody = r.body === '[deleted]' ? '<em class="ct-deleted">[deleted]</em>' : `<span>${_esc(r.body)}</span>`;
    const rActs = rOwn && r.body !== '[deleted]'
      ? `<button class="ct-act ct-edit-btn" data-id="${r.id}">Edit</button><button class="ct-act ct-del-btn" data-id="${r.id}">Delete</button>` : '';
    return `<div class="ct-reply" data-id="${r.id}">
      <div class="ct-meta"><span class="ct-author">${_esc(_authorName(r.profiles))}</span><span class="ct-time">${_ago(r.created_at)}</span>${rActs}</div>
      <div class="ct-body" id="ctb-${r.id}">${rBody}</div></div>`;
  }).join('');
  return `<div class="ct-comment" data-id="${c.id}">
    <div class="ct-meta"><span class="ct-author">${_esc(_authorName(c.profiles))}</span><span class="ct-time">${_ago(c.created_at)}</span>${edited}${acts}${replyBtn}</div>
    <div class="ct-body" id="ctb-${c.id}">${body}</div>
    ${repliesHtml}
    <div class="ct-replybox" id="crb-${c.id}" style="display:none">
      <textarea class="ct-input" placeholder="Reply…" rows="2"></textarea>
      <button class="ct-post ct-reply-post" data-parent="${c.id}">Post reply</button>
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
  // Notify parent comment author if it's not the same person
  const { data: parent } = await _cClient.from('comments').select('author_id').eq('id', parentId).single();
  if (parent && parent.author_id && parent.author_id !== _cUser.id && typeof createNotification === 'function') {
    const replierName = (_cUser.user_metadata?.first_name || '') + ' ' + (_cUser.user_metadata?.last_name || '');
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
  if (!error) bodyEl.innerHTML = `<span>${_esc(newBody)}</span>`;
}

function _cancelEdit(id, orig) {
  const bodyEl = document.getElementById(`ctb-${id}`);
  if (bodyEl) bodyEl.innerHTML = `<span>${_esc(orig)}</span>`;
}

async function _deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  const { error } = await _cClient.from('comments').update({ body: '[deleted]' }).eq('id', id);
  if (!error) {
    const bodyEl = document.getElementById(`ctb-${id}`);
    if (bodyEl) bodyEl.innerHTML = '<em class="ct-deleted">[deleted]</em>';
    bodyEl?.closest('.ct-comment, .ct-reply')?.querySelectorAll('.ct-edit-btn,.ct-del-btn,.ct-reply-btn').forEach(b => b.remove());
  }
}

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
}

function _authorName(p) { return p ? (`${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown') : 'Unknown'; }
function _ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _attr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
