// Site-wide daily spend cap for paid-quota APIs. The per-visitor limits in
// _guard.js live in one serverless instance's memory, so a spread-out crawler
// walks straight past them; this counter lives in Postgres and is shared.
import { createClient } from '@supabase/supabase-js';

let client;
function db() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ||= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Reserve `cost` units from today's `name` budget. Resolves false when the cap
 * is spent. Fails closed (false) if the counter can't be reached, because the
 * callers degrade gracefully and an unguarded API key is the bigger risk.
 */
export async function spendBudget(name, cost, cap) {
  const supabase = db();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('spend_api_budget', { p_name: name, p_cost: cost, p_cap: cap });
    if (error) { console.error('budget check failed:', error.message); return false; }
    return data === true;
  } catch (e) {
    console.error('budget check failed:', e.message);
    return false;
  }
}
