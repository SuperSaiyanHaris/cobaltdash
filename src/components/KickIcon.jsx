/**
 * Custom Kick platform icon.
 * Kick doesn't have a lucide-react icon, so we use a custom SVG.
 * Color hardcoded to Kick's verified official green (#53FC19) instead of
 * `currentColor` — same reasoning as YouTubeIcon/TikTokIcon/TwitchIcon,
 * the site's previous `green-600` Tailwind tint was an approximation, not
 * the real brand hex. className/style only control size.
 */
import { brandMarkFloor } from './brandMarkSize';

const FLOOR = brandMarkFloor(24 / 24);

export default function KickIcon({ className, style, ...rest }) {
  return (
    <svg className={className} style={{ ...style, ...FLOOR }} xmlns="http://www.w3.org/2000/svg" fill="#53FC19" viewBox="0 0 24 24" {...rest}>
      <path d="M2.86957 1.5h6.84782v4.56522H12V3.78261h2.2826V1.5h6.8478v6.84783h-2.2826v2.28257h-2.2826v2.7392h2.2826v2.2826h2.2826V22.5h-6.8478v-2.2826H12v-2.2826H9.71739V22.5H2.86957v-21Z" />
    </svg>
  );
}
