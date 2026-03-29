/* filters.js — Article filter state, search, autocomplete, and apply-filters logic */
/* Depends on: APP_TOPICS, APP_TOPIC_SLUGS, ALL_ARTICLES (set by data bridge in dashboard.html) */
(function() {
  'use strict';

  // Guard against missing data-bridge globals (e.g. loaded on a page without pipeline data)
  var APP_TOPICS      = (typeof window.APP_TOPICS      !== 'undefined') ? window.APP_TOPICS      : [];
  var APP_TOPIC_SLUGS = (typeof window.APP_TOPIC_SLUGS !== 'undefined') ? window.APP_TOPIC_SLUGS : [];
  var ALL_ARTICLES    = (typeof window.ALL_ARTICLES    !== 'undefined') ? window.ALL_ARTICLES    : [];

  var state = {
    searchQuery: '',
    activeTopics: new Set(APP_TOPICS),
    urgencyFilter: 'ALL',
    newFilter: 'ALL',
    sortOrder: 'date',
    relFilter: 'relevant',
    minImpact: 0,
    allTopics: APP_TOPICS
  };

  /* ── Autocomplete ── */
  var _suggIdx = -1;

  window.handleSearchKeydown = function(e) {
    var box = document.getElementById('search-suggestions');
    var items = box ? box.querySelectorAll('.search-sugg-item') : [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _suggIdx = Math.min(_suggIdx + 1, items.length - 1);
      items.forEach(function(el, i) { el.classList.toggle('active', i === _suggIdx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _suggIdx = Math.max(_suggIdx - 1, -1);
      items.forEach(function(el, i) { el.classList.toggle('active', i === _suggIdx); });
    } else if (e.key === 'Enter' && _suggIdx >= 0 && items[_suggIdx]) {
      e.preventDefault();
      items[_suggIdx].click();
    } else if (e.key === 'Escape') {
      closeSuggestions();
      document.getElementById('search-input').blur();
    }
  };

  function closeSuggestions() {
    var box = document.getElementById('search-suggestions');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    _suggIdx = -1;
  }

  function buildSuggestions(q) {
    if (!q || q.length < 1) { closeSuggestions(); return; }
    var ql = q.toLowerCase();
    var suggestions = [];

    // 1. Topic name matches
    var topicCounts = {};
    ALL_ARTICLES.forEach(function(a) { topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1; });
    Object.keys(topicCounts).forEach(function(t) {
      if (t.toLowerCase().indexOf(ql) !== -1) {
        suggestions.push({ type: 'topic', label: t, count: topicCounts[t] });
      }
    });

    // 2. Source matches (unique sources containing query)
    var sourceCounts = {};
    ALL_ARTICLES.forEach(function(a) {
      if (a.source && a.source.toLowerCase().indexOf(ql) !== -1) {
        sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
      }
    });
    Object.keys(sourceCounts).slice(0, 3).forEach(function(s) {
      suggestions.push({ type: 'source', label: s, count: sourceCounts[s] });
    });

    // 3. Article title matches (up to 5)
    ALL_ARTICLES.filter(function(a) {
      return (a.title || '').toLowerCase().indexOf(ql) !== -1;
    }).slice(0, 5).forEach(function(a) {
      suggestions.push({ type: 'article', label: a.title, url: a.url });
    });

    // Render
    var box = document.getElementById('search-suggestions');
    if (!box) { return; }

    // Always append deep analysis option when query is long enough
    var deepItem = q.length >= 2 ? [{ type: 'deep', label: q }] : [];
    var allItems = suggestions.concat(deepItem);

    if (allItems.length === 0) { closeSuggestions(); return; }

    box.innerHTML = allItems.map(function(s, i) {
      if (s.type === 'deep') {
        var slug = s.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        var href = (APP_TOPIC_SLUGS.indexOf(slug) !== -1)
          ? ('deep-dives/' + slug + '.html')
          : ('deep-dives/viewer.html?q=' + encodeURIComponent(s.label));
        return '<div class="search-sugg-item deep-analysis" data-idx="' + i + '" data-type="deep" data-url="' + href + '">' +
          '<span class="search-sugg-type deep">AI</span>' +
          '<span class="search-sugg-text">Deep Analysis: ' + s.label + '</span>' +
          '<span class="deep-sugg-hint">full report &rarr;</span></div>';
      }
      var typeLabel = s.type;
      var countHtml = s.count ? '<span class="search-sugg-count">' + s.count + '</span>' : '';
      return '<div class="search-sugg-item" data-idx="' + i + '" data-type="' + s.type + '" data-label="' + s.label.replace(/"/g,'&quot;') + '" data-url="' + (s.url||'') + '">' +
        '<span class="search-sugg-type ' + s.type + '">' + typeLabel + '</span>' +
        '<span class="search-sugg-text">' + s.label + '</span>' +
        countHtml + '</div>';
    }).join('');
    box.style.display = 'block';
    _suggIdx = -1;

    box.querySelectorAll('.search-sugg-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var type = el.dataset.type;
        var label = el.dataset.label;
        if (type === 'deep' || (type === 'article' && el.dataset.url)) {
          window.location.href = el.dataset.url;
          closeSuggestions();
          return;
        }
        document.getElementById('search-input').value = label;
        handleSearch(label);
        closeSuggestions();
      });
    });
  }

  // Close suggestions when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#search-suggestions') && !e.target.closest('#search-input')) {
      closeSuggestions();
    }
  });

  /* ── Search ── */
  window.handleSearch = function(query) {
    buildSuggestions(query);
    var trimmed = query.trim();
    state.searchQuery = trimmed.toLowerCase();
    applyFilters();

    var btn = document.getElementById('deep-dive-btn');
    var countEl = document.getElementById('search-count');

    if (trimmed.length >= 2) {
      var slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      var href = (APP_TOPIC_SLUGS.indexOf(slug) !== -1)
        ? ('deep-dives/' + slug + '.html')
        : ('deep-dives/viewer.html?q=' + encodeURIComponent(trimmed));
      btn.href = href;
      btn.innerHTML = '&#9670; Deep Dive: ' + trimmed;
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
      btn.href = '#';
    }
  };

  /* ── Update search placeholder ── */
  (function() {
    var inp = document.getElementById('search-input');
    if (inp && ALL_ARTICLES.length > 0) {
      inp.placeholder = 'Search ' + ALL_ARTICLES.length.toLocaleString() + ' articles... ( / )';
    }
  })();

  /* ── Topic filter ── */
  window.toggleTopicFilter = function(btn, topic) {
    btn.classList.toggle('active');
    if (state.activeTopics.has(topic)) { state.activeTopics.delete(topic); }
    else { state.activeTopics.add(topic); }
    applyFilters();
  };

  /* ── Set single topic filter (used by cmd-strip chips) ── */
  window.setTopicFilter = function(topic) {
    state.activeTopics = new Set([topic]);
    document.querySelectorAll('.f-btn.topic-f').forEach(function(btn) {
      var t = btn.dataset.topic;
      if (t === topic) { btn.classList.add('active'); }
      else { btn.classList.remove('active'); }
    });
    applyFilters();
    var card = document.getElementById('section-' + topic);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.setAllTopics = function() {
    state.activeTopics = new Set(state.allTopics);
    document.querySelectorAll('.f-btn.topic-f').forEach(function(b) { b.classList.add('active'); });
    applyFilters();
  };

  /* ── Urgency filter ── */
  window.setUrgencyFilter = function(level, btn) {
    state.urgencyFilter = level;
    document.querySelectorAll('.f-btn[data-urgency]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    applyFilters();
  };

  /* ── Relevance filter ── */
  window.setRelFilter = function(mode, btn) {
    state.relFilter = mode;
    document.querySelectorAll('.f-btn[data-rel]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    applyFilters();
  };

  /* ── New-only filter ── */
  window.setNewFilter = function(mode, btn) {
    state.newFilter = mode;
    document.getElementById('btn-show-all').classList.toggle('active', mode === 'ALL');
    document.getElementById('btn-show-new').classList.toggle('active', mode === 'NEW');
    applyFilters();
  };

  /* ── Min impact filter ── */
  window.setMinImpact = function(min, btn) {
    state.minImpact = min;
    document.querySelectorAll('.f-btn[data-min-impact]').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.minImpact, 10) === min);
    });
    applyFilters();
  };

  /* ── Sort order ── */
  window.setSortOrder = function(order, btn) {
    state.sortOrder = order;
    document.getElementById('btn-sort-date').classList.toggle('active', order === 'date');
    document.getElementById('btn-sort-urgency').classList.toggle('active', order === 'urgency');
    var urgPri = {HIGH: 0, MEDIUM: 1, LOW: 2};
    document.querySelectorAll('.article-feed').forEach(function(feed) {
      var items = Array.from(feed.querySelectorAll('.article-item'));
      items.sort(function(a, b) {
        if (order === 'urgency') {
          var diff = (urgPri[a.dataset.urgency] || 2) - (urgPri[b.dataset.urgency] || 2);
          if (diff !== 0) return diff;
          return (b.dataset.date || '').localeCompare(a.dataset.date || '');
        } else {
          // date: NEW items always first, then by date descending
          var aNew = a.dataset.new === 'true' ? 0 : 1;
          var bNew = b.dataset.new === 'true' ? 0 : 1;
          if (aNew !== bNew) return aNew - bNew;
          return (b.dataset.date || '').localeCompare(a.dataset.date || '');
        }
      });
      items.forEach(function(item) { feed.appendChild(item); });
    });
  };

  /* ── Apply all active filters ── */
  function applyFilters() {
    var q = state.searchQuery;
    var visibleCount = 0;
    var totalCount = 0;

    /* Hide/show topic sections (cards) */
    document.querySelectorAll('.topic-section').forEach(function(section) {
      var topic = section.dataset.topic;
      if (topic) section.classList.toggle('topic-hidden', !state.activeTopics.has(topic));
    });

    /* Filter articles */
    document.querySelectorAll('.article-item').forEach(function(article) {
      totalCount++;
      var topic = article.dataset.topic;
      var urgency = article.dataset.urgency;
      var headline = article.dataset.headline || '';
      var summary = article.dataset.summary || '';
      var source = article.dataset.source || '';

      if (!state.activeTopics.has(topic)) { article.classList.add('hidden-by-search'); return; }

      var passUrgency = true;
      if (state.urgencyFilter === 'HIGH') passUrgency = urgency === 'HIGH';
      else if (state.urgencyFilter === 'MEDIUM') passUrgency = urgency === 'HIGH' || urgency === 'MEDIUM';

      var passNew = state.newFilter !== 'NEW' || article.dataset.new === 'true';

      var passImpact = true;
      if (state.minImpact > 0) {
        var score = parseFloat(article.dataset.adImpact || article.dataset.impact || '');
        passImpact = !isNaN(score) && score >= state.minImpact;
      }

      var rel = article.dataset.relevance || 'DIRECT';
      var passRel = state.relFilter === 'all'
        || (state.relFilter === 'relevant' && rel !== 'MONITOR')
        || (state.relFilter === 'direct' && rel === 'DIRECT');

      article.classList.toggle('hidden-by-urgency', !passUrgency);
      article.classList.toggle('hidden-by-new', !passNew);
      article.classList.toggle('hidden-by-relevance', !passRel || !passImpact);
      if (!passUrgency || !passNew || !passRel || !passImpact) { article.classList.remove('hidden-by-search'); }

      var passSearch = true;
      if (q) passSearch = headline.indexOf(q) !== -1 || summary.indexOf(q) !== -1 || source.indexOf(q) !== -1;
      article.classList.toggle('hidden-by-search', !passSearch);

      if (passUrgency && passNew && passRel && passImpact && passSearch && state.activeTopics.has(topic)) visibleCount++;
    });

    if (typeof highlightSearchMatches === 'function') highlightSearchMatches(q);

    var countEl = document.getElementById('search-count');
    if (q) {
      var archiveTotal = ALL_ARTICLES.filter(function(a) {
        return (a.title||'').toLowerCase().indexOf(q) !== -1 ||
               (a.snippet||'').toLowerCase().indexOf(q) !== -1 ||
               (a.source||'').toLowerCase().indexOf(q) !== -1;
      }).length;
      var corpus = ALL_ARTICLES.length || totalCount;
      countEl.textContent = archiveTotal.toLocaleString() + ' / ' + corpus.toLocaleString();
      countEl.title = archiveTotal + ' of ' + corpus + ' articles match';
    } else if (state.urgencyFilter !== 'ALL' || state.newFilter !== 'ALL' || state.relFilter !== 'all') {
      countEl.textContent = visibleCount + ' / ' + totalCount;
      countEl.title = '';
    } else {
      countEl.textContent = '';
      countEl.title = '';
    }
    var statEl = document.getElementById('stat-articles');
    if (statEl) statEl.textContent = visibleCount || totalCount;
  }

  window.applyFilters = applyFilters;

  /* ── Filter state persistence ── */
  var STORAGE_KEY = 'tunvara_filter_state';

  function saveFilterState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        urgencyFilter: state.urgencyFilter,
        sortOrder: state.sortOrder,
        relFilter: state.relFilter,
        activeTopics: Array.from(state.activeTopics)
        // newFilter and minImpact intentionally not persisted — they hide too much after a fresh run
      }));
    } catch(e) {}
  }

  function restoreFilterState() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;

      if (saved.urgencyFilter && saved.urgencyFilter !== 'ALL') {
        state.urgencyFilter = saved.urgencyFilter;
        document.querySelectorAll('.f-btn[data-urgency]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.urgency === saved.urgencyFilter);
        });
      }

      if (saved.relFilter && saved.relFilter !== 'relevant') {
        state.relFilter = saved.relFilter;
        document.querySelectorAll('.f-btn[data-rel]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.rel === saved.relFilter);
        });
      }

      if (saved.sortOrder && saved.sortOrder !== 'date') {
        state.sortOrder = saved.sortOrder;
        var btnDate = document.getElementById('btn-sort-date');
        var btnUrg = document.getElementById('btn-sort-urgency');
        if (btnDate) btnDate.classList.toggle('active', saved.sortOrder === 'date');
        if (btnUrg) btnUrg.classList.toggle('active', saved.sortOrder === 'urgency');
      }

      if (saved.activeTopics && Array.isArray(saved.activeTopics)) {
        var savedSet = new Set(saved.activeTopics);
        var hasChanges = false;
        state.allTopics.forEach(function(t) {
          if (!savedSet.has(t)) hasChanges = true;
        });
        if (hasChanges) {
          state.activeTopics = new Set(saved.activeTopics.filter(function(t) {
            return state.allTopics.indexOf(t) !== -1;
          }));
          document.querySelectorAll('.f-btn.topic-f').forEach(function(btn) {
            btn.classList.toggle('active', state.activeTopics.has(btn.dataset.topic));
          });
        }
      }

      applyFilters();
      if (saved.sortOrder && saved.sortOrder !== 'date') {
        var fakeBtn = document.getElementById('btn-sort-urgency');
        if (fakeBtn) setSortOrder(saved.sortOrder, fakeBtn);
      }
    } catch(e) {}
  }

  // Patch applyFilters to also save state
  var _origApply = applyFilters;
  applyFilters = function() { _origApply(); saveFilterState(); };
  window.applyFilters = applyFilters;

  // Restore on load (after a short delay to let DOM settle)
  setTimeout(restoreFilterState, 50);

  /* ── Search highlight ── */
  window.highlightSearchMatches = function(q) {
    document.querySelectorAll('.article-headline a').forEach(function(el) {
      var orig = el.dataset.origText || el.textContent;
      el.dataset.origText = orig;
      if (!q) { el.innerHTML = _esc(orig); return; }
      var idx = orig.toLowerCase().indexOf(q);
      if (idx === -1) { el.innerHTML = _esc(orig); return; }
      el.innerHTML = _esc(orig.slice(0, idx))
        + '<mark style="background:rgba(245,158,11,0.35);color:inherit;border-radius:2px;padding:0 1px;">'
        + _esc(orig.slice(idx, idx + q.length)) + '</mark>'
        + _esc(orig.slice(idx + q.length));
    });
  };

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Keyboard shortcuts ── */
  var _focusedIdx = -1;
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // / — focus search
    if (e.key === '/') {
      e.preventDefault();
      var inp = document.getElementById('search-input');
      if (inp) { inp.focus(); inp.select(); }
      return;
    }

    // j/k — navigate between visible articles
    if (e.key === 'j' || e.key === 'k') {
      var visible = Array.from(document.querySelectorAll(
        '.article-item:not(.hidden-by-search):not(.hidden-by-urgency):not(.hidden-by-new):not(.hidden-by-relevance):not(.hidden-by-date)'
      ));
      if (!visible.length) return;
      e.preventDefault();
      if (e.key === 'j') _focusedIdx = Math.min(_focusedIdx + 1, visible.length - 1);
      else _focusedIdx = Math.max(_focusedIdx - 1, 0);
      var el = visible[_focusedIdx];
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid var(--accent, #d64045)';
      el.style.outlineOffset = '2px';
      setTimeout(function() { el.style.outline = ''; el.style.outlineOffset = ''; }, 1200);
      return;
    }

    // Escape — clear search
    if (e.key === 'Escape') {
      var inp = document.getElementById('search-input');
      if (inp && inp.value) {
        inp.value = '';
        if (typeof handleSearch === 'function') handleSearch('');
      }
    }
  });

})();
