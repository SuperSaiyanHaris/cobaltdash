// api/progress.js end to end against a small in-memory stand-in for
// Supabase (just the query-builder calls the handler uses), so the streak,
// pack, equip and voucher flows run without touching a real database.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOTAL_XP } from '../../src/lib/shinyPass.js';

let db;
const USER = { id: '11111111-1111-1111-1111-111111111111', created_at: '2026-03-01T00:00:00Z', email_confirmed_at: '2026-03-01T00:00:00Z' };
const CREATOR = { id: '22222222-2222-2222-2222-222222222222', platform: 'twitch', username: 'x', display_name: 'X' };

function freshDb() {
  return {
    user_progress: [], xp_events: [], user_badges: [], user_items: [], pack_openings: [], listing_vouchers: [],
    commenter_profiles: [{ user_id: USER.id, handle: 'tester', avatar_url: null, banned_at: null, created_at: USER.created_at }],
    creators: [CREATOR], user_saved_creators: [], saved_compares: [], featured_listings: [], creator_comments: [],
  };
}

let seq = 0;
function query(table) {
  const filters = [];
  let op = 'select', payload = null, opts = {}, single = false, maybe = false, head = false, limit = null, returning = false;
  const rows = () => db[table].filter((r) => filters.every((f) => f(r)));
  const api = {
    select(_cols, o = {}) { if (op === 'select') head = !!o.head; else returning = true; return api; },
    eq(k, v) { filters.push((r) => r[k] === v); return api; },
    is(k, v) { filters.push((r) => (r[k] ?? null) === v); return api; },
    in(k, vs) { filters.push((r) => vs.includes(r[k])); return api; },
    ilike(k, v) { filters.push((r) => String(r[k]).toLowerCase() === String(v).replace(/\\/g, '').toLowerCase()); return api; },
    gte() { return api; }, gt() { return api; }, order() { return api; },
    limit(n) { limit = n; return api; },
    single() { single = true; return api; },
    maybeSingle() { maybe = true; return api; },
    insert(v) { op = 'insert'; payload = Array.isArray(v) ? v : [v]; return api; },
    update(v) { op = 'update'; payload = v; return api; },
    upsert(v, o) { op = 'upsert'; payload = v; opts = o || {}; return api; },
    then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
  };
  function run() {
    if (op === 'insert') {
      if (table === 'pack_openings' && payload.some((p) => db.pack_openings.some((r) => r.user_id === p.user_id && r.pack_level === p.pack_level))) {
        return { data: null, error: { code: '23505' } };
      }
      const made = payload.map((p) => ({ id: `id${++seq}`, status: table === 'listing_vouchers' ? 'unused' : undefined, expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), ...p }));
      db[table].push(...made);
      return { data: single ? made[0] : made, error: null };
    }
    if (op === 'update') {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, payload));
      return { data: returning ? hit : null, error: null };
    }
    if (op === 'upsert') {
      const keys = (opts.onConflict || 'id').split(',');
      const found = db[table].find((r) => keys.every((k) => r[k] === payload[k]));
      if (found) { if (!opts.ignoreDuplicates) Object.assign(found, payload); }
      else db[table].push({ xp: 0, streak: 0, best_streak: 0, streak_freezes: 0, upvotes_credited: 0, equipped: {}, showcase: [], is_private: false, last_active_date: null, ...payload });
      return { data: null, error: null };
    }
    let out = rows();
    if (table === 'user_saved_creators') out = out.map((r) => ({ ...r, creators: db.creators.find((c) => c.id === r.creator_id) }));
    if (table === 'listing_vouchers') out = out.map((r) => ({ ...r, creators: db.creators.find((c) => c.id === r.creator_id) || null }));
    if (limit) out = out.slice(0, limit);
    if (head) return { data: null, count: out.length, error: null };
    if (single) return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    if (maybe) return { data: out[0] || null, error: null };
    return { data: out, count: out.length, error: null };
  }
  return api;
}

