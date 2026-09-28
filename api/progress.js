// ShinyPass: levels, streaks, badges, packs, cosmetics and listing vouchers.
// Rules are in src/lib/shinyPass.js; this file is the only writer of the
// progress tables (supabase/migrations/20260927e_shinypass.sql), always with
// the service key and always after checking the action really happened.
//
//   GET  ?handle=x         public profile for /u/:handle (no auth)
//   GET                    your state (auth)
//   POST {action:'sync'}   daily visit, streak, upvotes, level drops (auth)
//   POST {action:'event', type:'follow'|'compare'|'explore', ref}
//   POST {action:'open', level}            open a pack
//   POST {action:'equip', slot, key}       frame|ring|title|banner|badge
//   POST {action:'showcase', creatorIds} | {action:'shiny', creatorId}
//   POST {action:'privacy', isPrivate}
//   POST {action:'redeem', voucherId, creatorId}

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from './_ratelimit.js';
import { isFromOurSite, ALLOWED_ORIGINS } from './_guard.js';
import { todayNY, grantAction, grantRaw } from './_xp.js';
import {
  levelFromXp, xpToNext, streakBonus, rollPack, PACKS, PACK_BY_LEVEL, DROP_LEVELS, trackReward, STREAK_BADGES, MAX_LEVEL, BOOST_DAYS,
  seasonMaxBadge, seasonLastDay, seasonDaysLeft, seasonForDate,
} from '../src/lib/shinyPass.js';
import { PLATFORM_IDS } from '../src/lib/constants.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const COSMETIC = new Set(['frame', 'ring', 'title', 'banner', 'sticker', 'name', 'back']);
const EQUIP_SLOTS = ['frame', 'ring', 'title', 'banner', 'badge', 'sticker', 'name', 'back'];
const BASE_SHOWCASE = 3;
// XP for a track drop you already own (small, so later seasons stay paced).
const DUPE_DROP_XP = 25;
// Mirrors BASIC_PER_PLATFORM in src/pages/Promote.jsx.
const BASIC_PER_PLATFORM = 98;
const MIN_REDEEM_AGE_DAYS = 14;

function db() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function userFrom(req, supabase) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  return error ? null : data.user;
}

const fail = (res, status, message) => res.status(status).json({ error: message });
const likeEscape = (s) => s.replace(/[_%\\]/g, (c) => `\\${c}`);
const rnd = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

/** Creates the row if needed and rolls a new season over. Returns the season. */
async function ensureSeason(supabase, userId) {
  const { data } = await supabase.rpc('ensure_season', { p_user: userId });
  return Number(data) || 1;
}

async function ensureProgress(supabase, user) {
  const season = await ensureSeason(supabase, user.id);
  const year = new Date(user.created_at).getUTCFullYear();
  if (year === 2026) {
    await supabase.from('user_badges').upsert({ user_id: user.id, badge: 'og2026', earned_at: user.created_at }, { onConflict: 'user_id,badge', ignoreDuplicates: true });
  }
  return season;
}

const award = (supabase, userId, badge) =>
  supabase.from('user_badges').upsert({ user_id: userId, badge }, { onConflict: 'user_id,badge', ignoreDuplicates: true });

// Atomic in SQL so a sync and a pack opening can't overwrite each other.
const addFreezes = (supabase, userId, n) => supabase.rpc('add_streak_freezes', { p_user: userId, p_n: n });

/**
 * Grant the track reward for every level reached this season (idempotent via
 * a 0-XP marker per season and level). Packs are opened by hand and card
 * tiers follow the level, so only the other levels are granted here.
 */
async function grantLevelDrops(supabase, userId, level, season, gained) {
  const due = DROP_LEVELS.filter((l) => l <= level);
  if (due.length) {
    // One read of this season's markers, so a normal sync costs one query.
    const { data: done } = await supabase.from('xp_events').select('ref').eq('user_id', userId).eq('action', 'drop').like('ref', `${season}:%`);
    const have = new Set((done || []).map((d) => d.ref));
    const todo = due.filter((l) => !have.has(`${season}:${l}`)).map((l) => {
      const r = trackReward(l);
      return { level: l, kind: r.kind, key: r.key };
    });
    if (todo.length) {
      // Marker and reward commit together in SQL, so a failure can't eat a reward.
      const { data, error } = await supabase.rpc('grant_track_drops', {
        p_user: userId, p_season: season, p_day: todayNY(), p_drops: todo, p_dupe_xp: DUPE_DROP_XP, p_boost_days: BOOST_DAYS,
      });
      if (!error) {
        for (const g of data || []) {
          const r = trackReward(g.level);
          gained.push({ kind: 'drop', level: g.level, item: g.result === 'dupe' ? { kind: 'dupe', key: 'dupe', amount: DUPE_DROP_XP, rarity: 'common' } : r });
        }
      }
    }
  }
  if (level >= MAX_LEVEL) await award(supabase, userId, seasonMaxBadge(season));
}

