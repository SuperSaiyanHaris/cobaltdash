/**
 * Music platform icon.
 *
 * Unlike the other eight platform icons this is NOT a brand mark — the "Music"
 * platform aggregates listener data rather than representing one company, so
 * it uses lucide's generic music-note glyph and is free to be tinted (amber)
 * like any other UI icon.
 *
 * It exists as a component purely so the music platform picks up the same
 * height floor as the real brand marks. Without it, rows would show eight
 * icons at 22px and a 14px music note, which is the exact inconsistency the
 * shared floor is meant to remove. Use this anywhere Music identifies the
 * platform; keep importing lucide's `Music` directly for decorative use.
 */
import { Music } from 'lucide-react';
import { brandMarkFloor } from './brandMarkSize';

const FLOOR = brandMarkFloor(24 / 24);

export default function MusicIcon({ className, style, ...rest }) {
  return <Music className={className} style={{ ...style, ...FLOOR }} {...rest} />;
}
