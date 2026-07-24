/**
 * Bluesky butterfly icon — official path from bluesky-social/social-app.
 * Color hardcoded to Bluesky's verified official blue (#1185FE) instead of
 * `currentColor` — the site's previous `sky-500` Tailwind tint was an
 * approximation, not the real brand hex. className/style only control size.
 */
import { brandMarkFloor } from './brandMarkSize';

const FLOOR = brandMarkFloor(320 / 286);

export default function BlueskyIcon({ className, style, ...rest }) {
  return (
    <svg className={className} style={{ ...style, ...FLOOR }} xmlns="http://www.w3.org/2000/svg" fill="#1185FE" viewBox="0 0 320 286" stroke="none" {...rest}>
      <path d="M69.364 19.146c36.687 27.806 76.147 84.186 90.636 114.439 14.489-30.253 53.948-86.633 90.636-114.439C277.107-.917 320-16.44 320 32.957c0 9.865-5.603 82.875-8.889 94.729-11.423 41.208-53.045 51.719-90.071 45.357 64.719 11.12 81.182 47.953 45.627 84.785-80 82.874-106.667-44.333-106.667-44.333s-26.667 127.207-106.667 44.333c-35.555-36.832-19.092-73.665 45.627-84.785-37.026 6.362-78.648-4.149-90.071-45.357C5.603 115.832 0 42.822 0 32.957 0-16.44 42.893-.917 69.364 19.147Z" />
    </svg>
  );
}
