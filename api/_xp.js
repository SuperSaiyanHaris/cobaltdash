// ShinyPass XP grants, shared by api/progress.js and api/comments.js.
// Rules (amounts, daily caps) come from src/lib/shinyPass.js; the atomic,
// idempotent write is the grant_xp() SQL function
// (supabase/migrations/20260927f_shinypass_functions.sql).

import { XP_RULES } from '../src/lib/shinyPass.js';

/** Today's date in America/New_York as YYYY-MM-DD (the site's day). */
export function todayNY(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!offsetDays) return today;
  // Calendar maths on the date itself: subtracting 24h from "now" lands on
  // the wrong day during the DST-change hours.
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

/**
 * Grant the XP for one rule-backed action. Returns the new XP total, or null
 * when nothing was granted (already paid, or over today's cap). Never throws:
 * XP is a bonus and must never break the action that earned it.
 */
export async function grantAction(supabase, userId, action, ref) {
  const rule = XP_RULES[action];
  if (!rule) return null;
  try {
    const { data, error } = await supabase.rpc('grant_xp', {
      p_user: userId, p_action: action, p_ref: String(ref), p_day: todayNY(), p_xp: rule.xp, p_cap: rule.perDay ?? null,
    });
    return error ? null : data;
  } catch {
    return null;
  }
}

/** Grant an arbitrary amount (packs, streak bonus), once per ref. */
export async function grantRaw(supabase, userId, action, ref, xp) {
  try {
    const { data, error } = await supabase.rpc('grant_xp', {
      p_user: userId, p_action: action, p_ref: String(ref), p_day: todayNY(), p_xp: xp, p_cap: null,
    });
    return error ? null : data;
  } catch {
    return null;
  }
}

export async function revokeAction(supabase, userId, action, ref) {
  try {
    await supabase.rpc('revoke_xp', { p_user: userId, p_action: action, p_ref: String(ref) });
  } catch { /* best effort */ }
}
