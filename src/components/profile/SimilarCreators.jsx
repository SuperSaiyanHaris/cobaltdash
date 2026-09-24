import CreatorAvatar from '../../components/CreatorAvatar';
import { Link } from 'react-router-dom';
import { formatNumber } from '../../lib/utils';

// "Similar in size" — creators ranked just above/below this one on the same
// platform. It's a scale signal (rank proximity), not a content-category
// match, so the copy is worded around size rather than claiming similarity
// of niche/content.
export default function SimilarCreators({ creators, platform, platformName, primaryLabel, excludeId }) {
  const filtered = (creators || []).filter((c) => c.id !== excludeId);
  if (filtered.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t border-neutral-200/80">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600 mb-1">Nearby in the rankings</p>
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 mb-4">Similar-sized {platformName} creators</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/${platform}/${c.username}`}
            className="flex items-center gap-3 p-3 bg-white border border-neutral-200/80 rounded-xl hover:border-neutral-300 transition-colors"
          >
            <CreatorAvatar src={c.profile_image} name={c.display_name} size="md" className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{c.display_name}</p>
              <p className="text-xs text-neutral-500 tabular-nums mt-0.5">
                {formatNumber(c.subscribers)} {primaryLabel} · #{formatNumber(c.rank_position)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
