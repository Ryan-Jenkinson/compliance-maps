/* trending.js — "Most Active Discussions" widget in the dashboard right rail
 * Combines comment activity + save activity from the last 7 days.
 * No Supabase RPC needed — two lightweight client-side queries.
 */

async function initTrending() {
  var sb = window._client || (typeof getClient === 'function' && getClient());
  if (!sb) return;

  var since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent comments and saves in parallel
  var [commentsRes, savesRes] = await Promise.all([
    sb.from('comments')
      .select('target_url, target_title')
      .gte('created_at', since)
      .eq('target_type', 'article')
      .limit(500),
    sb.from('saved_articles')
      .select('article_url, article_title')
      .gte('saved_at', since)
      .limit(500),
  ]);

  // Tally counts per URL
  var commentCounts = {};
  var saveCounts = {};
  var titles = {};

  for (var row of (commentsRes.data || [])) {
    commentCounts[row.target_url] = (commentCounts[row.target_url] || 0) + 1;
    if (row.target_title && !titles[row.target_url]) titles[row.target_url] = row.target_title;
  }
  for (var row of (savesRes.data || [])) {
    saveCounts[row.article_url] = (saveCounts[row.article_url] || 0) + 1;
    if (row.article_title && !titles[row.article_url]) titles[row.article_url] = row.article_title;
  }

  // Merge all URLs
  var allUrls = new Set([...Object.keys(commentCounts), ...Object.keys(saveCounts)]);
  var items = [];
  allUrls.forEach(function(url) {
    var c = commentCounts[url] || 0;
    var s = saveCounts[url] || 0;
    items.push({ url: url, title: titles[url] || url, comments: c, saves: s, total: c + s });
  });
  items.sort(function(a, b) { return b.total - a.total; });

  _renderTrendingWidget(items.slice(0, 7));
}

function _popArticleClick(el) {
  var url = el.dataset.popUrl;
  var title = el.dataset.popTitle;
  if (typeof openArticleDetail === 'function') {
    openArticleDetail({ url: url, title: title, topic: '', source: '', summary: '', urgency: 'LOW', relevance: '', relevanceReason: '', impact: '' });
  }
}

function _renderTrendingWidget(items) {
  var el = document.getElementById('popular-articles-widget');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);">No activity in the last 7 days.</div>';
    return;
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  el.innerHTML = items.map(function(item) {
    var short = item.title.length > 60 ? item.title.slice(0, 57) + '\u2026' : item.title;
    var pills = '';
    if (item.comments > 0) pills += '<span style="background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.25);border-radius:8px;padding:1px 6px;font-family:var(--mono);font-size:10px;font-weight:600;white-space:nowrap;">&#128172;&nbsp;' + item.comments + '</span>';
    if (item.saves > 0)    pills += '<span style="background:rgba(56,161,105,0.12);color:#68d391;border:1px solid rgba(56,161,105,0.2);border-radius:8px;padding:1px 6px;font-family:var(--mono);font-size:10px;font-weight:600;white-space:nowrap;">&#128278;&nbsp;' + item.saves + '</span>';
    return '<div data-pop-url="' + esc(item.url) + '" data-pop-title="' + esc(item.title) + '" onclick="_popArticleClick(this)"'
         + ' style="padding:8px 14px;border-bottom:1px solid var(--border-light);cursor:pointer;"'
         + ' onmouseover="this.style.background=\'var(--hover)\'" onmouseout="this.style.background=\'\'">'
         + '<div style="font-size:12px;line-height:1.4;color:var(--text-secondary);margin-bottom:5px;">' + esc(short) + '</div>'
         + '<div style="display:flex;gap:5px;flex-wrap:wrap;">' + pills + '</div>'
         + '</div>';
  }).join('');
}
