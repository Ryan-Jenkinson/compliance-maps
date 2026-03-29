/* article_modal.js — Per-article AI analysis modal (Step 3+) */
var _artAbortController = null;

function initReadState() {
  document.querySelectorAll('[data-article-url]').forEach(function(el) {
    try {
      var url = JSON.parse(el.dataset.articleUrl);
      if (localStorage.getItem('tunvara:read:' + url)) {
        el.classList.add('article-read');
      }
    } catch(e) {}
  });
}

var _WORKER_URL = 'https://compliance-ai-proxy.andersencompliance.workers.dev';
var _ART_SEV_BG  = { HIGH:'#fee2e2', MEDIUM:'#fef3c7', LOW:'#d1fae5', MONITORING:'#f1f5f9' };
var _ART_SEV_TXT = { HIGH:'#991b1b', MEDIUM:'#92400e', LOW:'#065f46', MONITORING:'#475569' };

function _artEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.openArticleDetailFromEl = function(e, el) {
  if (e.target.closest('a') || e.target.closest('.fav-btn') || e.target.closest('.send-btn') || e.target.closest('.comment-btn') || e.target.closest('.comment-thread')) return;
  var favBtn = el.querySelector('.fav-btn');
  var data = {
    url:             favBtn ? favBtn.dataset.url : (el.dataset.url || ''),
    title:           el.dataset.adTitle || el.dataset.headline || '',
    topic:           el.dataset.topic || '',
    source:          el.dataset.source || '',
    summary:         el.dataset.adSummary || '',
    urgency:         (el.dataset.urgency || 'LOW').toUpperCase(),
    relevance:       el.dataset.relevance || '',
    relevanceReason: el.dataset.adRelevanceReason || '',
    impact:          el.dataset.adImpact || '',
  };
  // Mark as read
  try { localStorage.setItem('tunvara:read:' + data.url, '1'); } catch(e) {}
  openArticleDetail(data);
};

var _artCurrentUrl = null;

window.openArticleDetail = function(data) {
  var overlay = document.getElementById('ad-overlay');
  if (!overlay) return;
  _artCurrentUrl = data.url || null;
  // Mark as read
  try { localStorage.setItem('tunvara:read:' + (data.url || ''), '1'); } catch(e) {}
  document.getElementById('ad-title').textContent = data.title || 'Article';
  document.getElementById('ad-topic-badge').textContent = data.topic || '';
  var ub = document.getElementById('ad-urgency-badge');
  ub.textContent = data.urgency || '';
  ub.style.background = _ART_SEV_BG[data.urgency]  || _ART_SEV_BG.MONITORING;
  ub.style.color      = _ART_SEV_TXT[data.urgency] || _ART_SEV_TXT.MONITORING;
  document.getElementById('ad-body').innerHTML = _artBuildInitial(data);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  // Force modal scroll via JS (bypasses CSS caching issues)
  var modal = overlay.querySelector('.bd-modal');
  if (modal) { modal.style.cssText += ';max-height:calc(100vh - 64px)!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;'; }
  var body = document.getElementById('ad-body');
  if (body) { body.style.cssText += ';overflow-y:auto!important;flex:1!important;min-height:0!important;'; }
  // Wire up header action buttons
  var bkBtn = document.getElementById('ad-btn-bookmark');
  if (bkBtn) {
    bkBtn.dataset.url = data.url || '';
    bkBtn.onclick = function(e) { e.stopPropagation(); if (typeof openFolderPicker === 'function') openFolderPicker(data.url, data.title, data.topic, bkBtn); };
    // Reflect saved state if favorites loaded
    if (typeof _applyBookmarkState === 'function' && typeof _savedMap !== 'undefined') {
      _applyBookmarkState(bkBtn, !!_savedMap[data.url]);
    }
  }
  var sendBtn = document.getElementById('ad-btn-send');
  if (sendBtn) {
    sendBtn.onclick = function(e) { e.stopPropagation(); if (typeof openSendPanel === 'function') openSendPanel(data.url, data.title, sendBtn); };
  }
  var commentBtn = document.getElementById('ad-btn-comment');
  if (commentBtn) {
    commentBtn.onclick = function(e) {
      e.stopPropagation();
      var inp = document.getElementById('ad-ct-input');
      if (inp) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function() { inp.focus(); }, 300); }
    };
  }
  _artFetchAI(data);
  _artLoadThread(data.url, data.title);
};

window.closeArticleDetail = function(e) {
  if (e && e.target !== document.getElementById('ad-overlay')) return;
  document.getElementById('ad-overlay').classList.remove('open');
  document.body.style.overflow = '';
  if (_artAbortController) { _artAbortController.abort(); _artAbortController = null; }
};

