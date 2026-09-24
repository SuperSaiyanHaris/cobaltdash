// Vercel Cron: emails about the creators each user follows.
//
//   /api/cron/digest?type=weekly      Mondays: every followed creator's
//                                     7-day change + milestones crossed
//   /api/cron/digest?type=milestones  Daily: only when a followed creator
//                                     crossed a milestone in the last day
//
// Preferences live in auth user_metadata (PREFS in api/_email.js; toggled on
// the Account page or via the signed unsubscribe link). A per-user "last sent"
// marker in app_metadata (admin-only) makes a retried or doubled cron
// invocation a no-op instead of a second email.

import { createClient } from '@supabase/supabase-js';
import { PREFS, SITE_URL, emailShell, ctaButton, escapeHtml, sendEmail, unsubscribeUrl } from '../_email.js';

const METRIC = { youtube: 'subscribers', kick: 'paid subs', music: 'monthly listeners', substack: 'subscribers' };
const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', mastodon: 'Mastodon', music: 'Music', substack: 'Substack', rumble: 'Rumble' };
const MAX_ROWS = 12;

const fmt = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(n).toLocaleString('en-US');
};
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const dayStr = (d) => d.toISOString().slice(0, 10);

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

async function fetchAll(sb, table, select, apply, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < page) return out;
  }
}

async function inChunks(ids, size, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

async function pooled(items, limit, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await worker(item); }
  }));
}

