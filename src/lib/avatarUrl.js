/**
 * Avatar URL resizing.
 *
 * Platforms hand us their *source* avatar and we were rendering it straight
 * into a 32-48px circle. Measured cost of that on 2026-07-25:
 *
 *   YouTube  135,468 b  ->  8,621 b at s88   (94% smaller)
 *   Twitch   139,861 b  -> 11,368 b at 70x70 (92% smaller)
 *   Bluesky   31,180 b  ->  1,534 b thumb    (95% smaller)
 *
 * A 50-row rankings page was pulling several MB of avatars to paint them at
 * 40px. Every CDN below resizes from the URL alone, so this costs us nothing.
 *
 * Rules:
 *   - Only ever REDUCE. Never request larger than the source.
 *   - Unknown host, unparseable URL, or a CDN with no variant: return `src`
 *     untouched. Callers rely on this being lossless.
 *   - TikTok is deliberately absent. Its `~tplv-...cropcenter:1080:1080` path
 *     is covered by the `x-signature` query param, so rewriting the size 403s.
 *     Verified. Resizing TikTok would require proxying through our own origin.
 *   - Rumble (1a-1791.com) and Mastodon expose no size variants either.
 */

// yt4 is included because YouTube rotates avatar hosts.
const YOUTUBE_HOST = /^https?:\/\/(yt3|yt4)\.(ggpht|googleusercontent)\.com\//i;
const GOOGLE_PHOTO_HOST = /^https?:\/\/lh\d\.googleusercontent\.com\//i;

// The only avatar sizes Twitch actually renders. Must stay sorted ascending.
// Unlike YouTube's `=sN`, this is NOT an arbitrary resize: asking for 112x112
// returns a 404, not a 112px image.
const TWITCH_SIZES = [28, 50, 70, 96, 150, 300, 600];

/**
 * @param {string} src  original avatar URL
 * @param {number} px   desired rendered size in device pixels (already 2x'd)
 * @returns {string}    a same-image URL at or near `px`, or `src` unchanged
 */
export function resizedAvatarUrl(src, px) {
  if (!src || typeof src !== 'string' || !px) return src;

  // --- YouTube / Google photo CDN ------------------------------------------
  // Size is encoded in a suffix on the path: `...=s800-c-k-c0xffffffff-no-rj`.
  // Some URLs use `=w{N}-h{N}` instead, and a few carry no suffix at all.
  if (YOUTUBE_HOST.test(src) || GOOGLE_PHOTO_HOST.test(src)) {
    if (/=s\d+/.test(src)) return src.replace(/=s\d+/, `=s${px}`);
    if (/=w\d+-h\d+/.test(src)) return src.replace(/=w\d+-h\d+/, `=s${px}`);
    if (src.includes('=')) return src; // unrecognized suffix, leave alone
    return `${src}=s${px}-c-k-c0x00ffffff-no-rj`;
  }

  // --- Twitch ---------------------------------------------------------------
  // `-profile_image-300x300.png`. Twitch serves ONLY the fixed sizes in
  // TWITCH_SIZES; anything else 404s. Probed 2026-07-25: 70/96/150/300 return
  // 200, while 64/72/112/128/224 all 404. An unsupported size isn't fatal
  // (CreatorAvatar falls back to the original URL) but it silently costs the
  // whole saving, so snap UP to the nearest real size instead.
  if (src.startsWith('https://static-cdn.jtvnw.net/')) {
    const snapped = TWITCH_SIZES.find((s) => s >= px) ?? TWITCH_SIZES[TWITCH_SIZES.length - 1];
    return src.replace(/-profile_image-\d+x\d+\./, `-profile_image-${snapped}x${snapped}.`);
  }

  // --- Bluesky --------------------------------------------------------------
  // Exactly two variants, no arbitrary sizing. The thumbnail is ~1.5 KB and is
  // large enough for anything up to a small hero.
  if (src.startsWith('https://cdn.bsky.app/') && px <= 160) {
    return src.replace('/img/avatar/plain/', '/img/avatar_thumbnail/plain/');
  }

  // --- Substack (Cloudinary-backed) ----------------------------------------
  // Transform segment sits between `/image/fetch/` and the encoded source URL.
  // It may or may not already carry a `w_` directive.
  //
  // When one is already present and is at or below what we want, leave it be.
  // Cloudinary will happily UPSCALE past the existing width, which produced a
  // bigger file than the original for the same visible result.
  if (src.startsWith('https://substackcdn.com/image/fetch/')) {
    const existing = src.match(/[,/]w_(\d+)/);
    if (existing) {
      return Number(existing[1]) <= px ? src : src.replace(/([,/])w_\d+/, `$1w_${px}`);
    }
    return src.replace('/image/fetch/', `/image/fetch/w_${px},c_limit,`);
  }

  // --- Kick -----------------------------------------------------------------
  // Named conversions only. `-small` 403s; `-thumb` and `-medium` are real.
  if (src.startsWith('https://files.kick.com/') && px <= 80) {
    return src.replace('-medium.webp', '-thumb.webp');
  }

  return src;
}

/**
 * Rendered CSS size -> pixels to actually request.
 *
 * Deliberately generous (roughly 2x, rounded up) so the image still looks
 * sharp on a 3x phone and so call sites that bump the box up with a Tailwind
 * override (`!w-11`, `sm:w-24 md:w-28`) never end up upscaling a too-small
 * source. Over-requesting slightly is cheap; under-requesting is visible.
 */
// `lg` is 96 rather than a roomier 112 on purpose. 96 is exactly 2x its 48px
// box, and it is one of Twitch's fixed sizes: 112 snaps up to Twitch's next
// real size, 150, which is more than twice the bytes (49.5 KB vs 22 KB) for a
// box that is usually rendered at 40px anyway. `lg` is what the rankings rows
// use, so this is the single highest-volume avatar request on the site.
export const AVATAR_TARGET_PX = {
  xs: 64,    // w-7  (28px)
  sm: 72,    // w-8  (32px)
  md: 96,    // w-10 (40px)
  lg: 96,    // w-12 (48px), exactly 2x
  xl: 144,   // w-16 (64px)
  '2xl': 224, // w-24 (96px), grows to w-28 on desktop
  '3xl': 288, // w-32 (128px)
};
