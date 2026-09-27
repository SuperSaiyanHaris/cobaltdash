// Profile comments: posting, handles, removal and the admin queue.
// Reads, votes and reports go straight to Supabase under RLS (see
// supabase/migrations/20260927_creator_comments.sql); everything that creates
// or changes a comment comes through here so the word filter always runs
// first. No paid services: comments post instantly once they pass, and the
// owner reviews new ones in /admin (Comments > To review).

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './_ratelimit.js';
import { isFromOurSite, ALLOWED_ORIGINS } from './_guard.js';
import { localCheck, handleProblem, MESSAGES } from './_moderation.js';
import { grantAction, revokeAction } from './_xp.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const DAILY_LIMIT = 20;

function db() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function userFrom(req, supabase) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error ? null : data.user;
}

const fail = (res, status, message, extra = {}) => res.status(status).json({ error: message, ...extra });
// Escape LIKE wildcards: handles can contain "_".
const likeEscape = (s) => s.replace(/[_%\\]/g, (c) => `\\${c}`);

async function postComment(res, supabase, user, { creatorId, body, parentId }) {
  const text = String(body ?? '').trim();
  if (!creatorId) return fail(res, 400, 'Missing creator.');

  const local = localCheck(text);
  if (local) return fail(res, 422, local.message, { reason: local.reason });

  const { data: profile } = await supabase.from('commenter_profiles').select('handle, banned_at').eq('user_id', user.id).maybeSingle();
  if (!profile) return fail(res, 409, 'Pick a public name first.', { needsHandle: true });
  if (profile.banned_at) return fail(res, 403, "Your account can't post comments.");

  const { data: creator } = await supabase.from('creators').select('id').eq('id', creatorId).maybeSingle();
  if (!creator) return fail(res, 404, 'Creator not found.');

  // Replies are one level deep: the parent must be a visible top-level
  // comment on the same creator.
  if (parentId) {
    const { data: parent } = await supabase.from('creator_comments').select('id, creator_id, parent_id, status').eq('id', parentId).maybeSingle();
    if (!parent || parent.creator_id !== creatorId || parent.parent_id || parent.status !== 'visible') return fail(res, 404, 'That comment is gone.');
  }

  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: recent } = await supabase.from('creator_comments').select('body').eq('user_id', user.id).gte('created_at', since).limit(DAILY_LIMIT + 1);
  if ((recent?.length || 0) >= DAILY_LIMIT) return fail(res, 429, "That's the limit for today. Try again tomorrow.");
  if (recent?.some((r) => r.body.trim().toLowerCase() === text.toLowerCase())) return fail(res, 422, MESSAGES.duplicate, { reason: 'duplicate' });

  const { data: follow } = await supabase.from('user_saved_creators').select('id').eq('user_id', user.id).eq('creator_id', creatorId).maybeSingle();
  const { data: row, error } = await supabase.from('creator_comments').insert({
    creator_id: creatorId,
    user_id: user.id,
    parent_id: parentId || null,
    body: text,
    status: 'visible',
    follows_creator: !!follow,
  }).select('id, creator_id, user_id, parent_id, body, status, follows_creator, up_count, down_count, created_at').single();
  if (error) return fail(res, 500, "Couldn't post that. Try again.");
  // ShinyPass: 15 XP, up to 5 comments a day, taken back if it's removed.
  const xp = await grantAction(supabase, user.id, 'comment', row.id);
  return res.status(201).json({ comment: { ...row, commenter_profiles: { handle: profile.handle } }, xpGranted: xp !== null });
}

async function setHandle(res, supabase, user, { handle }, isAdmin) {
  const h = String(handle ?? '').trim().toLowerCase();
  const problem = handleProblem(h, { allowReserved: isAdmin });
  if (problem) return fail(res, 422, problem);

  const { data: mine } = await supabase.from('commenter_profiles').select('banned_at').eq('user_id', user.id).maybeSingle();
  if (mine?.banned_at) return fail(res, 403, "Your account can't post comments.");

  const { data: taken } = await supabase.from('commenter_profiles').select('user_id').ilike('handle', likeEscape(h)).maybeSingle();
  if (taken && taken.user_id !== user.id) return fail(res, 409, 'That name is taken. Try another.');

  const { data: u } = await supabase.from('users').select('avatar_url').eq('id', user.id).maybeSingle();
  const { error } = await supabase.from('commenter_profiles').upsert({ user_id: user.id, handle: h, avatar_url: u?.avatar_url || null });
  if (error) return fail(res, 500, "Couldn't save that name. Try again.");
  return res.status(200).json({ handle: h });
}

async function removeOwn(res, supabase, user, { id }) {
  const { data, error } = await supabase.from('creator_comments').update({ status: 'removed' }).eq('id', id).eq('user_id', user.id).select('id');
  if (error || !data?.length) return fail(res, 404, 'Comment not found.');
  await revokeAction(supabase, user.id, 'comment', id);
  return res.status(200).json({ ok: true });
}

