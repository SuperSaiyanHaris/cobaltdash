import { describe, it, expect, vi, afterEach } from 'vitest';
import { inlineAvatar, isPublicHost } from '../../src/lib/cardData.js';

const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });

describe('card avatars', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats only public hostnames as public', () => {
    for (const h of ['files.mastodon.social', 'media.hachyderm.io', 'cdn.masto.host', 's3.eu-central-2.wasabisys.com']) expect(isPublicHost(h)).toBe(true);
    for (const h of ['localhost', '127.0.0.1', '169.254.169.254', '[::1]', 'intranet', 'db.internal', 'printer.local', 'a.b.localhost', '']) expect(isPublicHost(h)).toBe(false);
  });

  it('inlines a Mastodon avatar from any instance host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => png()));
    const out = await inlineAvatar('https://media.hachyderm.io/accounts/avatars/1/original/a.png', 'mastodon');
    expect(out).toMatch(/^data:image\/png;base64,/);
  });

  it('does not fetch unlisted hosts for other platforms', async () => {
    const f = vi.fn(async () => png());
    vi.stubGlobal('fetch', f);
    expect(await inlineAvatar('https://media.hachyderm.io/a.png', 'twitch')).toBeNull();
    expect(await inlineAvatar('https://media.hachyderm.io/a.png')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('never fetches internal addresses, plain http or odd ports, even for Mastodon', async () => {
    const f = vi.fn(async () => png());
    vi.stubGlobal('fetch', f);
    for (const u of ['https://169.254.169.254/latest', 'https://localhost/a.png', 'http://files.mastodon.social/a.png', 'https://files.mastodon.social:8443/a.png', 'https://db.internal/a.png']) {
      expect(await inlineAvatar(u, 'mastodon')).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('still inlines the listed hosts, including Kick default avatars', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => png()));
    expect(await inlineAvatar('https://kick.com/img/default-profile-pictures/default-avatar-2.webp', 'kick')).toMatch(/^data:image\/png/);
    expect(await inlineAvatar('https://static-cdn.jtvnw.net/jtv_user_pictures/x-profile_image-300x300.png', 'twitch')).toMatch(/^data:image\/png/);
  });
});
