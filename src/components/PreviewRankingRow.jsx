import { TrendingUp } from 'lucide-react';
import CreatorAvatar from './CreatorAvatar';
import { formatNumber } from '../lib/utils';

/**
 * One row of the rankings table used in the home page product preview
 * (ranks 4+, ranks 1-3 render as a podium via RankingPodium in Home.jsx)
 * and the Featured Listings preview (full list). Shared so the previews
 * can't drift apart.
 *
 * Rank badge is a flat single-tint tier color for 1-3 (never a gradient —
 * see CLAUDE.md's no-glow-blob / flat-color rule), plain neutral otherwise.
 * No share-of-#1 bar: the number and growth chip on the right carry the
 * comparison, same as the real Rankings.jsx rows.
 *
 * Props:
 *   rank: 1-based position (flat tier tint for 1-3)
 *   creator: rankings_cache row or null (renders fallbackName + dashes)
 *   fallbackName: name shown when creator is null
 */
const TIER_BADGE = {
  1: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  2: 'bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200',
  3: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
};

export default function PreviewRankingRow({ rank, creator, fallbackName }) {
  const displayName = creator?.display_name || fallbackName;
  const growth = creator?.growth30d;

  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-neutral-100 last:border-b-0">
      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-bold tabular-nums flex-shrink-0 ${TIER_BADGE[rank] || 'bg-neutral-100 text-neutral-400'}`}>
        {rank}
      </span>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <CreatorAvatar src={creator?.profile_image} name={displayName} size="sm" />
        <p className="text-sm font-semibold text-neutral-900 truncate">{displayName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[15px] font-bold text-neutral-900 tabular-nums leading-tight">
          {creator?.subscribers ? formatNumber(creator.subscribers) : '-'}
        </p>
        {growth > 0 && (
          <p className="flex items-center justify-end gap-0.5 text-[10px] font-medium text-emerald-600 tabular-nums">
            <TrendingUp className="w-2.5 h-2.5" />
            {formatNumber(growth)}
          </p>
        )}
      </div>
    </div>
  );
}
