/**
 * Official Twitch glyph, fixed brand color.
 *
 * Previously rendered via lucide-react's generic `Twitch` icon, tinted
 * `text-purple-500` (Tailwind's #a855f7) — visibly off from Twitch's actual
 * brand purple, #9146FF (confirmed via brand.twitch.tv's published palette:
 * #9146ff, #000000, #f0f0ff). Same pattern as YouTubeIcon/TikTokIcon: colors
 * are hardcoded and ignore any inherited text color, so className/style only
 * control size.
 */
import { brandMarkFloor } from './brandMarkSize';

const FLOOR = brandMarkFloor(24 / 24);

export default function TwitchIcon({ className, style, ...rest }) {
  return (
    <svg className={className} style={{ ...style, ...FLOOR }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...rest}>
      <path
        fill="#9146FF"
        d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"
      />
    </svg>
  );
}
