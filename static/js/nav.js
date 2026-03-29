/* nav.js — Sidebar, accordion, scroll, and section toggle behaviors */
/* Depends on: APP_TOPICS (set by inline data bridge in dashboard.html) */
(function() {
  'use strict';

  /* ── Mobile sidebar toggle ── */
  window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
  };

  /* ── Right-panel hide/show ── */
  window.toggleSidebarPanel = function() {
    var gridMain = document.querySelector('.grid-main');
    if (!gridMain) return;
    var hidden = gridMain.classList.toggle('sidebar-hidden');
    var btn = document.getElementById('sidebar-collapse-btn');
    if (btn) btn.style.cssText = hidden ? 'display:none' : '';
    var showBtn = document.getElementById('sidebar-show-btn');
    if (showBtn) showBtn.style.display = hidden ? 'block' : 'none';
  };

  /* ── Smooth scroll to section ── */
  window.scrollToSection = function(id) {
    var anchor = document.getElementById('anchor-' + id) || document.getElementById(id);
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Filter deadline list to a topic ── */
  window.filterDeadlinesByTopic = function(topicName) {
    document.querySelectorAll('.dl-item[data-topic]').forEach(function(card) {
      var t = (card.dataset.topic || '').toLowerCase();
      card.style.display = (!topicName || t === topicName) ? '' : 'none';
    });
  };

  /* ── Accordion: localStorage persistence ── */
  var ACCORDION_DEFAULTS = {};

  function loadAccordionState() {
    try {
      var saved = JSON.parse(localStorage.getItem('sidebarAccordion') || '{}');
      return Object.assign({}, ACCORDION_DEFAULTS, saved);
    } catch(e) { return Object.assign({}, ACCORDION_DEFAULTS); }
  }

  function saveAccordionState(st) {
    try { localStorage.setItem('sidebarAccordion', JSON.stringify(st)); } catch(e) {}
  }

  function applyAccordionState(st) {
    Object.keys(st).forEach(function(groupId) {
      var hdr = document.getElementById('rail-grp-' + groupId);
      var sub = document.getElementById('rail-sub-' + groupId);
      if (!hdr || !sub) return;
      if (st[groupId]) {
        hdr.classList.add('open');
        sub.classList.add('open');
      } else {
        hdr.classList.remove('open');
        sub.classList.remove('open');
      }
    });
  }

  window.toggleRailGroup = function(groupId, e) {
    if (document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', '0');
    }
    var hdr = document.getElementById('rail-grp-' + groupId);
    var sub = document.getElementById('rail-sub-' + groupId);
    if (!hdr || !sub) return;
    var nowOpen = hdr.classList.toggle('open');
    sub.classList.toggle('open', nowOpen);
    var st = loadAccordionState();
    st[groupId] = nowOpen;
    saveAccordionState(st);
  };

  /* Restore accordion state on load */
  applyAccordionState(loadAccordionState());

  /* ── Active group tracking on scroll ── */
  var RAIL_GROUP_SECTIONS = {
    'news':        APP_TOPICS.map(function(t){ return 'section-' + t; }),
    'deadlines':   ['section-deadlines'],
    'legislative': ['section-leg-activity', 'section-cross-state', 'section-changes'],
    'downloads':   ['section-archive']
  };

  function updateActiveRailLink() {
    var scrollY = window.scrollY + 80;
    var candidates = [];
    document.querySelectorAll('.rail-link[data-target]').forEach(function(link) {
      var el = document.getElementById(link.dataset.target);
      if (el) candidates.push({ type: 'link', el: el, node: link, top: el.offsetTop });
    });
    Object.keys(RAIL_GROUP_SECTIONS).forEach(function(groupId) {
      RAIL_GROUP_SECTIONS[groupId].forEach(function(sectionId) {
        var el = document.getElementById(sectionId);
        if (el) candidates.push({ type: 'group', el: el, node: document.getElementById('rail-grp-' + groupId), top: el.offsetTop });
      });
    });
    candidates.sort(function(a, b) { return a.top - b.top; });
    var active = candidates[0];
    for (var i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i].top <= scrollY) { active = candidates[i]; break; }
    }
    document.querySelectorAll('.rail-link.active').forEach(function(l) { l.classList.remove('active'); });
    document.querySelectorAll('.rail-group-header.active').forEach(function(h) { h.classList.remove('active'); });
    if (active && active.node) active.node.classList.add('active');
  }

  var scrollTick = false;
  window.addEventListener('scroll', function() {
    if (!scrollTick) {
      requestAnimationFrame(function() { updateActiveRailLink(); scrollTick = false; });
      scrollTick = true;
    }
  });
  updateActiveRailLink();

  /* ── Rail width collapse (persisted) ── */
  window.toggleSidebarPersist = function() {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
  };
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }

  /* ── Exec summary toggle (persisted) ── */
  window.toggleExec = function() {
    var panel = document.getElementById('exec-panel');
    panel.classList.toggle('exec-collapsed');
    var label = panel.querySelector('.exec-toggle-label');
    var isCollapsed = panel.classList.contains('exec-collapsed');
    if (label) label.textContent = isCollapsed ? 'expand' : 'collapse';
    localStorage.setItem('execCollapsed', isCollapsed ? '1' : '0');
  };
  if (localStorage.getItem('execCollapsed') === '1') {
    var _ep = document.getElementById('exec-panel');
    if (_ep) {
      _ep.classList.add('exec-collapsed');
      var _el = _ep.querySelector('.exec-toggle-label');
      if (_el) _el.textContent = 'expand';
    }
  }

  /* ── Deadlines toggle (persisted) ── */
  window.toggleDeadlines = function() {
    var panel = document.getElementById('section-deadlines');
    panel.classList.toggle('deadlines-collapsed');
    var label = panel.querySelector('.dl-toggle-label');
    var isCollapsed = panel.classList.contains('deadlines-collapsed');
    if (label) label.textContent = isCollapsed ? 'expand' : 'collapse';
    localStorage.setItem('deadlinesCollapsed', isCollapsed ? '1' : '0');
  };
  (function() {
    var panel = document.getElementById('section-deadlines');
    if (!panel) return;
    var stored = localStorage.getItem('deadlinesCollapsed');
    if (stored === '0') {
      panel.classList.remove('deadlines-collapsed');
      var label = panel.querySelector('.dl-toggle-label');
      if (label) label.textContent = 'collapse';
    }
  })();

  /* ── Topic Card expand/collapse ── */
  window.toggleTopicCard = function(card, e) {
    if (e.target.tagName === 'A') return;
    card.classList.toggle('expanded');
  };

  window.expandTopic = function(topicName) {
    var card = document.getElementById('section-' + topicName);
    if (!card) return;
    if (!card.classList.contains('expanded')) {
      card.classList.add('expanded');
    }
    setTimeout(function() {
      var rect = card.getBoundingClientRect();
      var offset = rect.top + window.scrollY - 70;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }, 30);
  };

})();
