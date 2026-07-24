/**
 * Substack logo — the three stacked horizontal bars mark.
 * Color hardcoded to Substack's verified official orange (#FF6719, per
 * Substack's own design team) instead of `currentColor` — the site's
 * previous `orange-600` Tailwind tint was an approximation, not the real
 * brand hex. className/style only control size.
 */
import { brandMarkFloor } from './brandMarkSize';

const FLOOR = brandMarkFloor(24 / 24);

export default function SubstackIcon({ className, style, ...rest }) {
  return (
    <svg
      className={className}
      style={{ ...style, ...FLOOR }}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="#FF6719"
      {...rest}
    >
      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812H22.54V24l-10.54-5.91L1.46 24V10.812zM22.539 0H1.46v2.836h21.08V0z" />
    </svg>
  );
}
