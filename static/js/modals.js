/* modals.js — Expand modal and article history modal */
/* Depends on: ALL_ARTICLES (set by data bridge in dashboard.html) */

(function() {
  'use strict';

  function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ── Expand Modal ─────────────────────────────────────────── */
  window.openExpandModal = function(widgetId, title) {
    var overlay = document.getElementById('expand-modal-overlay');
    var body    = document.getElementById('expand-modal-body');
    var titleEl = document.getElementById('expand-modal-title');

    // Find the widget panel
    var panel = document.querySelector('[data-widget-id="' + widgetId + '"]');
    if (!panel) { alert('Widget not found'); return; }

    // Clone the panel-body content (first child with class panel-body, or any direct content)
    var src = panel.querySelector('.panel-body') || panel.querySelector('[style*="padding"]');
    if (!src) {
      // Fall back: clone everything except the header
      src = panel;
    }
    var clone = src.cloneNode(true);

    // Remove expand buttons from cloned content so they don't nest
    clone.querySelectorAll('.expand-btn').forEach(function(btn) { btn.remove(); });

    // Show hidden chart trend sections in the expanded view
    clone.querySelectorAll('.chart-trend-section').forEach(function(el) {
      el.style.display = 'block';
    });

    // Make SVG charts fill the modal width better
    clone.querySelectorAll('svg').forEach(function(svg) {
      svg.style.width = '100%';
      svg.removeAttribute('height');
      svg.style.height = 'auto';
      svg.style.minHeight = '80px';
    });

    // Widen any fixed-height containers in the clone
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';

    titleEl.textContent = title;
    body.innerHTML = '';
    body.appendChild(clone);

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeExpandModal = function(e) {
    if (!e || e.target === document.getElementById('expand-modal-overlay')) {
      document.getElementById('expand-modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  // Escape key closes expand modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.getElementById('expand-modal-overlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  /* ── 6-Month Article History Modal ── */
  var _historyTopic = null;
  var _historyPeriod = 'all';

  window.openHistoryModal = function(topic, label) {
    _historyTopic = topic;
    _historyPeriod = 'all';
    document.getElementById('history-modal-title').textContent = label + ' — Article Archive';
    document.getElementById('history-modal-search').value = '';
    document.querySelectorAll('.history-filter-chip').forEach(function(c) {
      c.classList.toggle('active', c.dataset.period === 'all');
    });
    filterHistoryModal();
    var overlay = document.getElementById('history-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(function() { document.getElementById('history-modal-search').focus(); }, 100);
  };

  window.closeHistoryModal = function(e) {
    if (e && e.target !== document.getElementById('history-modal-overlay')) return;
    document.getElementById('history-modal-overlay').style.display = 'none';
  };

  window.setHistoryPeriod = function(btn, period) {
    _historyPeriod = period;
    document.querySelectorAll('.history-filter-chip').forEach(function(c) {
      c.classList.toggle('active', c === btn);
    });
    filterHistoryModal();
  };

  window.filterHistoryModal = function() {
    var q = document.getElementById('history-modal-search').value.toLowerCase().trim();
    var cutoff = '';
    if (_historyPeriod !== 'all') {
      var d = new Date();
      d.setDate(d.getDate() - parseInt(_historyPeriod));
      cutoff = d.toISOString().slice(0,10);
    }

    var articles = (typeof ALL_ARTICLES !== 'undefined') ? ALL_ARTICLES : [];
    var filtered = articles.filter(function(a) {
      if (_historyTopic && (a.topic || '').toLowerCase() !== _historyTopic.toLowerCase()) return false;
      if (cutoff && (a.first_seen || '') < cutoff) return false;
      if (!q) return true;
      return (a.title || '').toLowerCase().indexOf(q) !== -1 ||
             (a.snippet || '').toLowerCase().indexOf(q) !== -1 ||
             (a.source || '').toLowerCase().indexOf(q) !== -1;
    });

    filtered.sort(function(a,b) { return (b.first_seen||'').localeCompare(a.first_seen||''); });

    document.getElementById('history-modal-count').textContent = filtered.length + ' articles';

    var html = filtered.length ? filtered.map(function(a) {
      var badge = a.is_new ? '<span style="background:#EBF8FF;color:#1A56A0;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:600;margin-right:6px;">New</span>' : '';
      return '<div class="history-modal-article">' +
        '<div>' + badge + '<a href="' + _esc(a.url||'#') + '" target="_blank">' + _esc(a.title||'Untitled') + '</a></div>' +
        '<div class="history-modal-meta">' + _esc(a.source||'') + (a.pub_date ? ' &middot; ' + _esc(a.pub_date) : '') + '</div>' +
        (a.snippet ? '<div class="history-modal-snippet">' + _esc(a.snippet) + '</div>' : '') +
        '</div>';
    }).join('') : '<p style="color:var(--text-muted);text-align:center;padding:24px 0;">No articles found.</p>';

    document.getElementById('history-modal-body').innerHTML = html;
  };

  /* ── Updated global search — also searches 6-month article archive ── */
  // Extend handleSearch to show archive results when searching
  var _originalHandleSearch = window.handleSearch;
  window.handleSearch = function(query) {
    _originalHandleSearch(query);
    // When query is active, also populate history modal if open
    var overlay = document.getElementById('history-modal-overlay');
    if (overlay && overlay.style.display !== 'none') {
      filterHistoryModal();
    }
  };

})();
