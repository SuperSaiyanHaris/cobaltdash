// Profile comments: posting, handles, removal and the admin queue.
// Reads, votes and reports go straight to Supabase under RLS (see
// supabase/migrations/20260927_creator_comments.sql); everything that creates
// or changes a comment comes through here so it's always moderated first.

import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './_ratelimit.js';
import { isFromOurSite, ALLOWED_ORIGINS } from './_guard.js';
import { localCheck, handleProblem, classify, MESSAGES } from './_moderation.js';

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

async function postComment(res, supabase, user, { creatorId, body }) {
  const text = String(body ?? '').trim();
  if (!creatorId) return fail(res, 400, 'Missing creator.');

  const { data: profile } = await supabase.from('commenter_profiles').select('handle').eq('user_id', user.id).maybeSingle();
  if (!profile) return fail(res, 409, 'Pick a public name first.', { needsHandle: true });

  const { data: creator } = await supabase.from('creators').select('id, display_name, username').eq('id', creatorId).maybeSingle();
  if (!creator) return fail(res, 404, 'Creator not found.');

  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: recent } = await supabase.from('creator_comments').select('body').eq('user_id', user.id).gte('created_at', since).limit(DAILY_LIMIT + 1);
  if ((recent?.length || 0) >= DAILY_LIMIT) return fail(res, 429, "That's the limit for today. Try again tomorrow.");
  if (recent?.some((r) => r.body.trim().toLowerCase() === text.toLowerCase())) return fail(res, 422, MESSAGES.duplicate, { reason: 'duplicate' });

  const local = localCheck(text);
  if (local) return fail(res, 422, local.message, { reason: local.reason });

  const verdict = await classify(text, { creatorName: creator.display_name || creator.username });
  if (verdict.category && verdict.category !== 'none') {
    return fail(res, 422, MESSAGES[verdict.category] || MESSAGES.harassment, { reason: verdict.category });
  }
  // Classifier couldn't vouch for it (down, timed out): hold for review, never post unchecked.
  const status = verdict.category === 'none' ? 'visible' : 'held';

  const { data: follow } = await supabase.from('user_saved_creators').select('id').eq('user_id', user.id).eq('creator_id', creatorId).maybeSingle();
  const { data: row, error } = await supabase.from('creator_comments').insert({
    creator_id: creatorId,
    user_id: user.id,
    body: text,
    status,
    follows_creator: !!follow,
    moderation: verdict.category ? { category: 'none' } : { error: verdict.error },
  }).select('id, creator_id, user_id, body, status, follows_creator, up_count, down_count, created_at').single();
  if (error) return fail(res, 500, "Couldn't post that. Try again.");
  return res.status(201).json({ comment: { ...row, commenter_profiles: { handle: profile.handle } } });
}

async function setHandle(res, supabase, user, { handle }) {
  const h = String(handle ?? '').trim().toLowerCase();
  const problem = handleProblem(h);
  if (problem) return fail(res, 422, problem);
  const verdict = await classify(`Username: ${h}`);
  if (verdict.category && verdict.category !== 'none') return fail(res, 422, "That name isn't available.");

  const { data: taken } = await supabase.from('commenter_profiles').select('user_id').ilike('handle', h.replace(/[_%\\]/g, '\\$&')).maybeSingle();
  if (taken && taken.user_id !== user.id) return fail(res, 409, 'That name is taken. Try another.');

  const { data: u } = await supabase.from('users').select('avatar_url').eq('id', user.id).maybeSingle();
  const { error } = await supabase.from('commenter_profiles').upsert({ user_id: user.id, handle: h, avatar_url: u?.avatar_url || null });
  if (error) return fail(res, 500, "Couldn't save that name. Try again.");
  return res.status(200).json({ handle: h });
}

async function removeOwn(res, supabase, user, { id }) {
  const { data, error } = await supabase.from('creator_comments').update({ status: 'removed' }).eq('id', id).eq('user_id', user.id).select('id');
  if (error || !data?.length) return fail(res, 404, 'Comment not found.');
  return res.status(200).json({ ok: true });
}

async function adminQueue(res, supabase) {
  const cols = 'id, creator_id, user_id, body, status, up_count, down_count, report_count, moderation, created_at, commenter_profiles(handle), creators(platform, username, display_name)';
  const [held, reported, recent] = await Promise.all([
    supabase.from('creator_comments').select(cols).in('status', ['held', 'hidden']).order('created_at', { ascending: false }).limit(100),
    supabase.from('creator_comments').select(cols).gt('report_count', 0).eq('status', 'visible').order('report_count', { ascending: false }).limit(100),
    supabase.from('creator_comments').select(cols).eq('status', 'visible').order('created_at', { ascending: false }).limit(100),
  ]);
  return res.status(200).json({ held: held.data || [], reported: reported.data || [], recent: recent.data || [] });
}

async function moderate(res, supabase, { id, status }) {
  if (!['visible', 'hidden'].includes(status)) return fail(res, 400, 'Bad status.');
  const { error } = await supabase.from('creator_comments').update({ status }).eq('id', id);
  if (error) return fail(res, 500, "Couldn't update that comment.");
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
    return fail(res, 400, 'Bad request');
  }

  const body = req.body || {};
  switch (body.action) {
    case 'post': return postComment(res, supabase, user, body);
    case 'handle': return setHandle(res, supabase, user, body);
    case 'remove': return removeOwn(res, supabase, user, body);
    case 'moderate': return isAdmin ? moderate(res, supabase, body) : fail(res, 403, 'Forbidden');
    default: return fail(res, 400, 'Bad request');
  }
}