function rpc(name, a) {
  if (name === 'grant_xp') {
    const today = db.xp_events.filter((e) => e.user_id === a.p_user && e.action === a.p_action && e.day === a.p_day).length;
    if (a.p_cap != null && today >= a.p_cap) return Promise.resolve({ data: null, error: null });
    if (db.xp_events.some((e) => e.user_id === a.p_user && e.action === a.p_action && e.ref === a.p_ref)) return Promise.resolve({ data: null, error: null });
    db.xp_events.push({ user_id: a.p_user, action: a.p_action, ref: a.p_ref, day: a.p_day, xp: a.p_xp, revoked_at: null });
    const p = db.user_progress.find((r) => r.user_id === a.p_user);
    p.xp += a.p_xp;
    return Promise.resolve({ data: p.xp, error: null });
  }
  if (name === 'credit_upvotes' || name === 'valid_upvotes') return Promise.resolve({ data: 0, error: null });
  if (name === 'add_streak_freezes') {
    const p = db.user_progress.find((r) => r.user_id === a.p_user);
    p.streak_freezes += a.p_n;
    return Promise.resolve({ data: p.streak_freezes, error: null });
  }
  if (name === 'record_visit') {
    const p = db.user_progress.find((r) => r.user_id === a.p_user);
    if (!p || p.last_active_date === a.p_today) return Promise.resolve({ data: [], error: null });
    let streak = 1, used = false;
    if (p.last_active_date === a.p_yesterday) streak = p.streak + 1;
    else if (p.last_active_date === a.p_two_ago && p.streak_freezes > 0) { streak = p.streak + 1; used = true; p.streak_freezes -= 1; }
    Object.assign(p, { streak, best_streak: Math.max(p.best_streak, streak), last_active_date: a.p_today });
    return Promise.resolve({ data: [{ streak, used_freeze: used }], error: null });
  }
  throw new Error(`unexpected rpc ${name}`);
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t) => query(t),
    rpc: (n, a) => rpc(n, a),
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
  }),
}));

const { default: handler } = await import('../../api/progress.js');

