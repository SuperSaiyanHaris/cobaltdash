// ShinyPass client: talks to api/progress.js and keeps one shared copy of the
// signed-in user's state so the header, dashboard and pass page agree.
// XP gains are announced with a window event ('shinypass:gain') that the
// toast in App listens for.
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

let current = null;
const listeners = new Set();
const SYNC_KEY = 'sp-pass-synced';

function set(next) {
  current = next;
  listeners.forEach((fn) => fn(current));
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function call(payload) {
  const t = await token();
  if (!t) return null;
  const res = await fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return json;
}

function announce(gained) {
  if (gained?.length) window.dispatchEvent(new CustomEvent('shinypass:gain', { detail: gained }));
}

const STATE_KEYS = ['progress', 'season', 'pastSeasons', 'badges', 'items', 'packs', 'vouchers', 'today', 'handle', 'avatar', 'showcaseSlots', 'showcaseCreators'];
// Daily caps per event type, mirrored from XP_RULES so a capped action
// doesn't cost a request (the server enforces them either way).
const DAILY_XP_CAP = { follow: 25, compare: 20, explore: 12 };

let userId = null;
let inflight = null;
let loadedAt = 0;

function keepState(json) {
  if (json?.progress) {
    set(Object.fromEntries(STATE_KEYS.map((k) => [k, json[k]])));
    loadedAt = Date.now();
  }
  return json;
}

async function doLoad(force) {
  const { data: { session } } = await supabase.auth.getSession();
  const t = session?.access_token;
  if (!t) { set(null); userId = null; return null; }
  if (userId && userId !== session.user.id) set(null);
  userId = session.user.id;
  // Per user, so a second account on this browser still gets its visit.
  const key = `${SYNC_KEY}:${userId}`;
  let day = null;
  try { day = localStorage.getItem(key); } catch { /* private mode */ }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  if (force || day !== today) {
    const json = await call({ action: 'sync' });
    try { localStorage.setItem(key, today); } catch { /* private mode */ }
    const before = current?.progress?.level;
    keepState(json);
    announce(json?.gained);
    if (before && json?.progress?.level > before) announce([{ kind: 'level', level: json.progress.level }]);
    return current;
  }
  // Several components ask on mount; a fresh copy is good enough.
  if (current && Date.now() - loadedAt < 30000) return current;
  const res = await fetch('/api/progress', { headers: { Authorization: `Bearer ${t}` } });
  if (res.ok) keepState(await res.json());
  return current;
}

/** Load state; once per day also records the visit and streak. */
export function loadProgress({ force = false } = {}) {
  if (!inflight) inflight = doLoad(force).finally(() => { inflight = null; });
  return inflight;
}

/** Report an action that earns XP. Fire and forget. */
export function reportAction(type, ref) {
  if (!ref) return;
  const cap = DAILY_XP_CAP[type];
  if (cap && (current?.today?.byAction?.[type] || 0) >= cap) return;
  const before = current?.progress?.level;
  call({ action: 'event', type, ref })
    .then((r) => {
      if (!r?.granted) return;
      keepState(r);
      const labels = { follow: 'Followed a creator', compare: 'Saved a matchup', explore: 'Explored a creator' };
      announce([{ kind: 'xp', action: type, label: labels[type] }]);
      if (before && current?.progress?.level > before) announce([{ kind: 'level', level: current.progress.level }]);
    })
    .catch(() => {});
}

export const openPack = (level) => call({ action: 'open', level }).then(keepState);
export const equipItem = (slot, key) => call({ action: 'equip', slot, key }).then(keepState);
export const setShowcase = (creatorIds) => call({ action: 'showcase', creatorIds }).then(keepState);
export const setShiny = (creatorId) => call({ action: 'shiny', creatorId }).then(keepState);
export const setPrivate = (isPrivate) => call({ action: 'privacy', isPrivate }).then(keepState);
export const redeemVoucher = (voucherId, creatorId) => call({ action: 'redeem', voucherId, creatorId }).then(keepState);

export async function adminPassOverview() {
  const t = await token();
  const res = await fetch('/api/progress?admin=overview', { headers: { Authorization: `Bearer ${t || ''}` } });
  if (!res.ok) throw new Error('Could not load ShinyPass');
  return res.json();
}

export async function getPublicProfile(handle) {
  const res = await fetch(`/api/progress?handle=${encodeURIComponent(handle)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load that profile');
  return res.json();
}

/** Level + equipped cosmetics for comment authors (public rows only). */
export async function progressFor(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, 200);
  if (!ids.length) return {};
  const [{ data: prog }, { data: badges }] = await Promise.all([
    supabase.from('user_progress').select('user_id, xp, equipped').in('user_id', ids),
    supabase.from('user_badges').select('user_id, badge').in('user_id', ids),
  ]);
  const out = {};
  for (const p of prog || []) out[p.user_id] = { xp: p.xp, equipped: p.equipped || {}, badges: [] };
  for (const b of badges || []) if (out[b.user_id]) out[b.user_id].badges.push(b.badge);
  return out;
}

/** React hook: the shared ShinyPass state (null when signed out/loading). */
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => current;

export function useProgress() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function clearProgress() {
  set(null);
}
