// Profile comments. Reads, votes and reports go straight to Supabase (RLS
// limits them); posting, handles and removal go through api/comments.js,
// which moderates first.
import { supabase } from '../lib/supabase';

export const PAGE_SIZE = 10;
const COLS = 'id, creator_id, user_id, body, status, follows_creator, up_count, down_count, created_at, commenter_profiles(handle, avatar_url)';

export async function listComments(creatorId, { sort = 'top', page = 0 } = {}) {
  let q = supabase.from('creator_comments').select(COLS, { count: 'exact' }).eq('creator_id', creatorId).in('status', ['visible', 'held']);
  q = sort === 'new'
    ? q.order('created_at', { ascending: false })
    : q.order('up_count', { ascending: false }).order('down_count', { ascending: true }).order('created_at', { ascending: false });
  const { data, error, count } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) throw error;
  return { comments: data || [], total: count || 0 };
}

export async function myVotes(ids, userId) {
  if (!ids.length || !userId) return {};
  const { data } = await supabase.from('comment_votes').select('comment_id, value').eq('user_id', userId).in('comment_id', ids);
  return Object.fromEntries((data || []).map((v) => [v.comment_id, v.value]));
}

/** value: 1, -1, or 0 to clear. */
export async function vote(commentId, userId, value) {
  const q = supabase.from('comment_votes');
  const { error } = value === 0
    ? await q.delete().eq('comment_id', commentId).eq('user_id', userId)
    : await q.upsert({ comment_id: commentId, user_id: userId, value });
  if (error) throw error;
}

export async function reportComment(commentId, userId, reason) {
  const { error } = await supabase.from('comment_reports').insert({ comment_id: commentId, user_id: userId, reason });
  // Already reported by this person: treat as done.
  if (error && error.code !== '23505') throw error;
}

export async function myHandle(userId) {
  if (!userId) return null;
  const { data } = await supabase.from('commenter_profiles').select('handle, avatar_url').eq('user_id', userId).maybeSingle();
  return data;
}

async function call(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || "Something went wrong. Try again.");
    Object.assign(err, { status: res.status, ...json });
    throw err;
  }
  return json;
}

export const postComment = (creatorId, body) => call({ action: 'post', creatorId, body });
export const setHandle = (handle) => call({ action: 'handle', handle });
export const removeComment = (id) => call({ action: 'remove', id });
export const moderateComment = (id, status) => call({ action: 'moderate', id, status });

export async function adminQueue() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/comments?admin=queue', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
  if (!res.ok) throw new Error('Could not load comments');
  return res.json();
}
