'use strict';

/* ── Roles config (mirrors briefing_roles.yaml — populated by renderer) ── */
const ROLES = window.BRIEFING_ROLES || [];
const PERIODS = window.BRIEFING_PERIODS || {
  weekly:  { label: 'Weekly Update',   sub: 'Last 7 days',       pages: '2–3 pages', icon: 'calendar-days' },
  monthly: { label: 'Monthly Update',  sub: 'Last 30 days',      pages: '4–5 pages', icon: 'calendar' },
  full:    { label: 'Full Briefing',   sub: '6-month overview',  pages: '7–9 pages', icon: 'book-open' },
};

let _sb = null;
let _selectedRoleId = null;
let _generatedBriefings = {};  // { "executive-weekly": { public_url, generated_at } }

async function initBriefings() {
  _sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  _initSupplierTypeLabels();
  await _loadGeneratedBriefings();
  _renderRoleGrid();
}

function _initSupplierTypeLabels() {
  var co = window.COMPANY_CONTEXT || {};
  var coName = co.name || 'our company';
  var directEl = document.getElementById('sup-type-direct');
  if (directEl) directEl.textContent = 'Direct Supplier (makes components for ' + coName + ')';
}

/* ── Load pre-generated briefing metadata from Supabase ── */
async function _loadGeneratedBriefings() {
  try {
    const { data, error } = await _sb
      .from('generated_briefings')
      .select('role_id, period, public_url, generated_at')
      .limit(100);
    if (error) throw error;
    _generatedBriefings = {};
    for (const row of data || []) {
      _generatedBriefings[`${row.role_id}-${row.period}`] = row;
    }
  } catch (e) {
    console.warn('briefings: could not load generated_briefings', e);
  }
}

/* ── Render role selection grid ── */
function _renderRoleGrid() {
  const grid = document.getElementById('role-grid');
  if (!ROLES.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">No roles configured.</div>';
    return;
  }
  grid.innerHTML = ROLES.map(role => `
    <button class="role-card" id="role-card-${role.id}" onclick="selectRole('${role.id}')">
      <div class="role-card-icon" style="background:${role.color}22;">
        <i data-lucide="${role.icon}" style="width:15px;height:15px;color:${role.color};"></i>
      </div>
      <div class="role-card-name">${_e(role.name)}</div>
      <div class="role-card-desc">${_e(role.description)}</div>
    </button>
  `).join('');
  lucide.createIcons();
}

/* ── Select a role and show download panel ── */
function selectRole(roleId) {
  if (_selectedRoleId) {
    const prev = document.getElementById(`role-card-${_selectedRoleId}`);
    if (prev) prev.classList.remove('selected');
  }
  _selectedRoleId = roleId;
  const card = document.getElementById(`role-card-${roleId}`);
  if (card) card.classList.add('selected');

  const role = ROLES.find(r => r.id === roleId);
  if (!role) return;

  const panel = document.getElementById('download-panel');
  panel.classList.add('visible');
  document.getElementById('panel-role-name').textContent = role.name;
  document.getElementById('panel-role-desc').textContent = role.description;

  _renderPeriodCards(role);

  // Smooth scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Render the weekly/monthly/full download cards ── */
function _renderPeriodCards(role) {
  const container = document.getElementById('period-cards');
  const periodEntries = Object.entries(PERIODS);
  container.innerHTML = periodEntries.map(([periodKey, period]) => {
    const key = `${role.id}-${periodKey}`;
    const meta = _generatedBriefings[key];
    const available = !!meta;
    const refreshedText = available
      ? `Refreshed ${_formatDate(meta.generated_at)}`
      : 'Not yet generated';

    const btn = available
      ? `<a class="dl-btn dl-btn-ready" href="${_e(meta.public_url)}" target="_blank" rel="noopener" download>
           <i data-lucide="download" style="width:13px;height:13px;"></i> Download PDF
         </a>`
      : `<span class="dl-btn dl-btn-unavail">
           <i data-lucide="clock" style="width:13px;height:13px;"></i> Coming next run
         </span>`;

    const sub = period.subtitle_template || period.sub || '';
    const pages = period.pages || '';

    return `
      <div class="period-card">
        <div class="period-card-label">${_e(period.label)}</div>
        <div class="period-card-sub">${_e(sub)}</div>
        <div class="period-card-pages">${_e(pages)}</div>
        ${btn}
        <div class="refreshed-label">${_e(refreshedText)}</div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

/* ── Tab switching ── */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
}

/* ── Submit custom briefing request ── */
async function submitCustomRequest() {
  const roleDesc = document.getElementById('custom-role-input').value.trim();
  const context  = document.getElementById('custom-context-input').value.trim();
  const period   = document.getElementById('custom-period-select').value;
  const email    = document.getElementById('custom-email-input').value.trim();
  const status   = document.getElementById('custom-form-status');
  const btn      = document.getElementById('custom-submit-btn');

  if (!roleDesc) { _setStatus(status, 'Please describe your role.', 'err'); return; }
  if (!email || !email.includes('@')) { _setStatus(status, 'Please enter a valid email.', 'err'); return; }

  btn.disabled = true;
  _setStatus(status, 'Submitting…', '');

  try {
    const { error } = await _sb.from('briefing_requests').insert({
      email,
      role_description: roleDesc,
      supplemental_context: context,
      period,
    });
    if (error) throw error;
    _setStatus(status, `✓ Request received. We'll email your briefing to ${email}.`, 'ok');
    document.getElementById('custom-role-input').value = '';
    document.getElementById('custom-context-input').value = '';
    document.getElementById('custom-email-input').value = '';
  } catch (e) {
    _setStatus(status, `Error: ${e.message || 'Could not submit request.'}`, 'err');
    btn.disabled = false;
  }
}

/* ── Utilities ── */
function _e(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return isoStr.slice(0, 10); }
}

function _setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'form-status' + (type === 'ok' ? ' status-ok' : type === 'err' ? ' status-err' : '');
}

