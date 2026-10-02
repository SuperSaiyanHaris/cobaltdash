import { describe, it, expect } from 'vitest';
import { hasTwitchId, splitByTwitchId, matchById, matchByLogin } from '../../scripts/twitchLookup.js';

describe('twitch lookup by stable ID', () => {
  it('recognises numeric Twitch IDs and nothing else', () => {
    expect(hasTwitchId({ platform_id: '123456' })).toBe(true);
    expect(hasTwitchId({ platform_id: 123456 })).toBe(true);
    expect(hasTwitchId({ platform_id: 'ddd' })).toBe(false); // a regex that read "d+" once matched this
    expect(hasTwitchId({ platform_id: 'abc123' })).toBe(false);
    expect(hasTwitchId({ platform_id: '' })).toBe(false);
    expect(hasTwitchId({ platform_id: null })).toBe(false);
    expect(hasTwitchId({})).toBe(false);
  });

  it('splits a batch into by-ID and by-login creators', () => {
    const a = { id: 'a', platform_id: '1', username: 'one' };
    const b = { id: 'b', platform_id: null, username: 'two' };
    expect(splitByTwitchId([a, b])).toEqual({ byId: [a], byLogin: [b] });
  });

  it('finds a renamed channel by ID even though its stored login no longer exists', () => {
    // loud_coringa -> coringa: same ID, new login.
    const creators = [{ id: 'row1', platform_id: '777', username: 'loud_coringa' }];
    const found = matchById(creators, [{ id: '777', login: 'coringa' }]);
    expect(found.get('row1')).toEqual({ id: '777', login: 'coringa' });
    // The old login lookup would have found nothing.
    expect(matchByLogin(creators, [{ id: '777', login: 'coringa' }]).size).toBe(0);
  });

  it('leaves out creators Twitch did not return (banned or deleted)', () => {
    const creators = [{ id: 'r1', platform_id: '1', username: 'x' }, { id: 'r2', platform_id: '2', username: 'y' }];
    const found = matchById(creators, [{ id: '2', login: 'y' }]);
    expect([...found.keys()]).toEqual(['r2']);
  });

  it('matches by login case-insensitively for creators without an ID', () => {
    const creators = [{ id: 'r1', platform_id: null, username: 'MixedCase' }];
    expect(matchByLogin(creators, [{ id: '9', login: 'mixedcase' }]).get('r1')).toEqual({ id: '9', login: 'mixedcase' });
  });

  it('keeps rows separate when matching (no cross-wiring between creators)', () => {
    const creators = [{ id: 'r1', platform_id: '1', username: 'a' }, { id: 'r2', platform_id: '2', username: 'b' }];
    const found = matchById(creators, [{ id: '2', login: 'b2' }, { id: '1', login: 'a2' }]);
    expect(found.get('r1').login).toBe('a2');
    expect(found.get('r2').login).toBe('b2');
  });
});
