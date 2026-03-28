/* article_modal.js — Per-article AI analysis modal (Step 3+) */

var _WORKER_URL = 'https://andersencompliance.workers.dev';
var _ART_SEV_BG  = { HIGH:'#fee2e2', MEDIUM:'#fef3c7', LOW:'#d1fae5', MONITORING:'#f1f5f9' };
var _ART_SEV_TXT = { HIGH:'#991b1b', MEDIUM:'#92400e', LOW:'#065f46', MONITORING:'#475569' };

function _artEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.openArticleDetailFromEl = function(e, el) {
  if (e.target.closest('a') || e.target.closest('.fav-btn') || e.target.closest('.send-btn')) return;
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
  openArticleDetail(data);
};

window.openArticleDetail = function(data) {
  var overlay = document.getElementById('ad-overlay');
  if (!overlay) return;
  document.getElementById('ad-title').textContent = data.title || 'Article';
  document.getElementById('ad-topic-badge').textContent = data.topic || '';
  var ub = document.getElementById('ad-urgency-badge');
  ub.textContent = data.urgency || '';
  ub.style.background = _ART_SEV_BG[data.urgency]  || _ART_SEV_BG.MONITORING;
  ub.style.color      = _ART_SEV_TXT[data.urgency] || _ART_SEV_TXT.MONITORING;
  document.getElementById('ad-body').innerHTML = _artBuildInitial(data);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  _artFetchAI(data);
};

window.closeArticleDetail = function(e) {
  if (e && e.target !== document.getElementById('ad-overlay')) return;
  document.getElementById('ad-overlay').classList.remove('open');
  document.body.style.overflow = '';
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

  var prompt = 'You are a regulatory compliance analyst for Andersen Corporation — a US windows/doors manufacturer with:\n'
    + '- DIRECT PFAS exposure: fluoropolymer coatings on manufactured window/door components, must register in MN PRISM portal by July 1 2026\n'
    + '- INDIRECT PFAS exposure: large supply chain of purchased components (electronics, o-rings, gaskets, vinyl, hardware, lubricants, PPE) from manufacturers who may not register in PRISM, making it illegal to sell their products in MN\n'
    + '- Also tracks: EPR (extended producer responsibility), REACH, TSCA, Prop 65, Conflict Minerals, Forced Labor\n\n'
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
    if (!resp.content || !resp.content[0]) { _artAIError(); return; }
    var text = resp.content[0].text.trim()
      .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
    try { _artRenderAI(data, JSON.parse(text)); } catch(e) { _artAIError(); }
  })
  .catch(function() { _artAIError(); });
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
    }
  }
});
