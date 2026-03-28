/* messages.js — Unread DM badge in topbar (loaded on dashboard + topic pages) */

async function initMessagesBadge(supabaseClient, userId) {
  await _refreshUnreadBadge(supabaseClient, userId);

  // Realtime: increment badge on new incoming message
  supabaseClient.channel('dm-badge')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `recipient_id=eq.${userId}`
    }, () => _refreshUnreadBadge(supabaseClient, userId))
    .subscribe();
}

async function _refreshUnreadBadge(sb, userId) {
  const { count } = await sb.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  const badge = document.getElementById('dm-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}