/* ═══════════════════════════════════════════════════════════
   SUPPLIER GUIDE — form logic
   ═══════════════════════════════════════════════════════════ */

const SUPPLIER_COMMODITIES = window.SUPPLIER_COMMODITIES || { direct: [], indirect: [] };

/* Populate commodity dropdown when supplier type changes */
function updateCommodityList() {
  const type = document.getElementById('sup-type-select').value;
  const sel = document.getElementById('sup-commodity-select');
  sel.innerHTML = '';
  sel.disabled = !type;

  const list = type === 'direct'
    ? (SUPPLIER_COMMODITIES.direct || [])
    : (SUPPLIER_COMMODITIES.indirect || []);

  if (!list.length) {
    sel.innerHTML = '<option value="">No commodities loaded</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Select commodity —</option>' +
    list.map(c => `<option value="${_e(c.id)}">${_e(c.name)}</option>`).join('');

  sel.addEventListener('change', _checkForPregenGuide);
}

/* Check if a pre-generated guide exists for current form selection */
async function _checkForPregenGuide() {
  const commodity = document.getElementById('sup-commodity-select').value;
  const topic = document.getElementById('sup-topic-select').value;
  const notice = document.getElementById('sup-pregen-notice');
  const meta = document.getElementById('sup-pregen-meta');
  const link = document.getElementById('sup-pregen-dl-link');

  notice.style.display = 'none';
  if (!commodity || !topic || !_sb) return;

  try {
    const { data } = await _sb
      .from('generated_supplier_guides')
      .select('public_url, generated_at, commodity_name')
      .eq('commodity_id', commodity)
      .eq('topic', topic)
      .maybeSingle();

    if (data) {
      meta.textContent = `${data.commodity_name} · ${topic} · Refreshed ${_formatDate(data.generated_at)}`;
      link.href = data.public_url;
      notice.style.display = 'block';
    }
  } catch (e) {
    // silently ignore — pre-gen check is optional
  }
}

/* Render the common guides quick-pick grid */
async function _renderCommonGuidesGrid() {
  const grid = document.getElementById('common-guides-grid');
  if (!grid || !_sb) return;

  try {
    const { data } = await _sb
      .from('generated_supplier_guides')
      .select('commodity_id, commodity_name, topic, public_url, generated_at')
      .order('generated_at', { ascending: false })
      .limit(6);

    if (!data || !data.length) {
      grid.innerHTML = '<div style="color:var(--text-muted);font-size:12px;grid-column:1/-1;">No pre-generated guides yet. Run the pipeline to generate them.</div>';
      return;
    }

    grid.innerHTML = data.map(g => `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:pointer;"
           onclick="prefillSupplierForm('${_e(g.commodity_id)}', '${_e(g.topic)}')">
        <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-bottom:3px;">${_e(g.commodity_name)}</div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px;">${_e(g.topic)} · Refreshed ${_formatDate(g.generated_at)}</div>
        <a href="${_e(g.public_url)}" target="_blank" rel="noopener" download
           style="font-size:11px;color:#60A5FA;text-decoration:none;font-weight:600;"
           onclick="event.stopPropagation()">&#11015; Download PDF</a>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:12px;grid-column:1/-1;">Could not load guides.</div>';
  }
}

/* Fill form from a quick-pick click */
function prefillSupplierForm(commodityId, topic) {
  const directIds = (SUPPLIER_COMMODITIES.direct || []).map(c => c.id);
  const type = directIds.includes(commodityId) ? 'direct' : 'indirect';

  document.getElementById('sup-type-select').value = type;
  updateCommodityList();
  document.getElementById('sup-commodity-select').value = commodityId;
  document.getElementById('sup-topic-select').value = topic;
  _checkForPregenGuide();

  document.getElementById('sup-type-select').closest('div').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Submit supplier guide request */
async function submitSupplierGuideRequest() {
  const commodityId = document.getElementById('sup-commodity-select').value;
  const topic       = document.getElementById('sup-topic-select').value;
  const state       = document.getElementById('sup-state-select').value;
  const scope       = document.getElementById('sup-scope-select').value;
  const context     = document.getElementById('sup-context-input').value.trim();
  const email       = document.getElementById('sup-email-input').value.trim();
  const status      = document.getElementById('sup-form-status');
  const btn         = document.getElementById('sup-submit-btn');

  if (!commodityId) { _setStatus(status, 'Please select a commodity.', 'err'); return; }
  if (!email || !email.includes('@')) { _setStatus(status, 'Please enter a valid email.', 'err'); return; }

  btn.disabled = true;
  _setStatus(status, 'Submitting\u2026', '');

  try {
    const { error } = await _sb.from('briefing_requests').insert({
      email,
      role_description: `supplier::${commodityId}::${topic}::${state}::${scope}`,
      supplemental_context: context,
      period: 'weekly',
    });
    if (error) throw error;

    _setStatus(status, `\u2713 Request received. We'll email your supplier guide to ${email}.`, 'ok');
    document.getElementById('sup-context-input').value = '';
    document.getElementById('sup-email-input').value = '';
  } catch (e) {
    _setStatus(status, `Error: ${e.message || 'Could not submit.'}`, 'err');
    btn.disabled = false;
  }
}

// Attach commodity change listener for pre-gen check
document.addEventListener('DOMContentLoaded', () => {
  ['sup-topic-select', 'sup-state-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', _checkForPregenGuide);
  });
  _renderCommonGuidesGrid();
});
