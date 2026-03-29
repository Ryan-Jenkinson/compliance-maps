/* ui.js — Cross-state tabs, timeline clustering, resizable sidebar, Lucide init, widget prefs */

(function() {
  'use strict';

  /* ── Cross-state tab switcher ── */
  window.csDashTabShow = function(topic) {
    document.querySelectorAll('.cs-dash-panel').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.cs-dash-tab').forEach(function(el) { el.classList.remove('active'); });
    var panel = document.querySelector('.cs-dash-panel[data-cs-panel="' + topic + '"]');
    var tab = document.querySelector('.cs-dash-tab[data-cs-topic="' + topic + '"]');
    if (panel) panel.classList.add('active');
    if (tab) tab.classList.add('active');
  };

  /* ── Lucide icon init ── */
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  /* ── Resizable sidebar ── */
  (function() {
    var handle = document.getElementById('sidebar-resize-handle');
    var sidebar = document.getElementById('grid-sidebar');
    if (!handle || !sidebar) return;
    var dragging = false, startX, startW;

    handle.addEventListener('mousedown', function(e) {
      dragging = true;
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var dx = startX - e.clientX;
      var newW = Math.max(240, Math.min(600, startW + dx));
      sidebar.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
    });
    var savedW = localStorage.getItem('sidebarWidth');
    if (savedW) sidebar.style.width = savedW + 'px';
  })();

  /* ── Timeline Dot Clustering ── */
  (function() {
    var THRESHOLD = 5; // cluster dots within 5% of each other
    document.querySelectorAll('.tl-track').forEach(function(track) {
      var dots = Array.from(track.querySelectorAll('.tl-dot'));
      if (dots.length < 2) return;
      dots.sort(function(a, b) { return parseFloat(a.dataset.tlPct) - parseFloat(b.dataset.tlPct); });
      var groups = [], cur = [dots[0]];
      for (var i = 1; i < dots.length; i++) {
        if (parseFloat(dots[i].dataset.tlPct) - parseFloat(dots[i-1].dataset.tlPct) < THRESHOLD) {
          cur.push(dots[i]);
        } else { groups.push(cur); cur = [dots[i]]; }
      }
      groups.push(cur);
      groups.forEach(function(group) {
        if (group.length < 2) return;
        var hasHigh = group.some(function(d) { return d.dataset.urgency === 'HIGH'; });
        var hasMed  = group.some(function(d) { return d.dataset.urgency === 'MEDIUM'; });
        var color   = hasHigh ? 'var(--red)' : hasMed ? 'var(--amber)' : 'var(--green)';
        var avgPct  = group.reduce(function(s, d) { return s + parseFloat(d.dataset.tlPct); }, 0) / group.length;
        var tipHtml = group.map(function(d) {
          return '<b>' + (d.dataset.title || '') + '</b><br>' + (d.dataset.date || '') + ' &middot; ' + (d.dataset.days || '') + 'd &middot; ' + (d.dataset.urgency || '');
        }).join('<hr>');
        group.forEach(function(d) { d.style.display = 'none'; });
        var badge = document.createElement('div');
        badge.className = 'tl-cluster-badge';
        badge.style.cssText = 'left:' + avgPct + '%;background:' + color + ';';
        badge.innerHTML = group.length + '<span class="tl-tip">' + tipHtml + '</span>';
        track.appendChild(badge);
      });
    });
  })();

})();
