// Small ShinyPass marks shown next to a handle (comments, replies, public
// page): the level chip in its card-rarity color and the pinned badge.
import { createElement } from 'react';
import { Gem, Flame, MessageCircle, LayoutGrid, Telescope, Crown, Award } from 'lucide-react';
import { badgeMeta, tierForLevel, levelFromXp } from '../../lib/shinyPass';
import { TIERS } from '../../lib/badgeCard';

const ICONS = { Gem, Flame, MessageCircle, LayoutGrid, Telescope, Crown };

export function BadgeIcon({ badge, className = 'w-3.5 h-3.5' }) {
  const b = badgeMeta(badge);
  return createElement(ICONS[b?.icon] || Award, { className, style: { color: b?.b || '#737373' }, strokeWidth: 2.4 });
}

/** Pinned badge as a compact pill. `dark` for use on dark bands. */
export function BadgePill({ badge, dark = false, size = 'sm' }) {
  const b = badgeMeta(badge);
  if (!b) return null;
  return (
    <span
      title={b.desc}
      className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap ${size === 'sm' ? 'px-1.5 py-[1px] text-[10.5px]' : 'px-2.5 py-1 text-xs'} ${dark ? 'bg-white/10 text-white border border-white/15' : 'bg-white text-neutral-800 border border-neutral-300'}`}
    >
      <BadgeIcon badge={badge} className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {b.name}
    </span>
  );
}

/** "LV 12" in the color of the user's card rarity. */
export function LevelChip({ xp, level: lv, dark = false }) {
  const level = lv ?? levelFromXp(xp).level;
  const t = TIERS[tierForLevel(level)];
  const color = tierForLevel(level) === 'COMMON' ? (dark ? '#D4D4D8' : '#525252') : t.c;
  return (
    <span
      title={`ShinyPass level ${level}`}
      className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[10.5px] font-black tabular-nums tracking-wide border ${dark ? 'bg-white/10' : 'bg-white'}`}
      style={{ color, borderColor: `${color}66` }}
    >
      LV {level}
    </span>
  );
}