function _artBuildInitial(data) {
  var s = '';

  // Source + link
  s += '<div class="bd-section"><div class="bd-section-title">Source</div>';
  s += '<div class="bd-section-body" style="display:flex;align-items:center;gap:12px;">';
  s += '<span>' + _artEsc(data.source) + '</span>';
  if (data.url) s += '<a class="bd-source-link" href="' + _artEsc(data.url) + '" target="_blank" rel="noopener">Read full article &rarr;</a>';
  s += '</div></div>';

  // Quick summary (existing)
  if (data.summary) {
    s += '<div class="bd-section"><div class="bd-section-title">Quick Summary</div>';
    s += '<div class="bd-section-body">' + _artEsc(data.summary) + '</div></div>';
  }

  // Existing relevance + impact (two-col if both)
  var hasR = data.relevance || data.relevanceReason;
  var hasI = data.impact && data.impact !== '';
  if (hasR || hasI) {
    if (hasR && hasI) s += '<div class="bd-two-col">';
    if (hasR) {
      s += '<div class="bd-section"><div class="bd-section-title">Relevance — ' + _artEsc(data.relevance) + '</div>';
      s += '<div class="bd-section-body">' + _artEsc(data.relevanceReason || data.relevance) + '</div></div>';
    }
    if (hasI) {
      var score = parseFloat(data.impact);
      var sc = score >= 7 ? '#991b1b' : score >= 4 ? '#92400e' : '#065f46';
      s += '<div class="bd-section"><div class="bd-section-title">Impact Score</div>';
      s += '<div class="bd-section-body"><span style="font-size:26px;font-weight:700;font-family:var(--mono);color:' + sc + ';">' + data.impact + '</span>';
      s += '<span style="font-size:12px;color:var(--text-muted);margin-left:4px;">/ 10</span></div></div>';
    }
    if (hasR && hasI) s += '</div>';
  }

  // AI loading placeholder
  s += '<div id="ad-ai-section"><div class="bd-section"><div class="bd-pending">';
  s += '<div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);letter-spacing:2px;">ANALYZING…</div>';
  s += '</div></div></div>';

  // Team discussion thread
  s += '<div class="bd-section" style="border-top:2px solid var(--border);margin-top:4px;padding-top:16px;">';
  s += '<div class="bd-section-title" style="display:flex;align-items:center;gap:8px;">&#128172; Team Discussion</div>';
  s += '<div class="comment-thread" id="ad-comment-thread" style="display:block;margin-top:8px;">';
  s += '<div class="ct-list" id="ad-ct-list"></div>';
  s += '<div class="ct-compose" style="position:relative;">';
  s += '<div id="ad-mention-picker" style="display:none;position:absolute;bottom:100%;left:0;background:#1e2535;border:1px solid #2d4a8a;border-radius:6px;z-index:9999;min-width:200px;max-height:160px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.4);"></div>';
  s += '<div style="position:relative;">';
  s += '<textarea id="ad-ct-input" class="ct-input" placeholder="Add a comment\u2026 (@ to mention, Enter to post)" rows="2" style="box-sizing:border-box;padding-right:42px;width:100%;"></textarea>';
  s += '<button id="ad-ct-post" title="Post comment" style="position:absolute;right:7px;bottom:7px;background:var(--blue,#1565c0);color:#fff;border:none;border-radius:5px;width:28px;height:26px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;">&#8593;</button>';
  s += '<div id="ad-ct-error" style="display:none;margin-top:6px;font-size:11px;color:#d64045;font-family:var(--mono);"></div>';
  s += '</div>';
  s += '</div></div></div></div>';
  return s;
}

