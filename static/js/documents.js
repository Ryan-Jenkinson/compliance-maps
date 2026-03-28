/* documents.js — Global upload modal for topbar button (dashboard.html) */

let _dmSb = null;
let _dmUser = null;
let _dmFolders = [];
let _dmFile = null;

function initDocumentModal(sb, user) {
  _dmSb = sb;
  _dmUser = user;
  sb.from('article_folders')
    .select('id,name,parent_id')
    .eq('user_id', user.id)
    .order('name')
    .then(({ data }) => { _dmFolders = data || []; });
}

function openUploadModal() {
  if (!_dmSb) return;
  const modal = document.getElementById('dm-upload-modal');
  if (!modal) return;
  const sel = document.getElementById('dm-upload-folder');
  if (sel) {
    sel.innerHTML = '<option value="">No folder</option>';
    const tops = _dmFolders.filter(f => !f.parent_id);
    tops.forEach(f => {
      sel.innerHTML += `<option value="${_dmEsc(f.id)}">${_dmEsc(f.name)}</option>`;
      _dmFolders.filter(s => s.parent_id === f.id).forEach(s => {
        sel.innerHTML += `<option value="${_dmEsc(s.id)}">\u00a0\u00a0${_dmEsc(f.name)} / ${_dmEsc(s.name)}</option>`;
      });
    });
  }
  const statusEl = document.getElementById('dm-upload-status');
  if (statusEl) statusEl.style.display = 'none';
  const ti = document.getElementById('dm-upload-title');
  if (ti) ti.value = '';
  const fn = document.getElementById('dm-file-name');
  if (fn) { fn.textContent = ''; fn.style.display = 'none'; }
  const inp = document.getElementById('dm-file-input');
  if (inp) inp.value = '';
  _dmFile = null;
  modal.style.display = 'flex';
}

function closeUploadModal() {
  const modal = document.getElementById('dm-upload-modal');
  if (modal) modal.style.display = 'none';
  _dmFile = null;
}

function handleDmDragOver(e) {
  e.preventDefault();
  document.getElementById('dm-drop-zone').classList.add('drag-over');
}

function handleDmDragLeave() {
  document.getElementById('dm-drop-zone').classList.remove('drag-over');
}

function handleDmDrop(e) {
  e.preventDefault();
  document.getElementById('dm-drop-zone').classList.remove('drag-over');
  _dmFile = e.dataTransfer.files[0];
  if (_dmFile) _showDmFileName(_dmFile.name);
}

function handleDmFileSelect(e) {
  _dmFile = e.target.files[0];
  if (_dmFile) _showDmFileName(_dmFile.name);
}

function _showDmFileName(name) {
  const el = document.getElementById('dm-file-name');
  if (el) { el.textContent = '\u2713 ' + name; el.style.display = 'block'; }
}

async function submitDmUpload() {
  if (!_dmFile || !_dmSb || !_dmUser) {
    _showDmStatus('Please select a file.', false); return;
  }
  if (_dmFile.size > 50 * 1024 * 1024) {
    _showDmStatus('File too large \u2014 max 50 MB.', false); return;
  }
  const title = (document.getElementById('dm-upload-title').value || '').trim() || _dmFile.name;
  const folderId = document.getElementById('dm-upload-folder')?.value || null;
  const btn = document.getElementById('dm-upload-btn');
  btn.disabled = true; btn.textContent = 'Uploading\u2026';

  const ext = _dmFile.name.split('.').pop().toLowerCase();
  const path = `${_dmUser.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await _dmSb.storage.from('user-documents').upload(path, _dmFile);
  if (upErr) {
    btn.disabled = false; btn.textContent = 'Upload';
    _showDmStatus('Upload failed: ' + upErr.message, false); return;
  }

  const { error: dbErr } = await _dmSb.from('user_documents').insert({
    user_id: _dmUser.id, storage_path: path, filename: _dmFile.name,
    title, folder_id: folderId || null,
    file_size: _dmFile.size, mime_type: _dmFile.type || null,
  });
  btn.disabled = false; btn.textContent = 'Upload';
  if (dbErr) { _showDmStatus('Save failed: ' + dbErr.message, false); return; }

  _showDmStatus('Uploaded!', true);
  setTimeout(() => {
    closeUploadModal();
    _showDmToast('Document uploaded! <a href="documents.html" style="color:inherit;text-decoration:underline;">View library \u2192</a>');
  }, 800);
}

function _showDmStatus(msg, ok) {
  const el = document.getElementById('dm-upload-status');
  if (!el) return;
  el.textContent = msg;
  el.style.cssText = 'display:block;margin-top:10px;padding:8px 12px;border-radius:5px;font-size:12px;'
    + (ok ? 'background:rgba(56,161,105,0.1);border:1px solid #38a169;color:#5eb88a;'
           : 'background:rgba(214,64,69,0.1);border:1px solid #d64045;color:#d64045;');
}

function _showDmToast(html) {
  let t = document.getElementById('dm-upload-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'dm-upload-toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0e1a12;border:1px solid #38a169;'
      + 'color:#5eb88a;padding:12px 18px;border-radius:7px;font-size:13px;z-index:10001;max-width:300px;line-height:1.5;';
    document.body.appendChild(t);
  }
  t.innerHTML = html;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 5000);
}

function _dmEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
