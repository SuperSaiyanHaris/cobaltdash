/**
 * Official TikTok icon (the note "glitch" mark), from TikTok's own Dev
 * Portal Logo Pack — the black-fill variant meant for light backgrounds
 * (their pack also ships a white-fill variant for dark badges; this site
 * is light-mode throughout). The previous hand-drawn version of this
 * component (traced from a third-party wordmark SVG) had visibly wrong
 * proportions. This is a base64-embedded PNG cropped directly from the
 * official asset — TikTok's guidelines explicitly prohibit recoloring or
 * altering the logo, so an exact pixel copy is the correct approach here,
 * not a redrawn vector approximation. className/style control size only.
 */
import { brandMarkFloor } from './brandMarkSize';
import { TIKTOK_MARK_DATA_URI } from '../lib/tiktokMark';

const TIKTOK_ICON_DATA_URI = TIKTOK_MARK_DATA_URI;

// Intrinsic size of the embedded PNG is 453 x 512, so this mark is taller
// than it is wide — the opposite of YouTube's.
const FLOOR = brandMarkFloor(453 / 512);

export default function TikTokIcon({ className, style, ...rest }) {
  return (
    <img
      src={TIKTOK_ICON_DATA_URI}
      alt="TikTok"
      className={className}
      style={{ objectFit: 'contain', ...style, ...FLOOR }}
      {...rest}
    />
  );
}