function _artFetchAI(data) {
  var impact = parseFloat(data.impact) || 0;
  var rel = (data.relevance || '').toUpperCase();
  var isDirect = rel === 'DIRECT';
  var isHigh = impact >= 7 || (isDirect && impact >= 5);
  var isMed  = !isHigh && (impact >= 4 || rel === 'INDIRECT');

  var depthInstr = isHigh
    ? 'This is HIGH importance. Write 3-5 sentences for detailed_analysis, thorough paragraphs for business_impact sections, and list all critical actions.'
    : isMed
    ? 'This is MEDIUM importance. Write 2-3 sentences for detailed_analysis and concise paragraphs for impact sections.'
    : 'This is LOW/MONITOR importance. Keep each section to 1-2 sentences. Omit critical_actions if none clearly apply.';

  var _co = window.COMPANY_CONTEXT || {};
  var _coName = _co.name || 'the company';
  var _coIndustry = _co.product_type || _co.industry || 'US manufacturer';
  var _coDirect = _co.direct_pfas_exposure || 'Direct PFAS exposure through manufactured products.';
  var _coCategories = (_co.supply_chain && _co.supply_chain.categories) ? _co.supply_chain.categories.join(', ') : 'components';
  var _coTopics = (_co.secondary_compliance || []).map(function(s){return s.split(':')[0];}).join(', ') || 'EPR, REACH, TSCA, Prop 65, Conflict Minerals, Forced Labor';
  var prompt = 'You are a regulatory compliance analyst for ' + _coName + ' — a ' + _coIndustry + '.\n'
    + 'DIRECT PFAS exposure: ' + _coDirect + '\n'
    + 'INDIRECT PFAS exposure: Large supply chain of purchased components (' + _coCategories + ') from manufacturers who may not register in PRISM, making it illegal to sell their products in MN.\n'
    + 'Also tracks: ' + _coTopics + '\n\n'
    + depthInstr + '\n\n'
    + 'Article to analyze:\n'
    + 'Topic: ' + data.topic + '\n'
    + 'Source: ' + data.source + '\n'
    + 'Title: ' + data.title + '\n'
    + (data.summary ? 'Summary: ' + data.summary + '\n' : '')
    + 'Relevance: ' + (data.relevance || 'unknown') + '\n'
    + 'Impact score: ' + (data.impact || 'unknown') + '/10\n\n'
    + 'Return ONLY valid JSON with these exact fields:\n'
    + '{\n'
    + '  "detailed_analysis": "Full breakdown of what this regulation/article actually says and means",\n'
    + '  "what_changed": "Specifically what is different from the previous status quo — the delta",\n'
    + '  "business_impact": {\n'
    + '    "direct_products": "Impact on manufactured products and coating obligations",\n'
    + '    "supply_chain": "Impact on purchased components and supplier obligations",\n'
    + '    "financial_risk": "Financial and operational risk assessment",\n'
    + '    "severity": "HIGH or MEDIUM or LOW or MONITORING"\n'
    + '  },\n'
    + '  "key_dates": ["YYYY-MM-DD or Q1 2027: description", ...],\n'
    + '  "internal_stakeholders": ["Legal: reason", "Procurement: reason", ...],\n'
    + '  "confidence_status": "One of: FINAL_RULE / PROPOSED_RULE / COURT_DECISION / LEGISLATION / INDUSTRY_NEWS / SPECULATIVE — then one sentence explanation",\n'
    + '  "watch_next": "Specific triggers or upcoming decisions to monitor in coming weeks/months",\n'
    + '  "critical_actions": ["Urgent action 1", ...]\n'
    + '}\n'
    + 'critical_actions should only include genuinely urgent items requiring near-term action. Empty array if none.';

  var _fetchUrl = data.url; // snapshot for stale-check below
  fetch(_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  .then(function(r) { return r.json(); })
  .then(function(resp) {
    if (_artCurrentUrl !== _fetchUrl) return; // user opened a different article before fetch completed
    if (!resp.content || !resp.content[0]) { _artAIError(); return; }
    var text = resp.content[0].text.trim()
      .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
    try { _artRenderAI(data, JSON.parse(text)); } catch(e) { _artAIError(); }
  })
  .catch(function() {
    if (_artCurrentUrl !== _fetchUrl) return;
    _artAIError();
  });
}

function _artRenderAI(data, ai) {
  var el = document.getElementById('ad-ai-section');
  if (!el) return;
  var s = '';
  var sev = (ai.business_impact && ai.business_impact.severity || 'MONITORING').toUpperCase();
  var sevBg  = _ART_SEV_BG[sev]  || _ART_SEV_BG.MONITORING;
  var sevTxt = _ART_SEV_TXT[sev] || _ART_SEV_TXT.MONITORING;

  // Critical actions — shown first if present
  if (ai.critical_actions && ai.critical_actions.length) {
    s += '<div class="bd-section" style="background:#fee2e218;border-left:3px solid #991b1b;">';
    s += '<div class="bd-section-title" style="color:#991b1b;">&#9888; Critical Actions Required</div>';
    s += '<ul class="bd-action-list">';
    ai.critical_actions.forEach(function(a) { s += '<li style="font-weight:500;">' + _artEsc(a) + '</li>'; });
    s += '</ul></div>';
  }

  // Confidence / status badge
  if (ai.confidence_status) {
    var parts = ai.confidence_status.split(/\s*[—–-]\s*/);
    var badge = parts[0].trim().replace(/_/g,' ');
    var explanation = parts.slice(1).join(' — ').trim();
    var badgeBg = badge.includes('FINAL') ? '#d1fae5' : badge.includes('PROPOSED') || badge.includes('LEGISL') ? '#fef3c7' : '#f1f5f9';
    var badgeTxt = badge.includes('FINAL') ? '#065f46' : badge.includes('PROPOSED') || badge.includes('LEGISL') ? '#92400e' : '#475569';
    s += '<div class="bd-section"><div class="bd-section-title">Status</div>';
    s += '<div class="bd-section-body" style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">';
    s += '<span style="font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;background:' + badgeBg + ';color:' + badgeTxt + ';white-space:nowrap;">' + _artEsc(badge) + '</span>';
    if (explanation) s += '<span style="font-size:13px;color:var(--text-primary);">' + _artEsc(explanation) + '</span>';
    s += '</div></div>';
  }

  // Detailed analysis
  if (ai.detailed_analysis) {
    s += '<div class="bd-section"><div class="bd-section-title">Detailed Analysis</div>';
    s += '<div class="bd-section-body">' + _artEsc(ai.detailed_analysis) + '</div></div>';
  }

  // What changed
  if (ai.what_changed) {
    s += '<div class="bd-section"><div class="bd-section-title">What Changed</div>';
    s += '<div class="bd-section-body">' + _artEsc(ai.what_changed) + '</div></div>';
  }

  // Business impact
  if (ai.business_impact) {
    var bi = ai.business_impact;
    s += '<div class="bd-section" style="background:' + sevBg + '18;">';
    s += '<div class="bd-section-title" style="color:' + sevTxt + ';">Business Impact — ' + sev + '</div>';
    if (bi.direct_products) {
      s += '<div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:700;font-family:var(--mono);color:var(--text-muted);display:block;margin-bottom:2px;">DIRECT PRODUCTS &amp; COATINGS</span>';
      s += '<div class="bd-section-body">' + _artEsc(bi.direct_products) + '</div></div>';
    }
    if (bi.supply_chain) {
      s += '<div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:700;font-family:var(--mono);color:var(--text-muted);display:block;margin-bottom:2px;">SUPPLY CHAIN</span>';
      s += '<div class="bd-section-body">' + _artEsc(bi.supply_chain) + '</div></div>';
    }
    if (bi.financial_risk) {
      s += '<div><span style="font-size:11px;font-weight:700;font-family:var(--mono);color:var(--text-muted);display:block;margin-bottom:2px;">FINANCIAL &amp; OPERATIONAL RISK</span>';
      s += '<div class="bd-section-body">' + _artEsc(bi.financial_risk) + '</div></div>';
    }
    s += '</div>';
  }

  // Key dates
  if (ai.key_dates && ai.key_dates.length) {
    s += '<div class="bd-section"><div class="bd-section-title">Key Dates &amp; Deadlines</div>';
    ai.key_dates.forEach(function(d) {
      var parts2 = d.split(/:\s*/);
      var dateLabel = parts2[0].trim();
      var dateDesc  = parts2.slice(1).join(': ').trim();
      s += '<div class="bd-follow-up-item">';
      s += '<div class="bd-fu-date">' + _artEsc(dateLabel) + '</div>';
      s += '<div style="font-size:13px;color:var(--text-primary);flex:1;">' + _artEsc(dateDesc || dateLabel) + '</div>';
      s += '</div>';
    });
    s += '</div>';
  }

  // Internal stakeholders
  if (ai.internal_stakeholders && ai.internal_stakeholders.length) {
    s += '<div class="bd-section"><div class="bd-section-title">Who Needs to Know</div>';
    s += '<ul class="bd-action-list">';
    ai.internal_stakeholders.forEach(function(st) { s += '<li>' + _artEsc(st) + '</li>'; });
    s += '</ul></div>';
  }

  // Watch next
  if (ai.watch_next) {
    s += '<div class="bd-section"><div class="bd-section-title">Watch Next</div>';
    s += '<div class="bd-section-body">' + _artEsc(ai.watch_next) + '</div></div>';
  }

  el.innerHTML = s;
}

var _artTeamMembers = null; // cached for @ mentions

async function _artFetchTeamMembers() {
  if (_artTeamMembers) return _artTeamMembers;
  var sb = window._client || (typeof getClient === 'function' && getClient());
  if (!sb) return [];
  var { data } = await sb.from('profiles').select('id, full_name, email').limit(200);
  _artTeamMembers = (data || []).filter(function(p) { return p.full_name || p.email; });
  return _artTeamMembers;
}

function _artLoadThread(url, title) {
  if (!url || typeof _renderThread !== 'function') return;
  var threadEl = document.getElementById('ad-comment-thread');
  if (!threadEl) return;

  // Tear down any listeners from previous modal open
  if (_artAbortController) _artAbortController.abort();
  _artAbortController = new AbortController();
  var signal = _artAbortController.signal;

  var list = document.getElementById('ad-ct-list');
  list.innerHTML = '<div class="ct-msg">Loading\u2026</div>';
  list.dataset.loaded = '';
  list.dataset.url = url;
  list.dataset.title = title || url;
  list.dataset.type = 'article';
  _renderThread(url, title || url, 'article', threadEl);

  var btn = document.getElementById('ad-ct-post');
  btn.addEventListener('click', function() { _artPostComment(threadEl); }, { signal: signal });

  var inp = document.getElementById('ad-ct-input');
  inp.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _artPostComment(threadEl); }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); _artPostComment(threadEl); }
  }, { signal: signal });

  var picker = document.getElementById('ad-mention-picker');
  inp.addEventListener('input', function() {
    var val = inp.value;
    var atIdx = val.lastIndexOf('@');
    if (atIdx === -1) { picker.style.display = 'none'; return; }
    var query = val.slice(atIdx + 1).toLowerCase();
    _artFetchTeamMembers().then(function(members) {
      var matches = members.filter(function(m) {
        return (m.full_name || '').toLowerCase().includes(query) || (m.email || '').toLowerCase().includes(query);
      }).slice(0, 6);
      if (!matches.length) { picker.style.display = 'none'; return; }
      picker.innerHTML = matches.map(function(m) {
        return '<div data-name="' + _artEsc(m.full_name || m.email) + '" style="padding:8px 12px;cursor:pointer;font-size:13px;color:#e2e8f0;border-bottom:1px solid #2d3748;" onmouseover="this.style.background=\'#2d3748\'" onmouseout="this.style.background=\'\'"><strong>' + _artEsc(m.full_name || m.email) + '</strong><span style="color:#8b95a7;font-size:11px;margin-left:6px;">' + _artEsc(m.email) + '</span></div>';
      }).join('');
      picker.style.display = 'block';
      picker.querySelectorAll('div').forEach(function(item) {
        item.addEventListener('mousedown', function(e) {
          e.preventDefault();
          var curVal = inp.value;
          var curAtIdx = curVal.lastIndexOf('@');
          inp.value = (curAtIdx === -1 ? '' : curVal.slice(0, curAtIdx)) + '@' + item.dataset.name + ' ';
          picker.style.display = 'none';
          inp.focus();
        }, { signal: signal });
      });
    });
  }, { signal: signal });

  inp.addEventListener('blur', function() { setTimeout(function() { picker.style.display = 'none'; }, 150); }, { signal: signal });
}