async function state(supabase, user) {
  const today = todayNY();
  const season = await ensureSeason(supabase, user.id);
  const [prog, badges, items, packs, vouchers, events, profile, past] = await Promise.all([
    supabase.from('user_progress').select('*').eq('user_id', user.id).single(),
    supabase.from('user_badges').select('badge, earned_at').eq('user_id', user.id).order('earned_at'),
    supabase.from('user_items').select('id, kind, item_key, source_level, obtained_at').eq('user_id', user.id).order('obtained_at'),
    supabase.from('pack_openings').select('pack_level, items, opened_at').eq('user_id', user.id).eq('season', season),
    supabase.from('listing_vouchers').select('id, source_level, status, expires_at, creator_id, listing_id, created_at, redeemed_at, creators(platform, username, display_name)').eq('user_id', user.id).order('created_at'),
    supabase.from('xp_events').select('action, xp').eq('user_id', user.id).eq('day', today).is('revoked_at', null),
    supabase.from('commenter_profiles').select('handle, avatar_url').eq('user_id', user.id).maybeSingle(),
    supabase.from('season_results').select('season, xp').eq('user_id', user.id).order('season'),
  ]);
  const p = prog.data || { xp: 0 };
  const lv = levelFromXp(p.xp, season);
  // Showcase creators come back whole, so the locker never has to guess them
  // from follows (a showcased creator doesn't have to be followed).
  const showIds = Array.isArray(p.showcase) ? p.showcase : [];
  const { data: showRows } = showIds.length
    ? await supabase.from('creators').select('id, platform, username, display_name, profile_image').in('id', showIds)
    : { data: [] };
  const showById = Object.fromEntries((showRows || []).map((c) => [c.id, c]));
  const opened = new Set((packs.data || []).map((r) => r.pack_level));
  const byAction = {};
  for (const e of events.data || []) byAction[e.action] = (byAction[e.action] || 0) + e.xp;
  return {
    progress: { ...p, ...lv },
    season: { number: season, lastDay: seasonLastDay(season), daysLeft: seasonDaysLeft(season, today) },
    pastSeasons: (past.data || []).map((r) => ({ season: r.season, xp: r.xp, level: levelFromXp(r.xp, r.season).level })),
    badges: badges.data || [],
    items: items.data || [],
    packs: {
      opened: [...opened].sort((a, b) => a - b),
      available: PACKS.filter((k) => k.level <= lv.level && !opened.has(k.level)).map((k) => k.level),
      history: packs.data || [],
    },
    vouchers: vouchers.data || [],
    today: { xp: Object.values(byAction).reduce((s, v) => s + v, 0), byAction, date: today },
    handle: profile.data?.handle || null,
    avatar: profile.data?.avatar_url || null,
    showcaseSlots: BASE_SHOWCASE + (items.data || []).filter((i) => i.kind === 'showcase').length,
    showcaseCreators: showIds.map((id) => showById[id]).filter((c) => c && PLATFORM_IDS.includes(c.platform)),
  };
}

async function sync(supabase, user) {
  const season = await ensureProgress(supabase, user);
  const gained = [];
  const today = todayNY();
  // Streak + freeze in one locked SQL step (record_visit); no row back means
  // today was already counted.
  const { data: visit } = await supabase.rpc('record_visit', { p_user: user.id, p_today: today, p_yesterday: todayNY(-1), p_two_ago: todayNY(-2) });
  const v = Array.isArray(visit) ? visit[0] : visit;
  if (v?.streak) {
    const { streak, used_freeze: usedFreeze } = v;
    if (await grantAction(supabase, user.id, 'visit', today) !== null) gained.push({ kind: 'xp', action: 'visit', xp: 20 });
    const bonus = streakBonus(streak);
    if (bonus > 0 && await grantRaw(supabase, user.id, 'streak', today, bonus) !== null) gained.push({ kind: 'xp', action: 'streak', xp: bonus, streak });
    if (usedFreeze) gained.push({ kind: 'freeze-used', streak });
    for (const [days, badge] of STREAK_BADGES) if (streak >= days) await award(supabase, user.id, badge);
  }

  const { data: ups } = await supabase.rpc('credit_upvotes', { p_user: user.id, p_day: today });
  if (ups > 0) gained.push({ kind: 'xp', action: 'upvote', xp: ups * 3 });
  const { data: totalUps } = await supabase.rpc('valid_upvotes', { p_user: user.id });
  if (totalUps >= 100) await award(supabase, user.id, 'voice');

  const { data: now } = await supabase.from('user_progress').select('xp').eq('user_id', user.id).single();
  await grantLevelDrops(supabase, user.id, levelFromXp(now.xp, season).level, season, gained);
  return gained;
}

