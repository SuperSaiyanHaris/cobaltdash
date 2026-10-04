// api/update-creator.js: a creator added from a profile page gets its FIRST
// reading from the platform lookup, so its card has a follower count straight
// away. A reading is never invented (a 0 is skipped) and an existing creator
// that already has one is left alone.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let db;
let profile;
const calls = { profile: 0 };

vi.mock('../../api/_verifiedProfile.js', () => ({
  VERIFIABLE_PLATFORMS: ['youtube', 'twitch', 'kick', 'bluesky', 'mastodon', 'music', 'substack'],
  fetchVerifiedProfile: async () => { calls.profile++; return profile; },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const filters = [];
      let op = 'select', payload = null, opts = {};
      const api = {
        select() { return api; },
        eq(k, v) { filters.push([k, v]); return api; },
        limit() { return api; },
        single() { return api; },
        maybeSingle() { return api; },
        insert(v) { op = 'insert'; payload = v; return api; },
        update(v) { op = 'update'; payload = v; return api; },
        upsert(v, o) { op = 'upsert'; payload = v; opts = o || {}; return api; },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      function run() {
        const match = (r) => filters.every(([k, v]) => r[k] === v);
        if (table === 'creators' && op === 'select') {
          const row = db.creators.find(match);
          if (!row) return { data: null, error: null };
          return { data: { ...row, creator_stats: db.creator_stats.filter((s) => s.creator_id === row.id).slice(0, 1).map((s) => ({ id: s.id })) }, error: null };
        }
        if (table === 'creators' && op === 'insert') {
          const row = { id: `c${db.creators.length + 1}`, ...payload };
          db.creators.push(row);
          return { data: row, error: null };
        }
        if (table === 'creators' && op === 'update') {
          const row = db.creators.find(match);
          Object.assign(row, payload);
          return { data: row, error: null };
        }
        if (table === 'creator_stats' && op === 'upsert') {
          const dup = db.creator_stats.find((s) => s.creator_id === payload.creator_id && s.recorded_at === payload.recorded_at);
          if (!dup) db.creator_stats.push({ id: `s${db.creator_stats.length + 1}`, ...payload });
          else if (!opts.ignoreDuplicates) Object.assign(dup, payload);
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }
      return api;
    },
  }),
}));

const { default: handler } = await import('../../api/update-creator.js');

function call(body = { creatorData: { platform: 'twitch', platformId: '123', username: 'runescape' } }) {
  const res = { code: 0, body: null, headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method: 'POST', headers: { origin: 'https://shinypull.com', 'x-forwarded-for': `1.1.1.${Math.floor(Math.random() * 250)}` }, body }, res).then(() => res);
}

const NEW_PROFILE = { platformId: '123', username: 'runescape', displayName: 'RuneScape', profileImage: null, description: 'x', country: null, category: null, stats: { subscribers: 524000, totalViews: null, totalPosts: 0 } };

beforeEach(() => {
  db = { creators: [], creator_stats: [] };
  calls.profile = 0;
  profile = { ...NEW_PROFILE };
});

describe('update-creator first reading', () => {
  it('saves the platform count with a new creator', async () => {
    const res = await call();
    expect(res.code).toBe(200);
    expect(db.creators).toHaveLength(1);
    expect(db.creator_stats).toHaveLength(1);
    expect(db.creator_stats[0]).toMatchObject({ creator_id: res.body.creator.id, subscribers: 524000, followers: 524000, total_posts: 0 });
    expect(db.creator_stats[0].recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never stores a 0 count for a failed or hidden reading', async () => {
    profile = { ...NEW_PROFILE, stats: null };
    await call();
    expect(db.creators).toHaveLength(1);
    expect(db.creator_stats).toHaveLength(0);
  });

  it('gives an existing creator with no reading its first one', async () => {
    db.creators.push({ id: 'c1', platform: 'twitch', platform_id: '123', username: 'runescape', updated_at: new Date().toISOString() });
    await call();
    expect(calls.profile).toBe(1);
    expect(db.creator_stats).toHaveLength(1);
    expect(db.creator_stats[0].subscribers).toBe(524000);
  });

  it('leaves a fresh creator that already has a reading alone', async () => {
    db.creators.push({ id: 'c1', platform: 'twitch', platform_id: '123', username: 'runescape', updated_at: new Date().toISOString() });
    db.creator_stats.push({ id: 's1', creator_id: 'c1', recorded_at: '2026-10-03', subscribers: 500000 });
    const res = await call();
    expect(res.code).toBe(200);
    expect(calls.profile).toBe(0);
    expect(db.creator_stats).toHaveLength(1);
    expect(db.creator_stats[0].subscribers).toBe(500000);
  });

  it('keeps the collection\'s reading when one already exists for today', async () => {
    db.creators.push({ id: 'c1', platform: 'twitch', platform_id: '123', username: 'runescape', updated_at: '2020-01-01T00:00:00Z' });
    await call();
    const first = db.creator_stats[0];
    first.subscribers = 530000; // the daily collection overwrites it
    await call();
    expect(db.creator_stats).toHaveLength(1);
    expect(db.creator_stats[0].subscribers).toBe(530000);
  });
});
