import { describe, it, expect } from 'vitest';
import { hasNumericId, hasDid, splitBy, matchKickChannels, matchBlueskyProfiles, blueskyActor } from '../../scripts/lookupById.js';

describe('Kick lookup by channel ID', () => {
  it('recognises numeric IDs only', () => {
    expect(hasNumericId({ platform_id: '1025603' })).toBe(true);
    expect(hasNumericId({ platform_id: 1025603 })).toBe(true);
    expect(hasNumericId({ platform_id: 'ddd' })).toBe(false);
    expect(hasNumericId({ platform_id: '12ab' })).toBe(false);
    expect(hasNumericId({ platform_id: null })).toBe(false);
  });

  it('finds a renamed channel by ID although its stored slug no longer exists', () => {
    const creators = [{ id: 'r1', platform_id: '555', username: 'diealis' }];
    const found = matchKickChannels(creators, [{ broadcaster_user_id: 555, slug: 'dimael21', active_subscribers_count: 12 }]);
    expect(found.get('r1')).toMatchObject({ subscribers: 12, slug: 'dimael21' });
  });

  it('keeps a real reading of 0 paid subs', () => {
    const creators = [{ id: 'r1', platform_id: '1', username: 'small' }];
    const found = matchKickChannels(creators, [{ broadcaster_user_id: 1, slug: 'small', active_subscribers_count: 0 }]);
    expect(found.get('r1').subscribers).toBe(0);
    expect(found.has('r1')).toBe(true);
  });

  it('leaves out channels Kick did not return, and falls back to the slug without an ID', () => {
    const creators = [{ id: 'gone', platform_id: '9', username: 'x' }, { id: 'noid', platform_id: null, username: 'MixedSlug' }];
    const found = matchKickChannels(creators, [{ broadcaster_user_id: 2, slug: 'mixedslug', active_subscribers_count: 3 }]);
    expect(found.has('gone')).toBe(false);
    expect(found.get('noid').subscribers).toBe(3);
  });

  it('does not cross-wire creators', () => {
    const creators = [{ id: 'a', platform_id: '1', username: 'a' }, { id: 'b', platform_id: '2', username: 'b' }];
    const found = matchKickChannels(creators, [{ broadcaster_user_id: 2, slug: 'b2', active_subscribers_count: 20 }, { broadcaster_user_id: 1, slug: 'a2', active_subscribers_count: 10 }]);
    expect(found.get('a').subscribers).toBe(10);
    expect(found.get('b').subscribers).toBe(20);
  });
});

describe('Bluesky lookup by DID', () => {
  it('recognises DIDs and picks the right actor to ask for', () => {
    const withDid = { platform_id: 'did:plc:abc', username: 'Old.Handle' };
    const without = { platform_id: '', username: 'Some.Handle' };
    expect(hasDid(withDid)).toBe(true);
    expect(hasDid(without)).toBe(false);
    expect(blueskyActor(withDid)).toBe('did:plc:abc');
    expect(blueskyActor(without)).toBe('some.handle');
    expect(splitBy([withDid, without], hasDid)).toEqual({ byId: [withDid], byName: [without] });
  });

  it('finds an account after a handle change', () => {
    const creators = [{ id: 'r1', platform_id: 'did:plc:abc', username: 'anneapplebaum.bsky.social' }];
    const found = matchBlueskyProfiles(creators, [{ did: 'did:plc:abc', handle: 'anneapplebaum.wsocial.eu', followersCount: 451634, postsCount: 9 }]);
    expect(found.get('r1')).toEqual({ followers: 451634, totalPosts: 9, handle: 'anneapplebaum.wsocial.eu' });
  });

  it('still finds accounts whose handle is marked invalid', () => {
    const creators = [{ id: 'r1', platform_id: 'did:plc:xyz', username: 'luscas.com.br' }];
    const found = matchBlueskyProfiles(creators, [{ did: 'did:plc:xyz', handle: 'handle.invalid', followersCount: 251649 }]);
    expect(found.get('r1').followers).toBe(251649);
  });

  it('falls back to the handle without a DID, and omits accounts that were not returned', () => {
    const creators = [{ id: 'a', platform_id: null, username: 'Plain.Handle' }, { id: 'b', platform_id: 'did:plc:gone', username: 'gone' }];
    const found = matchBlueskyProfiles(creators, [{ did: 'did:plc:other', handle: 'plain.handle', followersCount: 5 }]);
    expect(found.get('a').followers).toBe(5);
    expect(found.has('b')).toBe(false);
  });
});