async function event(supabase, user, { type, ref }) {
  const id = String(ref || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (type === 'follow') {
    const { data } = await supabase.from('user_saved_creators').select('id').eq('user_id', user.id).eq('creator_id', id).maybeSingle();
    if (!data) return null;
    const r = await grantAction(supabase, user.id, 'follow', id);
    const { data: follows } = await supabase.from('user_saved_creators').select('creators(platform)').eq('user_id', user.id).limit(1000);
    const platforms = new Set((follows || []).map((f) => f.creators?.platform).filter((pl) => PLATFORM_IDS.includes(pl)));
    if (platforms.size >= PLATFORM_IDS.length) await award(supabase, user.id, 'collector');
    return r;
  }
  if (type === 'compare') {
    const { data } = await supabase.from('saved_compares').select('id').eq('user_id', user.id).eq('id', id).maybeSingle();
    return data ? grantAction(supabase, user.id, 'compare', id) : null;
  }
  if (type === 'explore') {
    const { data } = await supabase.from('creators').select('id').eq('id', id).maybeSingle();
    return data ? grantAction(supabase, user.id, 'explore', `${id}:${todayNY()}`) : null;
  }
  return null;
}

async function openPack(supabase, user, { level }) {
  const packLevel = Number(level);
  const pack = PACK_BY_LEVEL[packLevel];
  if (!pack) return { status: 400, error: 'No pack at that level.' };
  const season = await ensureSeason(supabase, user.id);
  const { data: p } = await supabase.from('user_progress').select('xp, equipped').eq('user_id', user.id).single();
  if (!p || levelFromXp(p.xp, season).level < packLevel) return { status: 403, error: `Reach level ${packLevel} to open this pack.` };

  const raw = rollPack(packLevel, rnd);
  const { error: claimErr } = await supabase.from('pack_openings').insert({ user_id: user.id, season, pack_level: packLevel, items: raw });
  if (claimErr) {
    const { data: prev } = await supabase.from('pack_openings').select('items').eq('user_id', user.id).eq('season', season).eq('pack_level', packLevel).maybeSingle();
    return prev ? { items: prev.items, already: true } : { status: 500, error: "Couldn't open that pack. Try again." };
  }

  const { data: owned } = await supabase.from('user_items').select('kind, item_key').eq('user_id', user.id);
  const have = new Set((owned || []).map((o) => `${o.kind}:${o.item_key}`));
  const resolved = [];
  for (const [i, item] of raw.entries()) {
    const ref = `${season}:${packLevel}:${i}`;
    if (COSMETIC.has(item.kind) && have.has(`${item.kind}:${item.key}`)) {
      const amount = Math.round(xpToNext(packLevel, season) * 0.25);
      await grantRaw(supabase, user.id, 'pack', ref, amount);
      resolved.push({ kind: 'dupe', of: item, key: 'dupe', amount, rarity: 'common' });
      continue;
    }
    if (COSMETIC.has(item.kind) || item.kind === 'showcase' || item.kind === 'shiny') {
      await supabase.from('user_items').insert({ user_id: user.id, kind: item.kind, item_key: item.key, source_level: packLevel });
      have.add(`${item.kind}:${item.key}`);
    } else if (item.kind === 'xp') {
      await grantRaw(supabase, user.id, 'pack', ref, item.amount);
    } else if (item.kind === 'freeze') {
      await addFreezes(supabase, user.id, 1);
    } else if (item.kind === 'voucher') {
      const { data: v } = await supabase.from('listing_vouchers').insert({ user_id: user.id, source_level: packLevel }).select('id').single();
      resolved.push({ ...item, voucherId: v?.id });
      continue;
    }
    resolved.push(item);
  }
  await supabase.from('pack_openings').update({ items: resolved }).eq('user_id', user.id).eq('season', season).eq('pack_level', packLevel);
  if (!p.equipped?.frame) {
    await supabase.from('user_progress').update({ equipped: { ...(p.equipped || {}), frame: pack.key } }).eq('user_id', user.id);
  }
  return { items: resolved };
}

async function equip(supabase, user, { slot, key }) {
  if (!EQUIP_SLOTS.includes(slot)) return 'Unknown slot.';
  if (key) {
    const q = slot === 'badge'
      ? supabase.from('user_badges').select('badge').eq('user_id', user.id).eq('badge', key)
      : supabase.from('user_items').select('id').eq('user_id', user.id).eq('kind', slot).eq('item_key', key);
    const { data } = await q.limit(1);
    if (!data?.length) return "You don't have that yet.";
  }
  const { data: p } = await supabase.from('user_progress').select('equipped').eq('user_id', user.id).single();
  const equipped = { ...(p?.equipped || {}) };
  if (key) equipped[slot] = key; else delete equipped[slot];
  await supabase.from('user_progress').update({ equipped, updated_at: new Date().toISOString() }).eq('user_id', user.id);
  return null;
}

async function setShowcase(supabase, user, { creatorIds }) {
  const ids = [...new Set((Array.isArray(creatorIds) ? creatorIds : []).map(String))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const { count } = await supabase.from('user_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'showcase');
  const slots = BASE_SHOWCASE + (count || 0);
  if (ids.length > slots) return `You have ${slots} showcase slots.`;
  if (ids.length) {
    const { data } = await supabase.from('creators').select('id, platform').in('id', ids);
    if ((data || []).filter((c) => PLATFORM_IDS.includes(c.platform)).length !== ids.length) return 'Creator not found.';
  }
  await supabase.from('user_progress').update({ showcase: ids }).eq('user_id', user.id);
  return null;
}

async function setShiny(supabase, user, { creatorId }) {
  const { data: item } = await supabase.from('user_items').select('id').eq('user_id', user.id).eq('kind', 'shiny').limit(1);
  if (!item?.length) return 'Pull a Shiny variant from a pack first.';
  if (creatorId) {
    const { data: f } = await supabase.from('user_saved_creators').select('id').eq('user_id', user.id).eq('creator_id', creatorId).maybeSingle();
    if (!f) return 'Follow that creator first.';
  }
  await supabase.from('user_progress').update({ shiny_creator_id: creatorId || null }).eq('user_id', user.id);
  return null;
}

async function redeem(supabase, user, { voucherId, creatorId }) {
  const { data: v } = await supabase.from('listing_vouchers').select('id, status, expires_at').eq('id', voucherId).eq('user_id', user.id).maybeSingle();
  if (!v) return { status: 404, error: 'Voucher not found.' };
  if (v.status !== 'unused') return { status: 409, error: 'That voucher was already used.' };
  if (new Date(v.expires_at) < new Date()) {
    await supabase.from('listing_vouchers').update({ status: 'expired' }).eq('id', v.id);
    return { status: 410, error: 'That voucher expired.' };
  }
  // Anti-farming: a new or unconfirmed account can't cash out a listing.
  if (!user.email_confirmed_at && !user.confirmed_at) return { status: 403, error: 'Confirm your email first, then try again.' };
  if (Date.now() - new Date(user.created_at).getTime() < MIN_REDEEM_AGE_DAYS * 86400000) {
    return { status: 403, error: `Accounts can use a voucher once they're ${MIN_REDEEM_AGE_DAYS} days old. It'll keep until then.` };
  }
  const { data: c } = await supabase.from('creators').select('id, platform').eq('id', creatorId).maybeSingle();
  if (!c || !PLATFORM_IDS.includes(c.platform)) return { status: 404, error: 'Creator not found.' };

  // Same rules as a paid listing (api/stripe-checkout.js): one active
  // listing per creator, and Basic spots are limited per platform.
  const nowIso = new Date().toISOString();
  const [{ count: dup }, { count: basic }] = await Promise.all([
    supabase.from('featured_listings').select('id', { count: 'exact', head: true }).eq('creator_id', c.id).eq('status', 'active').gt('active_until', nowIso),
    supabase.from('featured_listings').select('id', { count: 'exact', head: true }).eq('platform', c.platform).eq('placement_tier', 'basic').eq('status', 'active').gt('active_until', nowIso),
  ]);
  if (dup > 0) return { status: 409, error: 'That creator is already featured. Pick someone else.' };
  if (basic >= BASIC_PER_PLATFORM) return { status: 409, error: 'Every spot on that platform is taken right now. Try another platform.' };

  // Claim the voucher first so a double click can't create two listings.
  const { data: claimed } = await supabase.from('listing_vouchers').update({ status: 'redeemed', creator_id: c.id, redeemed_at: new Date().toISOString() })
    .eq('id', v.id).eq('status', 'unused').select('id');
  if (!claimed?.length) return { status: 409, error: 'That voucher was already used.' };

  const from = new Date();
  const until = new Date(from.getTime() + 30 * 86400000);
  const { data: listing, error } = await supabase.from('featured_listings').insert({
    creator_id: c.id, platform: c.platform, placement_tier: 'basic', status: 'active', purchased_by_user_id: user.id,
    active_from: from.toISOString(), active_until: until.toISOString(), is_mod_free: true, source: 'reward',
  }).select('id').single();
  if (error) {
    await supabase.from('listing_vouchers').update({ status: 'unused', creator_id: null, redeemed_at: null }).eq('id', v.id);
    return { status: 500, error: "Couldn't start the listing. Try again." };
  }
  await supabase.from('listing_vouchers').update({ listing_id: listing.id }).eq('id', v.id);
  return { listingId: listing.id, activeUntil: until.toISOString() };
}

/** Admin: every listing voucher and a few totals. Small tables, paged anyway. */
async function adminOverview(supabase) {
  const all = async (table, cols) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from(table).select(cols).order(table === 'user_progress' ? 'user_id' : 'created_at').range(from, from + 999);
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  };
  const [vouchers, progress, packs, handles] = await Promise.all([
    all('listing_vouchers', 'id, user_id, source_level, status, expires_at, created_at, redeemed_at, listing_id, creators(platform, username, display_name)'),
    all('user_progress', 'user_id, xp, streak, best_streak'),
    supabase.from('pack_openings').select('pack_level', { count: 'exact', head: true }),
    all('commenter_profiles', 'user_id, handle, created_at'),
  ]);
  const handleOf = Object.fromEntries(handles.map((h) => [h.user_id, h.handle]));
  const levels = progress.map((p) => levelFromXp(p.xp).level);
  return {
    vouchers: vouchers.map((v) => ({ ...v, handle: handleOf[v.user_id] || null })),
    totals: {
      users: progress.length,
      packsOpened: packs.count || 0,
      topLevel: levels.length ? Math.max(...levels) : 0,
      avgLevel: levels.length ? Math.round((levels.reduce((s, l) => s + l, 0) / levels.length) * 10) / 10 : 0,
      bestStreak: progress.reduce((m, p) => Math.max(m, p.best_streak || 0), 0),
    },
  };
}

async function publicProfile(res, supabase, handle) {
  const h = String(handle || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(h)) return fail(res, 404, 'Not found.');
  const { data: prof } = await supabase.from('commenter_profiles').select('user_id, handle, avatar_url, banned_at, created_at').ilike('handle', likeEscape(h)).maybeSingle();
  if (!prof || prof.banned_at) return fail(res, 404, 'Not found.');
  const { data: p } = await supabase.from('user_progress').select('xp, season, streak, best_streak, equipped, showcase, shiny_creator_id, is_private, last_active_date').eq('user_id', prof.user_id).maybeSingle();
  // Short edge cache and no stale window, so going private takes effect fast.
  res.setHeader('Cache-Control', 'public, s-maxage=20');
  if (!p || p.is_private) return res.status(200).json({ handle: prof.handle, private: true });

  const showIds = [...(p.showcase || []), p.shiny_creator_id].filter(Boolean);
  const [badges, creators, comments, follows, past] = await Promise.all([
    supabase.from('user_badges').select('badge, earned_at').eq('user_id', prof.user_id).order('earned_at'),
    showIds.length ? supabase.from('creators').select('id, platform, username, display_name, profile_image').in('id', showIds) : Promise.resolve({ data: [] }),
    supabase.from('creator_comments').select('id, body, created_at, up_count, creators(platform, username, display_name)').eq('user_id', prof.user_id).eq('status', 'visible').order('created_at', { ascending: false }).limit(6),
    supabase.from('user_saved_creators').select('id', { count: 'exact', head: true }).eq('user_id', prof.user_id),
    supabase.from('season_results').select('season, xp').eq('user_id', prof.user_id).order('season'),
  ]);
  // Someone who hasn't visited since a new season began is shown at level 1
  // of the new season, with their last season listed as finished.
  const current = seasonForDate(todayNY());
  const stale = (p.season || 1) < current;
  const seasonXp = stale ? 0 : p.xp;
  const pastSeasons = [...(past.data || []), ...(stale ? [{ season: p.season || 1, xp: p.xp }] : [])]
    .map((r) => ({ season: r.season, xp: r.xp, level: levelFromXp(r.xp, r.season).level }));
  const byId = Object.fromEntries((creators.data || []).filter((c) => PLATFORM_IDS.includes(c.platform)).map((c) => [c.id, c]));
  return res.status(200).json({
    handle: prof.handle,
    avatar: prof.avatar_url,
    joined: prof.created_at,
    progress: { ...levelFromXp(seasonXp, current), xp: seasonXp, streak: p.streak, best_streak: p.best_streak, equipped: p.equipped || {} },
    season: current,
    pastSeasons,
    badges: badges.data || [],
    showcase: (p.showcase || []).map((id) => byId[id]).filter(Boolean),
    shiny: p.shiny_creator_id ? byId[p.shiny_creator_id] || null : null,
    comments: (comments.data || []).filter((c) => c.creators && PLATFORM_IDS.includes(c.creators.platform)),
    following: follows.count || 0,
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return fail(res, 405, 'Method not allowed');

  const supabase = db();
  if (req.method === 'GET' && req.query?.handle) return publicProfile(res, supabase, req.query.handle);

  if (!isFromOurSite(req)) return fail(res, 403, 'Forbidden');
  const user = await userFrom(req, supabase);
  if (!user) return fail(res, 401, 'Sign in first.');
  if (!checkRateLimit(`progress:${user.id}`, 90, 60000).allowed) return fail(res, 429, 'Slow down a little.');
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET' && req.query?.admin === 'overview') {
      if (!ADMIN_EMAILS.includes((user.email || '').toLowerCase())) return fail(res, 403, 'Forbidden');
      return res.status(200).json(await adminOverview(supabase));
    }
    if (req.method === 'GET') {
      // Levels gained since the daily sync (comments, follows, pack XP) pay
      // their track drops on the next load, not the next day.
      const season = await ensureSeason(supabase, user.id);
      const { data: p } = await supabase.from('user_progress').select('xp').eq('user_id', user.id).maybeSingle();
      const gained = [];
      if (p) await grantLevelDrops(supabase, user.id, levelFromXp(p.xp, season).level, season, gained);
      return res.status(200).json({ ...(await state(supabase, user)), ...(gained.length ? { gained } : {}) });
    }
    const body = req.body || {};
    switch (body.action) {
      case 'sync': {
        const gained = await sync(supabase, user);
        return res.status(200).json({ gained, ...(await state(supabase, user)) });
      }
      case 'event': {
        const r = await event(supabase, user, body);
        // New state only when something changed, saving the client a GET.
        return res.status(200).json(r !== null ? { granted: true, xp: r, ...(await state(supabase, user)) } : { granted: false });
      }
      case 'open': {
        const r = await openPack(supabase, user, body);
        if (r.error) return fail(res, r.status, r.error);
        return res.status(200).json({ ...(await state(supabase, user)), pulled: r.items, already: !!r.already });
      }
      case 'equip': {
        const err = await equip(supabase, user, body);
        return err ? fail(res, 422, err) : res.status(200).json(await state(supabase, user));
      }
      case 'showcase': {
        const err = await setShowcase(supabase, user, body);
        return err ? fail(res, 422, err) : res.status(200).json(await state(supabase, user));
      }
      case 'shiny': {
        const err = await setShiny(supabase, user, body);
        return err ? fail(res, 422, err) : res.status(200).json(await state(supabase, user));
      }
      case 'privacy': {
        await supabase.from('user_progress').update({ is_private: !!body.isPrivate }).eq('user_id', user.id);
        return res.status(200).json(await state(supabase, user));
      }
      case 'redeem': {
        const r = await redeem(supabase, user, body);
        if (r.error) return fail(res, r.status, r.error);
        return res.status(200).json({ ...r, ...(await state(supabase, user)) });
      }
      default:
        return fail(res, 400, 'Unknown action.');
    }
  } catch (err) {
    console.error('progress error', err);
    return fail(res, 500, 'Something went wrong. Try again.');
  }
}
