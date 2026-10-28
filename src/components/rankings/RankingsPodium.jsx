import { useState } from 'react';
import { Link } from 'react-router-dom';
import CardShine from '../CardShine';
import { resizedAvatarUrl } from '../../lib/avatarUrl';
import { formatNumber } from '../../lib/utils';

// Top 3 of a rankings page as full-art cards on a podium: #2 left, #1 raised
// in the middle, #3 right. The creator's own photo fills the card, framed in
// gold, silver or bronze foil, with just the name and one big number, so the
// card reads at a glance. Desktop only: three across on a phone is ~100px a
// card, and a stacked version pushed the list down, so phones go straight to
// the list. Foil is a metallic gradient edge with a neutral shadow, never a
// colored glow (design rules).
const ORDER = [1, 0, 2]; // render #2, #1, #3
const PLINTH = ['h-16', 'h-10', 'h-6'];

const FOIL = [
  { edge: 'linear-gradient(135deg,#fff7d6 0%,#f5c542 22%,#a86b12 48%,#fde68a 70%,#b7791f 100%)', medal: 'linear-gradient(160deg,#fff3c4,#e2a72e 55%,#9a5b0c)', ink: '#3b2604', name: 'Gold' },
  { edge: 'linear-gradient(135deg,#ffffff 0%,#d4d4d8 25%,#71717a 50%,#f4f4f5 72%,#a1a1aa 100%)', medal: 'linear-gradient(160deg,#ffffff,#c4c4cc 55%,#6b6b73)', ink: '#27272a', name: 'Silver' },
  { edge: 'linear-gradient(135deg,#ffe4cc 0%,#e7955a 25%,#8a3f12 50%,#f6b98a 72%,#a5521e 100%)', medal: 'linear-gradient(160deg,#ffd9bd,#cf7a3d 55%,#7c3510)', ink: '#3a1a06', name: 'Bronze' },
];

function FullArtCard({ creator, place, stat, Icon, first }) {
  const foil = FOIL[place];
  const [broken, setBroken] = useState(false);
  const src = creator.profile_image && !broken ? resizedAvatarUrl(creator.profile_image, 600) : null;
  const initials = (creator.display_name || creator.username || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <div
      className={`relative aspect-[5/7] rounded-[6.4%/4.571%] p-[3px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.75)] ${first ? 'w-[230px]' : 'w-[190px]'}`}
      style={{ background: foil.edge }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[5.6%/4%] bg-[#121218]">
        {src ? (
          <img
            src={src}
            alt=""
            loading="eager"
            decoding="async"
            draggable="false"
            fetchpriority={first ? 'high' : undefined}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover select-none"
          />
        ) : (
          // No photo (most music artists): a typographic full art instead.
          <div className="absolute inset-0 hero-dot-grid flex items-center justify-center">
            <span className="text-6xl font-black tracking-tight text-white/85">{initials}</span>
          </div>
        )}

        {/* Darken the lower half so the name and number always read. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black via-black/80 to-transparent" />

        {/* Medal with the place. */}
        <span
          className="absolute left-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full text-base font-black tabular-nums ring-1 ring-black/30"
          style={{ background: foil.medal, color: foil.ink }}
        >
          {place + 1}
        </span>
        {Icon && (
          <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/15">
            <Icon className="h-3.5 w-3.5 text-white" />
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 px-3 pb-3 text-center">
          <p className={`truncate font-extrabold tracking-tight text-white ${first ? 'text-lg' : 'text-base'}`}>
            {creator.display_name || creator.username}
          </p>
          <div className="mx-auto mt-2 rounded-lg bg-white/[0.08] px-2 py-1.5 ring-1 ring-white/15">
            <p className={`font-black tabular-nums leading-none text-white ${first ? 'text-[28px]' : 'text-2xl'}`}>{stat.value}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{stat.label}</p>
          </div>
        </div>

        <CardShine tier="legendary" />
      </div>
    </div>
  );
}

/**
 * `stat(creator)` returns { value, label } for the number the current tab
 * ranks by (followers, hours watched, growth...). Defaults to followers.
 */
export default function RankingsPodium({ creators, stat, icon }) {
  const top = (creators || []).slice(0, 3);
  if (top.length < 3) return null;
  const statFor = stat || ((c) => ({ value: formatNumber(c.subscribers), label: 'Followers' }));

  return (
    <div className="hidden sm:grid mt-10 grid-cols-3 items-end gap-6 max-w-3xl mx-auto">
      {ORDER.map((i) => {
        const c = top[i];
        const first = i === 0;
        return (
          <Link
            key={c.id || c.username}
            to={`/${c.platform}/${c.username}`}
            className="group flex flex-col items-center"
            aria-label={`#${i + 1} ${c.display_name}`}
          >
            <FullArtCard creator={c} place={i} stat={statFor(c)} Icon={icon} first={first} />
            <div className={`mt-4 w-full ${PLINTH[i]} rounded-t-xl bg-gradient-to-b from-white/[0.09] to-transparent border-t border-x border-white/10`} />
          </Link>
        );
      })}
    </div>
  );
}
