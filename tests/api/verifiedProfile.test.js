import { describe, it, expect, vi } from 'vitest';
import { fetchVerifiedProfile } from '../../api/_verifiedProfile.js';

describe('fetchVerifiedProfile input validation', () => {
  // Malformed or hostile ids must be rejected before any network call.
  it.each([
    ['mastodon', { platformId: '127.0.0.1:1' }],
    ['mastodon', { platformId: 'localhost:1' }],
    ['mastodon', { platformId: 'metadata.internal:1' }],
    ['mastodon', { platformId: 'intranet:5' }],
    ['youtube', { platformId: 'not-a-channel' }],
    ['twitch', { platformId: 'abc' }],
    ['kick', { platformId: '1', username: '../admin' }],
    ['bluesky', { platformId: 'not-a-did' }],
    ['substack', { platformId: '1', username: 'evil.com/x' }],
    ['music', { platformId: 'x' }],
    ['rumble', { platformId: '1' }],
  ])('%s %j -> null, no fetch', async (platform, ids) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network used'));
    await expect(fetchVerifiedProfile(platform, ids)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a Bluesky profile whose DID does not match the request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ did: 'did:plc:someoneelse', handle: 'x.bsky.social' })));
    await expect(fetchVerifiedProfile('bluesky', { platformId: 'did:plc:abc123' })).resolves.toBeNull();
  });
});
