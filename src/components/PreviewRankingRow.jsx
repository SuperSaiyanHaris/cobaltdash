import CreatorAvatar from './CreatorAvatar';
import Sparkline from './Sparkline';
import { formatNumber } from '../lib/utils';

/**
 * One row of the browser-mockup rankings table used in the home page
 * product preview and the Featured Listings preview. Shared so the two
 * mockups can't drift apart.
 *
 * Props:
 *   rank: 1-based position (medal styling for 1-3)
 *   creator: rankings_cache row or null (renders fallbackName + dashes)
 *   fallbackName: name shown when creator is null
 *   spark: number[] — real 30-day subscriber series; omitted = dash placeholder
 */
export default function PreviewRankingRow({ rank, creator, fallbackName, spark }) {
  const displayName = creator?.display_name || fallbackName;
  const medal =
    rank === 1 ? 'bg-gradient-to-br from-amber-100 to-yellow-200 text-amber-800 ring-1 ring-amber-300' :
    rank === 2 ? 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-1 ring-slate-300' :
    rank === 3 ? 'bg-gradient-to-br from-orange-100 to-amber-200 text-orange-800 ring-1 ring-orange-300' :
    'bg-neutral-100 text-neutral-500';

  return (
    <div className="grid grid-cols-[28px_1fr_auto_auto] sm:grid-cols-[28px_1fr_100px_70px] items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-lg">
      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-bold tabular-nums ${medal}`}>
        {rank}
      </span>
      <div className="flex items-center gap-2.5 min-w-0">
        <CreatorAvatar src={creator?.profile_image} name={displayName} size="sm" />
        <p className="text-sm font-semibold text-neutral-900 truncate">{displayName}</p>
      </div>
      <div className="hidden sm:flex items-center justify-end">
        <Sparkline data={spark || []} width={80} height={20} />
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-neutral-900 tabular-nums">
          {creator?.subscribers ? formatNumber(creator.subscribers) : '—'}
        </p>
      </div>
    </div>
  );
}