async function _artPostComment(threadEl) {
  var input = document.getElementById('ad-ct-input');
  var errEl = document.getElementById('ad-ct-error');
  function _showErr(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; setTimeout(function() { errEl.style.display = 'none'; }, 4000); }
  }
  if (!_cClient || !_cUser) { _showErr('Not signed in — please refresh and log in again.'); return; }
  var body = input ? input.value.trim() : '';
  if (!body) return;
  var list = document.getElementById('ad-ct-list');
  var btn = document.getElementById('ad-ct-post');
  if (btn) btn.disabled = true;
  var { error } = await _cClient.from('comments').insert({
    author_id: _cUser.id,
    target_type: 'article',
    target_url: list.dataset.url,
    target_title: list.dataset.title,
    parent_id: null,
    body: body,
  });
  if (btn) btn.disabled = false;
  if (error) { console.error('Comment error:', error); _showErr('Could not post: ' + (error.message || error.code || 'unknown error')); return; }
  if (typeof _checkMentionInvites === 'function') _checkMentionInvites(body, list.dataset.title, list.dataset.url);
  if (typeof _notifyMentionedUsers === 'function') _notifyMentionedUsers(body, list.dataset.title, list.dataset.url);
  if (input) input.value = '';
  list.dataset.loaded = '';
  _renderThread(list.dataset.url, list.dataset.title, 'article', threadEl);
  _bumpCount(list.dataset.url); // update badge on card
}

function _artAIError() {
  var el = document.getElementById('ad-ai-section');
  if (el) el.innerHTML = '<div class="bd-section"><div class="bd-section-body" style="color:var(--text-muted);font-size:12px;font-family:var(--mono);">AI enrichment unavailable — check Worker status.</div></div>';
}

// Close on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var overlay = document.getElementById('ad-overlay');
    if (overlay && overlay.classList.contains('open')) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      if (_artAbortController) { _artAbortController.abort(); _artAbortController = null; }
    }
  }
});
