import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import CreatorAvatar from './CreatorAvatar';
import { formatNumber } from '../lib/utils';

/**
 * One row of the browser-mockup rankings table used in the home page
 * product preview and the Featured Listings preview. Shared so the two
 * mockups can't drift apart.
 *
 * Instead of a per-row sparkline (looked flat/lifeless for most rows, since
 * large creators' subscriber counts barely move day to day), each row shows
 * a proportional "share" bar against the list leader plus a real 30-day
 * growth chip when available. Always reads as intentional, never flat. Top-3
 * rows get the same amber/slate/bronze medal tint already used on the rank
 * badge carried through to the bar, avatar ring, and a faint row wash, so
 * the podium reads as a single deliberate visual tier instead of a plain list.
 *
 * Props:
 *   rank: 1-based position (medal styling for 1-3)
 *   creator: rankings_cache row or null (renders fallbackName + dashes)
 *   fallbackName: name shown when creator is null
 *   maxValue: subscribers of the list leader, used to scale the share bar
 */
const TIER = {
  1: {
    badge: 'bg-gradient-to-br from-amber-100 to-yellow-200 text-amber-800 ring-1 ring-amber-300',
    bar: 'bg-gradient-to-r from-amber-400 to-yellow-500',
    ring: 'ring-2 ring-amber-200 ring-offset-1 ring-offset-white',
    row: 'bg-amber-50/50',
  },
  2: {
    badge: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 ring-1 ring-slate-300',
    bar: 'bg-gradient-to-r from-slate-400 to-slate-500',
    ring: 'ring-2 ring-slate-200 ring-offset-1 ring-offset-white',
    row: '',
  },
  3: {
    badge: 'bg-gradient-to-br from-orange-100 to-amber-200 text-orange-800 ring-1 ring-orange-300',
    bar: 'bg-gradient-to-r from-orange-400 to-amber-500',
    ring: 'ring-2 ring-orange-200 ring-offset-1 ring-offset-white',
    row: '',
  },
};

export default function PreviewRankingRow({ rank, creator, fallbackName, maxValue }) {
  const displayName = creator?.display_name || fallbackName;
  const tier = TIER[rank];

  const pct = creator?.subscribers && maxValue
    ? Math.min(100, Math.max((creator.subscribers / maxValue) * 100, 6))
    : 0;
  const growth = creator?.growth30d;

  return (
    <div className={`grid grid-cols-[28px_1fr_auto] sm:grid-cols-[28px_1fr_92px_92px] items-center gap-3 sm:gap-4 px-3 py-3 rounded-xl ${tier?.row || ''}`}>
      <span className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-xs font-bold tabular-nums ${tier?.badge || 'bg-neutral-100 text-neutral-500'}`}>
        {rank}
      </span>
      <div className="flex items-center gap-2.5 min-w-0">
        <CreatorAvatar src={creator?.profile_image} name={displayName} size="sm" className={tier?.ring} />
        <p className="text-sm font-semibold text-neutral-900 truncate">{displayName}</p>
      </div>
      <div className="hidden sm:flex items-center">
        <div className="w-full h-1.5 rounded-full bg-neutral-100 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${tier?.bar || 'bg-neutral-900'}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, delay: rank * 0.06, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-[15px] font-bold text-neutral-900 tabular-nums leading-tight">
          {creator?.subscribers ? formatNumber(creator.subscribers) : '—'}
        </p>
        {growth > 0 && (
          <p className="hidden sm:flex items-center justify-end gap-0.5 text-[10px] font-medium text-emerald-600 tabular-nums">
            <TrendingUp className="w-2.5 h-2.5" />
            {formatNumber(growth)}
          </p>
        )}
      </div>
    </div>
  );
}
