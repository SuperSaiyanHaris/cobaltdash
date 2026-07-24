/**
 * Shared size floor for every platform brand mark.
 *
 * Why this exists: YouTube's branding guidelines require their icon render at
 * least 20dp tall, which forced YouTubeIcon to enforce its own minimum (see
 * that file for the full history — it cost two API compliance notices). That
 * left YouTube visibly larger than every other platform icon, which read as a
 * bug rather than a deliberate choice.
 *
 * The fix is to align ALL platform marks on the same optical baseline: equal
 * HEIGHT, with width following each mark's own aspect ratio. Equal height is
 * how logo lockups are actually aligned — normalizing width instead would make
 * the wide YouTube mark look tiny next to the square ones.
 *
 * Each mark therefore renders 22px tall:
 *   YouTube  28.5701 x 20  -> 31.4 x 22
 *   Bluesky  320 x 286     -> 24.6 x 22
 *   TikTok   2250 x 2545   -> 19.5 x 22
 *   Twitch / Kick / Mastodon / Rumble / Substack / Music (24 x 24) -> 22 x 22
 *
 * 22 rather than YouTube's bare 20dp minimum: at exactly 20 the browser rounds
 * YouTube's fractional 28.5701px width down to 28.56px, which drags its painted
 * height to 19.99px — under spec in the same devtools panel a reviewer uses.
 *
 * The floor is enforced inside each icon component (spread AFTER the caller's
 * `style`, so nothing downstream can shrink it) rather than at call sites,
 * because these icons reach ~20 files through shared platform maps and a
 * per-call-site convention silently regresses the first time someone adds a
 * new usage with `w-4 h-4`.
 */

export const BRAND_MARK_MIN_HEIGHT_PX = 22;

/**
 * @param {number} aspectRatio natural width / natural height of the mark
 * @returns {{minHeight: string, minWidth: string}} style floor to spread last
 */
export function brandMarkFloor(aspectRatio) {
  return {
    minHeight: `${BRAND_MARK_MIN_HEIGHT_PX}px`,
    // Ceil so a fractional aspect can never let width become the limiting axis
    // and letterbox the mark below the height floor.
    minWidth: `${Math.ceil(BRAND_MARK_MIN_HEIGHT_PX * aspectRatio)}px`,
  };
}
