import { Link } from 'react-router-dom';
import { cardImageUrl } from '../../lib/cardUrl';
import { formatNumber } from '../../lib/utils';

// "Nearby in the rankings": the creators ranked just above and below this one
// on the same platform, shown as their holographic cards. It's a scale signal
// (rank proximity), not a content match, so the copy is about size.
export default function SimilarCreators({ creators, platform, platformName, primaryLabel, excludeId }) {
  const filtered = (creators || []).filter((c) => c.id !== excludeId);
  if (filtered.length === 0) return null;

  return (
    <div className="mt-12 pt-10 border-t border-neutral-200">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Nearby in the rankings</p>
      <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">Similar-sized {platformName} creators</h2>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-6">
        {filtered.map((c) => (
          <Link key={c.id} to={`/${platform}/${c.username}`} className="block">
            <img
              src={cardImageUrl(platform, c.username)}
              alt={`${c.display_name} card`}
              width="250"
              height="350"
              loading="lazy"
              draggable="false"
              onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
              className="w-full h-auto rounded-[6.4%/4.571%] bg-[#15151c] select-none opacity-0 transition-opacity duration-500 shadow-[0_14px_28px_-14px_rgba(0,0,0,0.55)]"
            />
            <p className="mt-2.5 text-sm font-bold text-neutral-900 truncate">{c.display_name}</p>
            <p className="text-xs font-semibold text-neutral-700 tabular-nums">
              #{formatNumber(c.rank_position)} · {formatNumber(c.subscribers)} {primaryLabel}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
