/**
 * Official YouTube icon (the red rounded-rect play mark), fixed colors + size floor.
 *
 * COLOR — YouTube's brand guidelines prohibit recoloring the standard icon
 * (https://developers.google.com/youtube/terms/branding-guidelines: "Standard
 * YouTube logos and icons... cannot be modified in color"). The lucide-react
 * `Youtube` glyph used previously is a single-path outline meant to be tinted
 * via `currentColor`, which is exactly the kind of recoloring that's not
 * allowed for a real brand mark. This component hardcodes the official
 * red (#FF0000) background + white play triangle and ignores any inherited
 * text color, so it can't accidentally get retinted by the site's "icon tint
 * alone" convention used for every other platform.
 *
 * SIZE — the guidelines also require the icon never render smaller than 20dp
 * tall. The mark's natural box is 28.5701 x 20 (a wide rectangle), so a square
 * container letterboxes it: `w-4 h-4` (16x16) renders the actual mark at only
 * ~11px tall, and `w-3.5 h-3.5` at 9.8px. That is what YouTube's API compliance
 * review flagged on 2026-07-24 (second notice) — the earlier pass fixed shape
 * and color but every call site was still sizing it like the 1:1 lucide glyph
 * it replaced.
 *
 * Because this icon is handed to ~20 files through shared platform maps
 * (PLATFORM_ICONS, platformIcons, SHOWCASE_ICONS, PLATFORM_META, ...), the
 * floor is enforced HERE rather than at each call site — a per-call-site fix
 * silently regresses the moment anyone adds a new usage with `w-4 h-4`.
 * min-width/min-height always beat width/height in CSS, so whatever size
 * classes a caller passes, the rendered mark can never fall under 20dp tall.
 * The mins are spread AFTER the caller's `style` so an inline style can't
 * override them either.
 *
 * Practical effect: the YouTube mark renders 28.57x20 where sibling platform
 * icons are 16x16. That size difference is intentional and required — do not
 * "fix" it by shrinking this icon back down to match the others. Size the
 * siblings up instead if a row looks unbalanced.
 */

// Natural viewBox of the official mark.
const VB_WIDTH = 28.5701;
const VB_HEIGHT = 20;

// YouTube branding guidelines: "our icon should never be smaller than 20dp in
// height." dp maps to CSS px at 1x.
//
// Deliberately set ABOVE 20, not exactly 20. With the mins at the mark's exact
// natural box (28.5701 x 20) the browser rounds the width down to 28.56px,
// which then constrains the painted mark to 28.56 / (28.5701/20) = 19.99px tall
// — measurably under the floor in devtools, which is exactly how a reviewer
// checks. 22px tall (and a width with enough slack that height stays the
// limiting axis) leaves headroom for subpixel rounding at any zoom level.
const MIN_HEIGHT_PX = 22;
const MIN_WIDTH_PX = 32; // 32 / (28.5701/20) = 22.4, so height governs, not width

export default function YouTubeIcon({ className, style, ...rest }) {
  return (
    <svg
      className={className}
      style={{ ...style, minWidth: `${MIN_WIDTH_PX}px`, minHeight: `${MIN_HEIGHT_PX}px` }}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
      {...rest}
    >
      <path
        d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
        fill="#FF0000"
      />
      <path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="#FFFFFF" />
    </svg>
  );
}