// Replies to the signed-in person: replies under their comments, plus
// replies anywhere that @mention their handle. count=1 returns just the
// unread number (for the account menu).
async function repliesFor(res, supabase, user, countOnly) {
  const { data: me } = await supabase.from('commenter_profiles').select('handle, replies_seen_at').eq('user_id', user.id).maybeSingle();
  if (!me) return res.status(200).json({ unread: 0, replies: [] });
  const cols = 'id, body, created_at, parent_id, commenter_profiles(handle, avatar_url), creators(platform, username, display_name)';
  const [underMine, mentions] = await Promise.all([
    supabase.from('creator_comments').select(`${cols}, parent:creator_comments!parent_id!inner(user_id)`).eq('parent.user_id', user.id)
      .neq('user_id', user.id).eq('status', 'visible').order('created_at', { ascending: false }).limit(30),
    supabase.from('creator_comments').select(cols).not('parent_id', 'is', null).ilike('body', `%@${likeEscape(me.handle)}%`)
      .neq('user_id', user.id).eq('status', 'visible').order('created_at', { ascending: false }).limit(30),
  ]);
  const seen = new Map();
  for (const r of [...(underMine.data || []), ...(mentions.data || [])]) if (!seen.has(r.id)) { const { parent, ...rest } = r; seen.set(r.id, rest); }
  const replies = [...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
  const unread = replies.filter((r) => new Date(r.created_at) > new Date(me.replies_seen_at)).length;
  return res.status(200).json(countOnly ? { unread } : { unread, replies, seenAt: me.replies_seen_at });
}

async function markRepliesSeen(res, supabase, user) {
  await supabase.from('commenter_profiles').update({ replies_seen_at: new Date().toISOString() }).eq('user_id', user.id);
  return res.status(200).json({ ok: true });
}

// A comment needs a look when it has reports or is heavily downvoted; those
// sort to the top of the review list.
const needsLook = (c) => c.report_count > 0 || c.status === 'hidden' || (c.down_count >= 5 && c.down_count > c.up_count * 2);

async function adminQueue(res, supabase) {
  const cols = 'id, creator_id, user_id, parent_id, body, status, reviewed, up_count, down_count, report_count, created_at, commenter_profiles(handle), creators(platform, username, display_name)';
  const [review, removed, banned] = await Promise.all([
    supabase.from('creator_comments').select(cols).eq('reviewed', false).neq('status', 'removed').order('created_at', { ascending: false }).limit(200),
    supabase.from('creator_comments').select(cols).eq('status', 'hidden').eq('reviewed', true).order('created_at', { ascending: false }).limit(100),
    supabase.from('commenter_profiles').select('user_id, handle, banned_at').not('banned_at', 'is', null).order('banned_at', { ascending: false }).limit(200),
  ]);
  const toReview = (review.data || []).map((c) => ({ ...c, flagged: needsLook(c) }))
    .sort((a, b) => (b.flagged - a.flagged) || (new Date(b.created_at) - new Date(a.created_at)));
  return res.status(200).json({ review: toReview, removed: removed.data || [], banned: banned.data || [] });
}

// Ban: stops the account commenting, replying, voting and reporting, and
// takes down everything they've posted (restorable one by one from Removed).
async function setBan(res, supabase, { userId, banned }) {
  if (!userId) return fail(res, 400, 'Missing user.');
  const { error } = await supabase.from('commenter_profiles').update({ banned_at: banned ? new Date().toISOString() : null }).eq('user_id', userId);
  if (error) return fail(res, 500, "Couldn't update that account.");
  let removed = 0;
  if (banned) {
    const { data } = await supabase.from('creator_comments').update({ status: 'hidden', reviewed: true })
      .eq('user_id', userId).in('status', ['visible', 'held']).select('id');
    removed = data?.length || 0;
  }
  return res.status(200).json({ ok: true, removed });
}

// "Looks fine" shows it and marks it reviewed; "Remove" hides it and marks it
// reviewed; "Restore" brings a removed one back.
async function moderate(res, supabase, { id, status }) {
  if (!['visible', 'hidden'].includes(status)) return fail(res, 400, 'Bad status.');
  const { data: rows, error } = await supabase.from('creator_comments').update({ status, reviewed: true }).eq('id', id).select('user_id');
  if (error) return fail(res, 500, "Couldn't update that comment.");
  if (status === 'hidden' && rows?.[0]) await revokeAction(supabase, rows[0].user_id, 'comment', id);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isFromOurSite(req)) return fail(res, 403, 'Forbidden');
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Method not allowed');

  const supabase = db();
  const user = await userFrom(req, supabase);
  if (!user) return fail(res, 401, 'Sign in to comment.');

  const burst = checkRateLimit(`comments:${user.id}`, 6, 60000);
  if (!burst.allowed) return fail(res, 429, "You're going fast. Try again in a minute.");

  const isAdmin = ADMIN_EMAILS.includes((user.email || '').toLowerCase());
  if (req.method === 'GET') {
    if (req.query?.admin === 'queue' && isAdmin) return adminQueue(res, supabase);
    if (req.query?.replies) return repliesFor(res, supabase, user, req.query.replies === 'count');
    return fail(res, 400, 'Bad request');
  }

  const body = req.body || {};
  switch (body.action) {
    case 'post': return postComment(res, supabase, user, body);
    case 'handle': return setHandle(res, supabase, user, body, isAdmin);
    case 'remove': return removeOwn(res, supabase, user, body);
    case 'replies_seen': return markRepliesSeen(res, supabase, user);
    case 'moderate': return isAdmin ? moderate(res, supabase, body) : fail(res, 403, 'Forbidden');
    case 'ban': return isAdmin && body.userId !== user.id ? setBan(res, supabase, body) : fail(res, 403, 'Forbidden');
    default: return fail(res, 400, 'Bad request');
  }
}
