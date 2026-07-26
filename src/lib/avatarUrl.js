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
  // `-profile_image-300x300.png`. Resizes to arbitrary values, not just the
  // documented preset sizes (96x96 verified working).
  if (src.startsWith('https://static-cdn.jtvnw.net/')) {
    return src.replace(/-profile_image-\d+x\d+\./, `-profile_image-${px}x${px}.`);
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
  if (src.startsWith('https://substackcdn.com/image/fetch/')) {
    if (/[,/]w_\d+/.test(src)) return src.replace(/([,/])w_\d+/, `$1w_${px}`);
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
export const AVATAR_TARGET_PX = {
  xs: 64,    // w-7  (28px)
  sm: 72,    // w-8  (32px)
  md: 96,    // w-10 (40px)
  lg: 112,   // w-12 (48px)
  xl: 144,   // w-16 (64px)
  '2xl': 224, // w-24 (96px), grows to w-28 on desktop
  '3xl': 288, // w-32 (128px)
};
