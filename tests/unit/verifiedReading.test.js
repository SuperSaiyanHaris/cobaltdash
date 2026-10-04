// The first reading saved for a creator added from a profile page: only a real
// number from the platform is kept, never a 0 or a missing count standing in
// for a failed fetch.
import { describe, it, expect } from 'vitest';
import { cleanReading } from '../../api/_verifiedProfile.js';

describe('cleanReading', () => {
  it('keeps a real count and rounds it', () => {
    expect(cleanReading('twitch', { subscribers: 524000, totalPosts: 0 })).toEqual({ subscribers: 524000, totalViews: null, totalPosts: 0 });
    expect(cleanReading('youtube', { subscribers: '1230000', totalViews: '99', totalPosts: '7' })).toEqual({ subscribers: 1230000, totalViews: 99, totalPosts: 7 });
  });

  it('drops a missing count', () => {
    expect(cleanReading('twitch', undefined)).toBeNull();
    expect(cleanReading('bluesky', { subscribers: undefined })).toBeNull();
    expect(cleanReading('music', { subscribers: NaN })).toBeNull();
    expect(cleanReading('mastodon', { subscribers: null })).toBeNull();
  });

  it('drops a 0 count (a hidden or failed reading)', () => {
    expect(cleanReading('youtube', { subscribers: 0 })).toBeNull();
    expect(cleanReading('twitch', { subscribers: 0 })).toBeNull();
  });

  it('keeps 0 for Kick, where paid subscribers can genuinely be 0', () => {
    expect(cleanReading('kick', { subscribers: 0, totalViews: 0, totalPosts: 0 })).toEqual({ subscribers: 0, totalViews: 0, totalPosts: 0 });
  });

  it('drops a negative count', () => {
    expect(cleanReading('kick', { subscribers: -1 })).toBeNull();
  });
});
