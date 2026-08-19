/**
 * Blog cover image resizing via Supabase Storage's image transformation
 * endpoint (Pro feature). Cover images come out of the Flow generation
 * pipeline at ~1267x714 and were being served at that full size into ~380px
 * cards. Verified 2026-08-19 against a live blog-images object: 800x450 at
 * quality 75 cut 87,957 bytes to 39,266 (-55%), confirmed via response
 * headers (`x-transformations`) that the transform actually applied rather
 * than silently falling through.
 *
 * Only rewrites our own Supabase Storage object URLs -- anything else
 * (a missing src, a future non-Supabase image host) is returned untouched.
 * Same "never guess, only rewrite what's confirmed working" rule as
 * avatarUrl.js.
 */

const SUPABASE_STORAGE_OBJECT = '/storage/v1/object/public/';
const SUPABASE_STORAGE_RENDER = '/storage/v1/render/image/public/';

/**
 * @param {string} src     original Supabase Storage public object URL
 * @param {number} width   desired rendered width in device pixels
 * @param {number} height  desired rendered height in device pixels
 * @returns {string}       a resized-on-the-fly URL, or `src` unchanged
 */
export function resizedBlogImageUrl(src, width, height) {
  if (!src || typeof src !== 'string' || !width || !height) return src;
  if (!src.includes(SUPABASE_STORAGE_OBJECT)) return src;

  const [base, query] = src.split('?');
  const rendered = base.replace(SUPABASE_STORAGE_OBJECT, SUPABASE_STORAGE_RENDER);
  const params = new URLSearchParams(query || '');
  params.set('width', String(width));
  params.set('height', String(height));
  params.set('resize', 'cover');
  params.set('quality', '75');
  return `${rendered}?${params.toString()}`;
}

// Shared target for the ~370-410px cover-image cards used on the home page
// blog teaser, the blog listing grid, and related-post cards -- 2x for
// retina sharpness, one size generous enough to cover all three without
// upscaling any of them.
export const BLOG_CARD_TARGET = { width: 800, height: 450 };
