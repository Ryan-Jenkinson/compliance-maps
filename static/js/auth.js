/* auth.js — Supabase session management for tunvara
 * Reads window.SUPABASE_URL and window.SUPABASE_ANON_KEY (injected by Jinja2 renderer).
 * Call checkAuth() at the top of every protected page's inline script.
 */

let _client = null;
let _profile = null;

function _getClient() {
  if (!_client) {
    _client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return _client;
}

/**
 * Check for a valid Supabase session. Redirects to loginUrl if none.
 * If allowedRoles is provided, redirects to dashboard.html if role doesn't match.
 * Returns { session, profile } on success, null if redirecting.
 */
async function checkAuth(options) {
  var opts = options || {};
  var allowedRoles = opts.allowedRoles || null;
  var loginUrl = opts.loginUrl || 'login.html';
  var sb = _getClient();

  var result = await sb.auth.getSession();
  var session = result.data.session;
  if (!session) {
    window.location.replace(loginUrl);
    return null;
  }

  var profileResult = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (profileResult.error || !profileResult.data) {
    await sb.auth.signOut();
    window.location.replace(loginUrl);
    return null;
  }

  _profile = profileResult.data;

  if (allowedRoles && allowedRoles.indexOf(_profile.role) === -1) {
    window.location.replace('dashboard.html');
    return null;
  }

  return { session: session, profile: _profile };
}

async function signIn(email, password) {
  return _getClient().auth.signInWithPassword({ email: email, password: password });
}

async function signOut() {
  await _getClient().auth.signOut();
  window.location.replace('login.html');
}

function getProfile() {
  return _profile;
}

function getClient() {
  return _getClient();
}

/** Populate the topbar user display. Call after checkAuth() succeeds. */
function populateTopbar() {
  if (!_profile) return;
  var nameEl = document.getElementById('user-name');
  var adminLink = document.getElementById('admin-link');
  if (nameEl) nameEl.textContent = _profile.full_name || _profile.email;
  if (adminLink && (_profile.role === 'admin' || _profile.role === 'super_admin')) {
    adminLink.style.display = 'inline-block';
  }
}