async function call(body, method = 'POST', query = {}) {
  const res = {
    statusCode: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  await handler({ method, body, query, headers: { authorization: 'Bearer t', origin: 'https://shinypull.com' } }, res);
  return res;
}

const progress = () => db.user_progress.find((r) => r.user_id === USER.id);

beforeEach(() => { db = freshDb(); });

describe('api/progress', () => {
  it('first sync: creates progress, OG badge, daily visit, streak 1; second sync pays nothing', async () => {
    const r = await call({ action: 'sync' });
    expect(r.statusCode).toBe(200);
    expect(r.body.progress).toMatchObject({ level: 1, streak: 1, xp: 20 });
    expect(r.body.badges.map((b) => b.badge)).toContain('og2026');
    expect(r.body.gained).toEqual([{ kind: 'xp', action: 'visit', xp: 20 }]);
    const again = await call({ action: 'sync' });
    expect(again.body.gained).toEqual([]);
    expect(progress().xp).toBe(20);
  });

  it('continues a streak from yesterday, and a freeze covers one missed day', async () => {
    await call({ action: 'sync' });
    const ny = (off) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + off * 86400000));
    Object.assign(progress(), { last_active_date: ny(-1), streak: 6, best_streak: 6 });
    db.xp_events = [];
    let r = await call({ action: 'sync' });
    expect(r.body.progress.streak).toBe(7);
    expect(r.body.badges.map((b) => b.badge)).toContain('streak7');
    expect(r.body.gained.find((g) => g.action === 'streak').xp).toBe(30);

    Object.assign(progress(), { last_active_date: ny(-2), streak: 9, streak_freezes: 1 });
    db.xp_events = [];
    r = await call({ action: 'sync' });
    expect(r.body.progress).toMatchObject({ streak: 10, streak_freezes: 0 });
    expect(r.body.gained.some((g) => g.kind === 'freeze-used')).toBe(true);

    Object.assign(progress(), { last_active_date: ny(-3), streak: 12 });
    db.xp_events = [];
    r = await call({ action: 'sync' });
    expect(r.body.progress.streak).toBe(1);
  });

  it('only pays a follow that really exists, once', async () => {
    await call({ action: 'sync' });
    let r = await call({ action: 'event', type: 'follow', ref: CREATOR.id });
    expect(r.body.granted).toBe(false);
    db.user_saved_creators.push({ id: 'f1', user_id: USER.id, creator_id: CREATOR.id });
    r = await call({ action: 'event', type: 'follow', ref: CREATOR.id });
    expect(r.body.granted).toBe(true);
    r = await call({ action: 'event', type: 'follow', ref: CREATOR.id });
    expect(r.body.granted).toBe(false);
  });

  it('grants level drops once when levels are reached', async () => {
    await call({ action: 'sync' });
    progress().xp = TOTAL_XP[16];
    db.user_progress[0].last_active_date = null;
    db.xp_events = db.xp_events.filter((e) => e.action !== 'visit');
    const r = await call({ action: 'sync' });
    const drops = r.body.gained.filter((g) => g.kind === 'drop').map((g) => g.level);
    expect(drops).toEqual([5, 15]);
    expect(db.user_items.map((i) => `${i.kind}:${i.item_key}`)).toEqual(['title:lurker', 'ring:mint']);
    const again = await call({ action: 'sync' });
    expect(again.body.gained.filter((g) => g.kind === 'drop')).toEqual([]);
  });

  it('refuses a pack below its level, opens it once at the level, and re-returns the same pull', async () => {
    await call({ action: 'sync' });
    let r = await call({ action: 'open', level: 10 });
    expect(r.statusCode).toBe(403);
    progress().xp = TOTAL_XP[10];
    r = await call({ action: 'open', level: 10 });
    expect(r.statusCode).toBe(200);
    expect(r.body.pulled).toHaveLength(3);
    expect(r.body.pulled.some((i) => i.kind === 'frame' && i.key === 'cardstock')).toBe(true);
    expect(r.body.progress.equipped.frame).toBe('cardstock');
    expect(r.body.packs.opened).toEqual([10]);
    expect(r.body.items.some((i) => i.kind === 'frame')).toBe(true); // inventory, not the pull
    const again = await call({ action: 'open', level: 10 });
    expect(again.body.already).toBe(true);
    expect(again.body.pulled).toEqual(r.body.pulled);
  });

  it('equips only what you own', async () => {
    await call({ action: 'sync' });
    let r = await call({ action: 'equip', slot: 'ring', key: 'prism' });
    expect(r.statusCode).toBe(422);
    db.user_items.push({ id: 'i1', user_id: USER.id, kind: 'ring', item_key: 'prism' });
    r = await call({ action: 'equip', slot: 'ring', key: 'prism' });
    expect(r.body.progress.equipped.ring).toBe('prism');
    r = await call({ action: 'equip', slot: 'badge', key: 'og2026' });
    expect(r.body.progress.equipped.badge).toBe('og2026');
  });

  it('redeems a voucher into a 30-day reward listing, once', async () => {
    await call({ action: 'sync' });
    db.listing_vouchers.push({ id: 'v1', user_id: USER.id, source_level: 50, status: 'unused', expires_at: new Date(Date.now() + 86400000).toISOString() });
    const r = await call({ action: 'redeem', voucherId: 'v1', creatorId: CREATOR.id });
    expect(r.statusCode).toBe(200);
    const l = db.featured_listings[0];
    expect(l).toMatchObject({ creator_id: CREATOR.id, placement_tier: 'basic', status: 'active', source: 'reward', is_mod_free: true });
    expect(l.stripe_subscription_id).toBeUndefined();
    const days = (new Date(l.active_until) - new Date(l.active_from)) / 86400000;
    expect(days).toBe(30);
    const twice = await call({ action: 'redeem', voucherId: 'v1', creatorId: CREATOR.id });
    expect(twice.statusCode).toBe(409);
    expect(db.featured_listings).toHaveLength(1);
  });

  it('refuses a voucher on an already featured creator, and for new or unconfirmed accounts', async () => {
    await call({ action: 'sync' });
    const future = new Date(Date.now() + 86400000).toISOString();
    db.listing_vouchers.push({ id: 'v2', user_id: USER.id, source_level: 10, status: 'unused', expires_at: future });
    db.featured_listings.push({ id: 'paid', creator_id: CREATOR.id, platform: 'twitch', placement_tier: 'basic', status: 'active', active_until: future });
    let r = await call({ action: 'redeem', voucherId: 'v2', creatorId: CREATOR.id });
    expect(r.statusCode).toBe(409);
    expect(db.listing_vouchers.find((v) => v.id === 'v2').status).toBe('unused');
    db.featured_listings = [];
    const created = USER.created_at;
    USER.created_at = new Date().toISOString();
    r = await call({ action: 'redeem', voucherId: 'v2', creatorId: CREATOR.id });
    expect(r.statusCode).toBe(403);
    USER.created_at = created;
    const confirmed = USER.email_confirmed_at;
    USER.email_confirmed_at = null;
    r = await call({ action: 'redeem', voucherId: 'v2', creatorId: CREATOR.id });
    expect(r.statusCode).toBe(403);
    USER.email_confirmed_at = confirmed;
  });

  it('keeps showcase creators the user does not follow', async () => {
    await call({ action: 'sync' });
    await call({ action: 'showcase', creatorIds: [CREATOR.id] });
    const r = await call(null, 'GET');
    expect(r.body.showcaseCreators.map((c) => c.id)).toEqual([CREATOR.id]);
  });

  it('serves a public page without auth and hides private ones', async () => {
    await call({ action: 'sync' });
    let r = await call(null, 'GET', { handle: 'tester' });
    expect(r.body).toMatchObject({ handle: 'tester', progress: { level: 1 } });
    progress().is_private = true;
    r = await call(null, 'GET', { handle: 'TESTER' });
    expect(r.body).toEqual({ handle: 'tester', private: true });
    r = await call(null, 'GET', { handle: 'nobody' });
    expect(r.statusCode).toBe(404);
  });
});
