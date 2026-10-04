import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake Supabase: records every write so tests can assert what reached the DB.
const db = { existing: null, writes: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q = {
        _op: 'select',
        select() { return q; },
        eq() { return q; },
        limit() { return q; },
        maybeSingle: async () => ({ data: db.existing }),
        upsert(p, o) { q._op = 'upsert'; db.writes.push({ op: 'upsert', p, o }); return q; },
        single: async () => ({ data: { id: 'row', ...q._payload }, error: null }),
        update(p) { q._op = 'update'; q._payload = p; db.writes.push({ op: 'update', p }); return q; },
        insert(p) { q._op = 'insert'; q._payload = p; db.writes.push({ op: 'insert', p }); return q; },
        // upsert is awaited directly (no .single()), so make the builder thenable
        then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
      };
      return q;
    },
  }),
}));

// The platform lookup is what the endpoint must trust instead of the client.
const verified = vi.fn();
vi.mock('../../api/_verifiedProfile.js', () => ({
  VERIFIABLE_PLATFORMS: ['youtube', 'twitch', 'kick', 'bluesky', 'mastodon', 'music', 'substack'],
  fetchVerifiedProfile: (...a) => verified(...a),
}));

const { default: handler } = await import('../../api/update-creator.js');

async function call(body, origin = 'https://shinypull.com') {
  const out = {};
  const res = { setHeader() {}, status(s) { out.status = s; return this; }, json(j) { out.body = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { origin, 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, body }, res);
  return out;
}

beforeEach(() => { db.existing = null; db.writes = []; verified.mockReset(); });

describe('POST /api/update-creator', () => {
  it('rejects other origins', async () => {
    expect((await call({ creatorData: { platform: 'youtube', platformId: 'x' } }, 'https://evil.example')).status).toBe(403);
  });

  it('rejects unknown and removed platforms', async () => {
    expect((await call({ creatorData: { platform: 'rumble', platformId: '1' } })).status).toBe(400);
  });

  it('never inserts an id the platform does not know', async () => {
    verified.mockResolvedValue(null);
    const r = await call({ creatorData: { platform: 'youtube', platformId: 'UCaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Fake' } });
    expect(r.status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('writes the platform\'s data, never the client\'s', async () => {
    db.existing = { id: 'c1', updated_at: '2020-01-01T00:00:00Z', creator_stats: [{ id: 's1' }] };
    verified.mockResolvedValue({ platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', username: 'mrbeast', displayName: 'MrBeast', profileImage: 'https://yt3.ggpht.com/a.jpg', description: 'real bio', country: 'US', category: null });
    await call({ creatorData: { platform: 'youtube', platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', displayName: 'HACKED', description: 'SPAM', profileImage: 'https://evil.example/x.png' } });
    const w = db.writes[0].p;
    expect(w.display_name).toBe('MrBeast');
    expect(w.description).toBe('real bio');
    expect(w.profile_image).toBe('https://yt3.ggpht.com/a.jpg');
    expect(JSON.stringify(db.writes)).not.toMatch(/HACKED|SPAM|evil/);
  });

  it('drops avatars from hosts outside the CDN allowlist', async () => {
    db.existing = { id: 'c1', updated_at: '2020-01-01T00:00:00Z', creator_stats: [{ id: 's1' }] };
    verified.mockResolvedValue({ platformId: '1', username: 'u', displayName: 'U', profileImage: 'https://tracker.example/p.png', description: null });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    expect(db.writes[0].p).not.toHaveProperty('profile_image');
  });

  it('skips the platform call entirely for a recently refreshed row', async () => {
    db.existing = { id: 'c1', updated_at: new Date().toISOString(), creator_stats: [{ id: 's1' }] };
    const r = await call({ creatorData: { platform: 'youtube', platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' } });
    expect(r.status).toBe(200);
    expect(verified).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  // First reading: the count comes from the platform lookup, only for a creator
  // that has none, and a missing or 0 count is never stored.
  const PROFILE = { platformId: '1', username: 'u', displayName: 'U', profileImage: null, description: null, country: null, category: null };

  it('saves the platform count as the first reading of a new creator', async () => {
    verified.mockResolvedValue({ ...PROFILE, stats: { subscribers: 524000, totalViews: null, totalPosts: 0 } });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    const up = db.writes.find((w) => w.op === 'upsert');
    expect(up.p).toMatchObject({ creator_id: 'row', subscribers: 524000, followers: 524000, total_posts: 0 });
    expect(up.p.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(up.o).toMatchObject({ onConflict: 'creator_id,recorded_at', ignoreDuplicates: true });
  });

  it('gives an existing creator with no reading its first one', async () => {
    db.existing = { id: 'c1', updated_at: new Date().toISOString() };
    verified.mockResolvedValue({ ...PROFILE, stats: { subscribers: 1200, totalViews: null, totalPosts: null } });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    expect(verified).toHaveBeenCalled();
    expect(db.writes.find((w) => w.op === 'upsert').p).toMatchObject({ creator_id: 'c1', subscribers: 1200 });
  });

  it('does not write a reading when the creator already has one', async () => {
    db.existing = { id: 'c1', updated_at: '2020-01-01T00:00:00Z', creator_stats: [{ id: 's1' }] };
    verified.mockResolvedValue({ ...PROFILE, stats: { subscribers: 1200, totalViews: null, totalPosts: null } });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    expect(db.writes.some((w) => w.op === 'upsert')).toBe(false);
  });

  it('never stores a missing or zero count as a reading', async () => {
    verified.mockResolvedValue({ ...PROFILE, stats: null });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    expect(db.writes.some((w) => w.op === 'upsert')).toBe(false);
  });
});