function creatorRow(c, change, milestones) {
  const metric = METRIC[c.platform] || 'followers';
  const color = change.delta > 0 ? '#059669' : change.delta < 0 ? '#dc2626' : '#78716c';
  const pct = change.from > 0 ? ` (${change.delta >= 0 ? '+' : ''}${((change.delta / change.from) * 100).toFixed(2)}%)` : '';
  const ms = milestones.map((m) => `<span style="display:inline-block;margin:6px 6px 0 0;padding:3px 9px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;border-radius:999px;">Crossed ${fmt(m.threshold)}</span>`).join('');
  return `<tr><td style="padding:12px 0;border-top:1px solid #f0efed;">
    <a href="${SITE_URL}/${c.platform}/${encodeURIComponent(c.username)}" style="font-size:14px;font-weight:600;color:#1c1917;text-decoration:none;">${escapeHtml(c.display_name || c.username)}</a>
    <span style="font-size:12px;color:#a8a29e;"> &middot; ${PLATFORM[c.platform] || c.platform}</span>
    <div style="font-size:13px;color:#57534e;margin-top:2px;">${fmt(change.to)} ${metric} &nbsp;<span style="color:${color};font-weight:600;">${signed(change.delta)}${pct}</span></div>
    ${ms}
  </td></tr>`;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET not configured' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const type = req.query?.type;
  if (!PREFS[type]) return res.status(400).json({ error: 'type must be weekly or milestones' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'RESEND_API_KEY not configured' });

  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const runKey = type === 'weekly' ? isoWeek(now) : dayStr(now);
  const markerKey = type === 'weekly' ? 'digest_last_week' : 'milestone_alert_last_day';

  // --- Who follows what -------------------------------------------------------
  const follows = await fetchAll(sb, 'user_saved_creators', 'user_id, creator_id', (q) => q.order('id'));
  const byUser = new Map();
  for (const f of follows) {
    if (!byUser.has(f.user_id)) byUser.set(f.user_id, new Set());
    byUser.get(f.user_id).add(f.creator_id);
  }
  const creatorIds = [...new Set(follows.map((f) => f.creator_id))];
  if (!creatorIds.length) return res.status(200).json({ type, users: 0, sent: 0 });

  const creators = new Map((await inChunks(creatorIds, 200, async (ids) => {
    const { data, error } = await sb.from('creators').select('id, platform, username, display_name').in('id', ids);
    if (error) throw new Error(`creators: ${error.message}`);
    return data || [];
  })).map((c) => [c.id, c]));

  // --- Milestones --------------------------------------------------------------
  const msSince = type === 'weekly' ? new Date(now - 7 * 86400000) : new Date(now - 26 * 3600000);
  const milestones = await inChunks(creatorIds, 200, async (ids) => {
    const { data, error } = await sb.from('creator_milestones')
      .select('creator_id, threshold, crossed_at, created_at')
      .in('creator_id', ids)
      .gte('created_at', msSince.toISOString());
    if (error) throw new Error(`creator_milestones: ${error.message}`);
    return data || [];
  });
  const msByCreator = new Map();
  for (const m of milestones) {
    if (!msByCreator.has(m.creator_id)) msByCreator.set(m.creator_id, []);
    msByCreator.get(m.creator_id).push(m);
  }

  // --- 7-day change per creator (weekly only) --------------------------------
  const change = new Map();
  if (type === 'weekly') {
    const since = dayStr(new Date(now - 8 * 86400000));
    // 25 creators x ~8 days stays under PostgREST's 1,000-row response cap
    // even if a creator has more than one reading on some days.
    const rows = await inChunks(creatorIds, 25, async (ids) => {
      const { data, error } = await sb.from('creator_stats')
        .select('creator_id, subscribers, recorded_at')
        .in('creator_id', ids)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(1000);
      if (error) throw new Error(`creator_stats: ${error.message}`);
      return data || [];
    });
    for (const r of rows) {
      if (r.subscribers == null) continue;
      const c = change.get(r.creator_id);
      if (!c) change.set(r.creator_id, { from: r.subscribers, to: r.subscribers, delta: 0 });
      else { c.to = r.subscribers; c.delta = c.to - c.from; }
    }
  }

  // --- Build + send per user -------------------------------------------------
  let sent = 0, skipped = 0, failed = 0;
  await pooled([...byUser.entries()], 5, async ([userId, ids]) => {
    try {
      const followed = [...ids].map((id) => creators.get(id)).filter(Boolean);
      const withMs = followed.filter((c) => msByCreator.has(c.id));
      let rows = [];
      if (type === 'weekly') {
        rows = followed.filter((c) => change.has(c.id))
          .sort((a, b) => (msByCreator.has(b.id) - msByCreator.has(a.id)) || Math.abs(change.get(b.id).delta / (change.get(b.id).from || 1)) - Math.abs(change.get(a.id).delta / (change.get(a.id).from || 1)));
        if (!rows.length || (!withMs.length && rows.every((c) => change.get(c.id).delta === 0))) { skipped++; return; }
      } else if (!withMs.length) { skipped++; return; }

      const { data: { user } = {}, error } = await sb.auth.admin.getUserById(userId);
      if (error || !user?.email || !user.email_confirmed_at) { skipped++; return; }
      if (user.banned_until && new Date(user.banned_until) > now) { skipped++; return; }
      if (user.user_metadata?.[PREFS[type]]) { skipped++; return; }
      if (user.app_metadata?.[markerKey] === runKey) { skipped++; return; }

      const unsub = unsubscribeUrl(userId, type);
      let subject, content, reason;
      if (type === 'weekly') {
        const top = rows[0];
        const tc = change.get(top.id);
        subject = withMs.length
          ? `${withMs[0].display_name || withMs[0].username} crossed ${fmt(msByCreator.get(withMs[0].id)[0].threshold)} this week`
          : `${top.display_name || top.username} ${tc.delta >= 0 ? 'gained' : 'lost'} ${fmt(Math.abs(tc.delta))} this week`;
        const tableRows = rows.slice(0, MAX_ROWS).map((c) => creatorRow(c, change.get(c.id), msByCreator.get(c.id) || [])).join('');
        const more = rows.length > MAX_ROWS ? `<p style="margin:12px 0 0;font-size:13px;color:#78716c;">+${rows.length - MAX_ROWS} more on your dashboard.</p>` : '';
        content = `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1c1917;">Your creators this week</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#78716c;">How the ${followed.length === 1 ? 'creator' : `${followed.length} creators`} you follow moved over the last 7 days.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tableRows}</table>${more}
          <div style="margin-top:24px;">${ctaButton(`${SITE_URL}/dashboard`, 'Open your dashboard')}</div>`;
        reason = "You're getting this weekly summary because you follow creators on ShinyPull.";
      } else {
        const first = withMs[0];
        subject = withMs.length === 1
          ? `${first.display_name || first.username} just crossed ${fmt(msByCreator.get(first.id)[0].threshold)} ${METRIC[first.platform] || 'followers'}`
          : `${withMs.length} creators you follow hit milestones`;
        const items = withMs.map((c) => msByCreator.get(c.id).map((m) =>
          `<tr><td style="padding:12px 0;border-top:1px solid #f0efed;font-size:14px;color:#1c1917;">
            <a href="${SITE_URL}/${c.platform}/${encodeURIComponent(c.username)}" style="font-weight:600;color:#1c1917;text-decoration:none;">${escapeHtml(c.display_name || c.username)}</a>
            crossed <strong>${fmt(m.threshold)} ${METRIC[c.platform] || 'followers'}</strong> on ${PLATFORM[c.platform] || c.platform}</td></tr>`).join('')).join('');
        content = `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1c1917;">Milestone reached</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
          <div style="margin-top:24px;">${ctaButton(`${SITE_URL}/milestones`, 'See all milestones')}</div>`;
        reason = "You're getting this because a creator you follow on ShinyPull hit a milestone.";
      }

      await sendEmail({ to: user.email, subject, html: emailShell({ contentHtml: content, unsubUrl: unsub, reason }), unsubUrl: unsub });
      await sb.auth.admin.updateUserById(userId, { app_metadata: { ...user.app_metadata, [markerKey]: runKey } });
      sent++;
    } catch (err) {
      failed++;
      console.error(`digest(${type}) user ${userId}:`, err.message);
    }
  });

  const summary = { type, runKey, users: byUser.size, sent, skipped, failed };
  console.log('digest', JSON.stringify(summary));
  return res.status(failed && !sent ? 500 : 200).json(summary);
}
