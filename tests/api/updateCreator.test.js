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
        maybeSingle: async () => ({ data: db.existing }),
        single: async () => ({ data: { id: 'row', ...q._payload }, error: null }),
        update(p) { q._op = 'update'; q._payload = p; db.writes.push({ op: 'update', p }); return q; },
        insert(p) { q._op = 'insert'; q._payload = p; db.writes.push({ op: 'insert', p }); return q; },
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

  it('rejects unknown platforms', async () => {
    expect((await call({ creatorData: { platform: 'rumble', platformId: '1' } })).status).toBe(400);
  });

  it('never inserts an id the platform does not know', async () => {
    verified.mockResolvedValue(null);
    const r = await call({ creatorData: { platform: 'youtube', platformId: 'UCaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Fake' } });
    expect(r.status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('writes the platform\'s data, never the client\'s', async () => {
    db.existing = { id: 'c1', updated_at: '2020-01-01T00:00:00Z' };
    verified.mockResolvedValue({ platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', username: 'mrbeast', displayName: 'MrBeast', profileImage: 'https://yt3.ggpht.com/a.jpg', description: 'real bio', country: 'US', category: null });
    await call({ creatorData: { platform: 'youtube', platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', displayName: 'HACKED', description: 'SPAM', profileImage: 'https://evil.example/x.png' } });
    const w = db.writes[0].p;
    expect(w.display_name).toBe('MrBeast');
    expect(w.description).toBe('real bio');
    expect(w.profile_image).toBe('https://yt3.ggpht.com/a.jpg');
    expect(JSON.stringify(db.writes)).not.toMatch(/HACKED|SPAM|evil/);
  });

  it('drops avatars from hosts outside the CDN allowlist', async () => {
    db.existing = { id: 'c1', updated_at: '2020-01-01T00:00:00Z' };
    verified.mockResolvedValue({ platformId: '1', username: 'u', displayName: 'U', profileImage: 'https://tracker.example/p.png', description: null });
    await call({ creatorData: { platform: 'twitch', platformId: '1', username: 'u' } });
    expect(db.writes[0].p).not.toHaveProperty('profile_image');
  });

  it('skips the platform call entirely for a recently refreshed row', async () => {
    db.existing = { id: 'c1', updated_at: new Date().toISOString() };
    const r = await call({ creatorData: { platform: 'youtube', platformId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' } });
    expect(r.status).toBe(200);
    expect(verified).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
});
