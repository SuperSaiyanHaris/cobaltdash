/**
 * Browser-mockup live preview of the Featured Listings product.
 *
 * Renders a faithful copy of the top-5 YouTube rankings table with the
 * sponsored row injected exactly where it would appear in production
 * (between #3 and #4). Used on:
 *   - Home.jsx ("Show up at the top." section)
 *   - Promote.jsx (under "How it works", as a what-you-get visual)
 *
 * Pass `topCreators` to render real names + avatars. If empty, falls back
 * to canonical YouTube top-5 so the preview never looks blank. Each row's
 * growth chip and the "Updated" timestamp come from real data
 * (rankings_cache.growth_30d / computed_at) — nothing in the table is
 * fabricated except the clearly-labeled sponsored demo row.
 */

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChartNoAxesColumnIncreasing, ArrowRight } from 'lucide-react';
import PreviewRankingRow from './PreviewRankingRow';
import { formatRelativeTimeShort } from '../lib/utils';

const FALLBACK_NAMES = ['MrBeast', 'T-Series', 'Cocomelon', 'SET India', 'Vlad and Niki'];
const SPONSORED_INDEX = 3; // After rank #3, before #4 — mirrors /rankings injection point

export default function FeaturedListingPreview({ topCreators = [], showCtas = true }) {
  const rows = (topCreators.length > 0 ? topCreators : Array(5).fill(null)).slice(0, 5);
  const updatedAt = topCreators[0]?.computedAt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl bg-white border border-neutral-200/80 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.22)] overflow-hidden"
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 bg-neutral-50">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <Link
          to="/rankings/youtube"
          className="flex-1 max-w-md mx-auto bg-white border border-neutral-200 rounded-md px-3 py-1 text-[11px] text-neutral-500 flex items-center gap-1.5 hover:border-neutral-300 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          shinypull.com/rankings/youtube
        </Link>
        <div className="w-12" />
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ChartNoAxesColumnIncreasing className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-neutral-900">Top YouTubers</h3>
          </div>
          {updatedAt && (
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Updated {formatRelativeTimeShort(updatedAt)}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {rows.map((creator, i) => {
            const items = [
              <PreviewRankingRow
                key={creator?.id || i}
                rank={i + 1}
                creator={creator}
                fallbackName={FALLBACK_NAMES[i]}
              />,
            ];
            if (i === SPONSORED_INDEX - 1) {
              items.push(
                <motion.div
                  key="sponsored-demo"
                  initial={{ opacity: 0, scaleY: 0.6 }}
                  whileInView={{ opacity: 1, scaleY: 1 }}
                  viewport={{ once: true, margin: '-20%' }}
                  transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="grid grid-cols-[28px_1fr_auto_auto] sm:grid-cols-[28px_1fr_100px_70px] items-center gap-3 sm:gap-4 px-3 py-3 rounded-lg bg-amber-50/60 border border-amber-200 origin-top"
                >
                  <span className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-medium uppercase tracking-[0.1em] flex-shrink-0 bg-amber-100 border border-amber-200 text-amber-700" title="Premium featured listing">
                    Ad
                  </span>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 text-[11px] font-semibold flex-shrink-0">
                      ★
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">Your Creator Here</p>
                      {/* amber-800, not amber-600: ~3:1 on this amber-50/60
                          background, under WCAG AA. amber-800 clears it. */}
                      <p className="text-[10px] text-amber-800 font-medium uppercase tracking-[0.1em]">Sponsored</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center justify-end text-[11px] text-amber-700 font-medium tabular-nums">
                    $149/mo
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      Claim slot <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </motion.div>
              );
            }
            return items;
          })}
        </div>

        {showCtas && (
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Link
              to="/promote"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium text-sm rounded-lg transition-colors"
            >
              See plans (from $49/mo)
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/rankings"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-neutral-800 font-semibold text-sm rounded-xl transition-all"
            >
              See it live
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}
