import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartSkeleton, TextBoneSkeleton } from '../../components/Skeleton';
import { Clock, ExternalLink, Eye, MessageCircle, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLATFORM_DISPLAY_NAMES } from '../../lib/constants';
import { buildYouTubeSeries, findNextMilestone, fmtMilestone, fmtSigned, formatEarningsSingle, formatHoursWatched, getPercentileBand, renderNoHistoryMessage } from './verdictHelpers';
import { formatNumber, formatRelativeTime } from '../../lib/utils';
import { useMemo, useState } from 'react';

// ============================================================================
// Verdict-first layout for the other 8 platforms (added 2026-08-28).
// Same structure/pattern as YouTubeVerdictSection above, generalized via a
// per-platform config table instead of 8 near-duplicate components — mirrors
// how GrowthChart already branches its metrics array per platform. Every
// field referenced here is real (creator/metrics/rankContext/peakStats, the
// same objects the rest of the page already computes) — no platform gets a
// stat cell, a chart metric, a revenue estimate, or a third tab it doesn't
// have real data for. Notably: no platform except YouTube and Kick gets a
// revenue estimate (no CPM methodology exists for the others in this
// codebase, and inventing one would be fabricating a number). Kick is the
// exception because its tracked number IS the paid subscriber count, and the
// sub price ($4.99 US) and creator split (95/5) are public — so subs x price x
// split is arithmetic, not a guess. It's labelled a ceiling ("up to") since
// regional pricing, fees and taxes can only push it down. No "recent items" tab
// unless it has one real item to show (a single latest post for Rumble/
// Mastodon/Substack, real top tracks for Music) — never a fabricated list.
// ============================================================================

export const GENERIC_PLATFORM_CONFIG = {
  twitch: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }],
    hasLiveCount: true,
    liveLabel: 'Live follower count',
    thirdTab: null,
  },
  kick: {
    primaryLabel: 'Paid Subscribers',
    chartMetrics: [{ value: 'subscribers', label: 'Paid Subscribers', dataKey: 'subscribers' }],
    hasLiveCount: true,
    liveLabel: 'Live paid subscriber count',
    thirdTab: null,
    // Kick's public US sub price and creator share (95/5 split). See the
    // comment above GENERIC_PLATFORM_CONFIG for why Kick gets an estimate.
    subRevenue: { price: 4.99, creatorShare: 0.95 },
  },
  tiktok: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'views', label: 'Likes', dataKey: 'views' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  bluesky: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Posts', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  mastodon: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Posts', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: null,
  },
  rumble: {
    primaryLabel: 'Followers',
    chartMetrics: [{ value: 'subscribers', label: 'Followers', dataKey: 'subscribers' }, { value: 'videos', label: 'Videos', dataKey: 'videos' }],
    hasLiveCount: false,
    thirdTab: 'latestPost',
  },
  substack: {
    primaryLabel: 'Subscribers',
    chartMetrics: [{ value: 'subscribers', label: 'Subscriber Reach', dataKey: 'subscribers' }],
    hasLiveCount: false,
    thirdTab: 'latestPost',
    noGrowthRate: true, // subscriber value is an order-of-magnitude band — a % would be misleading
  },
  music: {
    primaryLabel: 'Monthly Listeners',
    chartMetrics: [{ value: 'subscribers', label: 'Listeners', dataKey: 'subscribers' }, { value: 'views', label: 'Plays', dataKey: 'views' }],
    hasLiveCount: true,
    liveLabel: 'Live listener count',
    thirdTab: 'topTracks',
    noMilestone: true, // monthly listeners is a rolling 30-day window, not monotonically increasing
  },
};

function buildGenericVerdict({ platform, creator, metrics, rankContext, peakStats, primaryLabel, readingsCount }) {
  const rank = rankContext?.rank;
  const total = rankContext?.total;
  const dailySubs = metrics?.dailyAverage?.subs ?? 0;
  const primaryCount = creator.subscribers ?? creator.followers ?? 0;
  const isAllTimeHigh = peakStats?.subscribers ? primaryCount >= peakStats.subscribers : primaryCount > 0;
  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const noun = primaryLabel.toLowerCase();

  // Fewer than 2 readings means dailyAverage.subs is mathematically forced to
  // 0 (comparing the one reading to itself) — that's "no trend data yet," not
  // "flat." Distinguishing this from a genuine plateau is the whole point.
  const tooNewForTrend = (readingsCount ?? 0) < 2;

  // dailyAverage.subs is measured across the last 30 available ROWS, which
  // can span weeks further back than today if this creator's collection has
  // stalled (an outage, a dead scraper — not hypothetical, this is exactly
  // what happened to Rumble before it was delisted). That average is real
  // for the window it covers, but presenting it as "currently gaining X a
  // day" misrepresents a live rate when the data itself is old. 7 days is
  // well outside normal collection jitter (daily collection runs 3x/day) so
  // it only fires on a genuine stall, not routine timing noise.
  const daysSinceLastUpdate = metrics?.daysSinceLastUpdate ?? 0;
  const dataIsStale = !tooNewForTrend && daysSinceLastUpdate >= 7;

  // metrics (and therefore daysSinceLastUpdate) is null whenever there are
  // fewer than 2 readings, so the staleness check above can't fire for a
  // creator stuck at 0-1 readings — found live testing a real Substack
  // creator (mikebrock) added 2026-05-31 with exactly one reading ever: it
  // still rendered "Just added to tracking, check back in a few days" 108
  // days later. Falls back to how long the row has existed in our DB, the
  // one signal that's always available even with no stats history at all.
  const createdAt = creator?.dbCreatedAt ? new Date(creator.dbCreatedAt) : null;
  const daysSinceCreated = createdAt ? Math.floor((new Date() - createdAt) / (1000 * 60 * 60 * 24)) : 0;
  const stuckSinceCreation = tooNewForTrend && daysSinceCreated >= 7;

  // TikTok rounds large accounts in coarse steps (nearest 100 in the low
  // hundred-thousands, nearest 100,000 past ~1M — confirmed directly against
  // TikTok's own data 2026-09-06, see CLAUDE.md). A account sitting well
  // above that floor can show an exact 0 day-over-day delta for weeks while
  // genuinely growing underneath the rounding step, so asserting "flat" as
  // fact would be a real, checkable-and-wrong claim, not just an insight.
  const roundingMayHideMovement = platform === 'tiktok' && primaryCount >= 100000;

  const rankClause = rank
    ? (rank === 1 ? <><span className="font-semibold text-neutral-900">#1</span> of {formatNumber(total)} tracked {platformName} creators.</> : <>Ranked <span className="font-semibold text-neutral-900">#{formatNumber(rank)}</span> of {formatNumber(total)} tracked {platformName} creators.</>)
    : null;

  return (
    <>
      {rankClause}{rankClause ? ' ' : ''}
      {stuckSinceCreation ? (
        <>Added to tracking {daysSinceCreated} days ago, but no new data since. Last known count: <span className="font-semibold text-neutral-900">{formatNumber(primaryCount)} {noun}</span>.</>
      ) : tooNewForTrend ? (
        <>Just added to tracking, so there's no growth trend yet. Check back in a few days.</>
      ) : dataIsStale ? (
        <>No new data in {daysSinceLastUpdate} days. Last known count: <span className="font-semibold text-neutral-900">{formatNumber(primaryCount)} {noun}</span>.</>
      ) : dailySubs !== 0 ? (
        <>{dailySubs > 0 ? 'Gaining' : 'Losing'} <span className={`font-semibold ${dailySubs > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatNumber(Math.abs(dailySubs))} {noun}</span> a day{isAllTimeHigh && dailySubs > 0 ? '; currently at an all-time high.' : '.'}</>
      ) : roundingMayHideMovement ? (
        <>{noun.charAt(0).toUpperCase() + noun.slice(1)} count hasn't moved in our data, but TikTok reports accounts this size in rounded steps, so small day-to-day gains may not show up until they cross the next one.</>
      ) : (
        <>{noun.charAt(0).toUpperCase() + noun.slice(1)} count has been flat recently.</>
      )}
    </>
  );
}

export default function GenericVerdictSection({ platform, creator, statsHistory, statsReady, metrics, peakStats, rankContext, musicTracks, musicAlbums }) {
  const config = GENERIC_PLATFORM_CONFIG[platform];
  const [activeTab, setActiveTab] = useState('daily');
  const [chartMetric, setChartMetric] = useState(config.chartMetrics[0].value);
  const [chartRange, setChartRange] = useState(30);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [scrubIndex, setScrubIndex] = useState(null);

  const total = rankContext?.total;
  const rank = rankContext?.rank;
  const band = getPercentileBand(rank, total);
  const primaryCount = creator.subscribers ?? creator.followers ?? 0;

  const series = useMemo(() => buildYouTubeSeries(statsHistory, chartRange), [statsHistory, chartRange]);
  const currentMetric = config.chartMetrics.find((m) => m.value === chartMetric) || config.chartMetrics[0];
  const values = series.map((d) => d[currentMetric.dataKey]);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;
  const span = maxV - minV || 1;
  const pad = span * 0.12;
  const relData = series.map((d) => ({ ...d, rel: d[currentMetric.dataKey] - minV }));
  const heroValue = formatNumber(currentMetric.dataKey === 'subscribers' ? primaryCount : creator[currentMetric.dataKey === 'views' ? 'totalViews' : 'totalPosts']);
  const netGrowth = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const dailyReadingsRows = [...series].reverse();

  // See the same const in YouTubeVerdictSection for why this exists.
  const stillLoadingStats = !statsReady && statsHistory.length < 2;

  const nearestMilestone = config.noMilestone ? null : findNextMilestone(primaryCount, metrics?.dailyAverage?.subs);

  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const hasThirdTabContent = config.thirdTab === 'latestPost' ? !!creator.latestPost
    : config.thirdTab === 'topTracks' ? musicTracks?.length > 0
    : false;

  const tabs = [
    { key: 'daily', label: 'Daily readings', count: dailyReadingsRows.length },
    ...(hasThirdTabContent ? [{ key: 'third', label: config.thirdTab === 'topTracks' ? 'Top tracks' : 'Latest post', count: null }] : []),
    { key: 'about', label: 'About', count: null },
  ];

  return (
    <div>
      {stillLoadingStats ? (
        <TextBoneSkeleton className="h-[15px] w-72 max-w-full" />
      ) : (
        <p className="text-[15px] leading-relaxed text-neutral-800 max-w-2xl text-pretty">
          {buildGenericVerdict({ platform, creator, metrics, rankContext, peakStats, primaryLabel: config.primaryLabel, readingsCount: statsHistory?.length })}
        </p>
      )}

      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {config.chartMetrics.length > 1 ? (
            <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
              {config.chartMetrics.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setChartMetric(m.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    chartMetric === m.value ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : <div />}
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg overflow-x-auto max-w-full">
            {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
              <button
                key={r.v}
                onClick={() => setChartRange(r.v)}
                className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartRange === r.v ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {r.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-3 mt-6">
          <p className="text-3xl sm:text-[44px] font-bold tabular-nums text-neutral-900 leading-none tracking-tight">{heroValue}</p>
          <div className="pb-1">
            {stillLoadingStats ? (
              <TextBoneSkeleton className="h-4 w-12 mb-1" />
            ) : (
              <p className={`text-sm font-semibold tabular-nums ${netGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSigned(netGrowth)}</p>
            )}
            <p className="text-xs text-neutral-500">last {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</p>
          </div>
        </div>

        <div className="h-56 sm:h-64 mt-4 cursor-pointer md:cursor-default" onClick={() => setDrilldownOpen(true)}>
          {stillLoadingStats ? (
            <ChartSkeleton />
          ) : relData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={`genVerdictGradient-${platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} interval="preserveStartEnd" minTickGap={50} />
                <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={56} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0].payload[currentMetric.dataKey];
                    return (
                      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2">
                        <p className="text-xs text-neutral-500">{new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{formatNumber(raw)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2} fill={`url(#genVerdictGradient-${platform})`} dot={false} activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            renderNoHistoryMessage(creator)
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-200/80 text-xs sm:text-sm text-neutral-600">
          {stillLoadingStats ? (
            <TextBoneSkeleton className="h-3.5 w-40" />
          ) : (
            <>
              <span>{series.length} daily readings</span>
              <span className="text-neutral-300">&middot;</span>
              <span>net {fmtSigned(netGrowth)}</span>
            </>
          )}
          <span className="flex-1" />
          {nearestMilestone && (
            <button onClick={() => setDrilldownOpen(true)} className="text-left hover:text-neutral-900 transition-colors">
              Next milestone <span className="font-semibold text-neutral-900">{fmtMilestone(nearestMilestone.milestone)} {config.primaryLabel.toLowerCase()}</span> in ~{nearestMilestone.days} days
              <span className="text-neutral-400"> ({nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, at the current pace)</span>
            </button>
          )}
        </div>
      </div>

      {/* Stat strip — cells vary per platform, every value real */}
      <div className="grid grid-cols-2 lg:grid-cols-3 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-neutral-200/80 mt-6">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{config.primaryLabel}</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(primaryCount)}</p>
          <p className="text-xs text-emerald-600 mt-1">{peakStats?.subscribers && primaryCount >= peakStats.subscribers ? 'all-time high' : ''}</p>
        </div>

        {(platform === 'twitch' || platform === 'kick') && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Hours watched</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{creator.hoursWatchedMonth ? formatHoursWatched(creator.hoursWatchedMonth) : '—'}</p>
            <p className="text-xs text-neutral-500 mt-1">last 30 days</p>
          </div>
        )}
        {platform === 'tiktok' && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Total likes</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
          </div>
        )}
        {(platform === 'bluesky' || platform === 'mastodon') && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Posts</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalPosts)}</p>
          </div>
        )}
        {platform === 'music' && (
          <>
            <div className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Total plays</p>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
            </div>
            {creator.description && (
              <div className="p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Genres</p>
                <p className="text-sm font-semibold text-neutral-900 mt-1.5 line-clamp-2">{creator.description}</p>
              </div>
            )}
          </>
        )}

        {!config.noGrowthRate && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">30-day {config.primaryLabel.toLowerCase()}</p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{metrics ? fmtSigned(metrics.last30Days.subs) : '—'}</p>
            {metrics?.growthRates && <p className={`text-xs mt-1 ${metrics.growthRates.thirtyDay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{metrics.growthRates.thirtyDay >= 0 ? '+' : ''}{metrics.growthRates.thirtyDay.toFixed(2)}% growth rate</p>}
          </div>
        )}

        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Platform rank</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{rank ? `#${formatNumber(rank)}` : '—'}</p>
          <p className="text-xs text-neutral-500 mt-1">{band != null ? `top ${band}% of tracked` : total ? `of ${formatNumber(total)} tracked` : ''}</p>
        </div>
      </div>

      {/* Sub revenue estimate — Kick only (see subRevenue in GENERIC_PLATFORM_CONFIG) */}
      {config.subRevenue && (() => {
        const perSub = config.subRevenue.price * config.subRevenue.creatorShare;
        const monthly = primaryCount * perSub;
        const delta30 = metrics?.last30Days?.subs;
        return (
          <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6 mt-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Estimated sub revenue</p>
              <span className="flex-1" />
              <p className="text-xs text-neutral-500">{formatNumber(primaryCount)} subs &times; ${config.subRevenue.price.toFixed(2)} &times; {Math.round(config.subRevenue.creatorShare * 100)}% creator share</p>
            </div>
            <div className="flex flex-wrap items-end gap-6 mt-3">
              <div>
                <p className="text-2xl sm:text-3xl font-bold tabular-nums text-neutral-900 leading-none">up to {formatEarningsSingle(monthly)}</p>
                <p className="text-xs text-neutral-500 mt-1.5">per month &middot; {formatEarningsSingle(monthly * 12)} per year</p>
              </div>
              {delta30 != null && delta30 !== 0 && (
                <div>
                  <p className={`text-base font-semibold tabular-nums ${delta30 > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{delta30 > 0 ? '+' : '-'}{formatEarningsSingle(Math.abs(delta30) * perSub)}/mo</p>
                  <p className="text-xs text-neutral-500 mt-1">change over last 30 days</p>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-4 leading-relaxed">Subscriptions only, at the US price. Tips, sponsorships, and incentive payouts aren't public, and regional pricing, payment fees, and taxes can lower the real figure. Gifted subs are included in the count. <Link to="/kick/earnings" className="underline hover:text-neutral-800">Compare with the top 100 Kick streamers</Link>.</p>
          </div>
        );
      })()}

      {/* Live count row — only for platforms where numbers move fast enough to matter */}
      {config.hasLiveCount && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6 mt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{config.liveLabel}</p>
              <p className="text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{primaryCount.toLocaleString('en-US')}</p>
            </div>
          </div>
          <Link to={`/live/${platform}/${creator.username}`} className="text-sm font-medium text-neutral-900 hover:underline inline-flex items-center gap-1 flex-shrink-0">
            Open <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-6 mt-8 border-b border-neutral-200/80 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-shrink-0 text-sm font-medium pb-3 -mb-px border-b-2 transition-colors ${
              activeTab === t.key ? 'text-neutral-900 border-neutral-900' : 'text-neutral-500 border-transparent hover:text-neutral-700'
            }`}
          >
            {t.label}{t.count != null && <span className="text-neutral-400 font-normal ml-1.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'daily' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl overflow-hidden mt-4">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">{config.primaryLabel}</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">&Delta;</th>
                </tr>
              </thead>
              <tbody>
                {dailyReadingsRows.map((row, i) => {
                  const prev = dailyReadingsRows[i + 1];
                  const delta = prev ? row.subscribers - prev.subscribers : null;
                  return (
                    <tr key={row.date} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 text-neutral-900 tabular-nums">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-5 py-3 text-right font-medium text-neutral-900 tabular-nums">{formatNumber(row.subscribers)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-neutral-400'}`}>{delta != null ? fmtSigned(delta) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-neutral-100">
            {dailyReadingsRows.map((row, i) => {
              const prev = dailyReadingsRows[i + 1];
              const delta = prev ? row.subscribers - prev.subscribers : null;
              return (
                <div key={row.date} className="flex items-center gap-3 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-900 flex-1">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold tabular-nums ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-neutral-400'}`}>{delta != null ? fmtSigned(delta) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400 mt-0.5">&Delta; {config.primaryLabel.toLowerCase()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'third' && config.thirdTab === 'latestPost' && creator.latestPost && (
        <a
          href={creator.latestPost.url || `https://${creator.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group block mt-4 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 hover:border-neutral-300 transition-colors"
        >
          <div className="flex gap-4">
            {creator.latestPost.thumbnail && (
              <div className="flex-shrink-0 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden bg-neutral-100">
                <img src={creator.latestPost.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {creator.latestPost.title && <h3 className="text-base font-semibold text-neutral-900 leading-snug line-clamp-2 group-hover:underline">{creator.latestPost.title}</h3>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                {creator.latestPost.publishedAt && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatRelativeTime(creator.latestPost.publishedAt)}</span>}
                {creator.latestPost.views != null && <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.views)} views</span>}
                {creator.latestPost.reactions > 0 && <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.reactions)}</span>}
                {creator.latestPost.comments > 0 && <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{formatNumber(creator.latestPost.comments)}</span>}
              </div>
            </div>
          </div>
        </a>
      )}

      {activeTab === 'third' && config.thirdTab === 'topTracks' && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(musicTracks || []).slice(0, 6).map((track, i) => (
            <a
              key={i}
              href={track.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-4 hover:border-neutral-300 transition-colors"
            >
              <span className="text-xs font-mono text-neutral-400">{i + 1}</span>
              <p className="text-sm font-semibold text-neutral-900 line-clamp-2 mt-1">{track.name}</p>
              {track.playcount && <p className="text-xs text-neutral-500 mt-1 tabular-nums">{formatNumber(Number(track.playcount))} plays</p>}
            </a>
          ))}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-6 sm:p-7 mt-4 max-w-3xl">
          {creator.description && <p className="text-sm leading-relaxed text-neutral-700 text-pretty whitespace-pre-line">{creator.description}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-neutral-200/80">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Joined</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.createdAt ? new Date(creator.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Country</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.country || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Tracked since</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.dbCreatedAt ? new Date(creator.dbCreatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drill-down */}
      {drilldownOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col md:hidden">
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-200/80">
            <button onClick={() => { setDrilldownOpen(false); setScrubIndex(null); }} className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <p className="text-sm font-semibold text-neutral-900 flex-1">{currentMetric.label} &middot; {creator.displayName}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            {(() => {
              const idx = scrubIndex == null ? relData.length - 1 : scrubIndex;
              const pt = relData[idx];
              const prevPt = relData[idx - 1];
              const delta = pt && prevPt ? pt[currentMetric.dataKey] - prevPt[currentMetric.dataKey] : null;
              return pt ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{new Date(pt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="flex items-end gap-3 mt-2">
                    <p className="text-4xl font-bold tabular-nums text-neutral-900 leading-none">{formatNumber(pt[currentMetric.dataKey])}</p>
                    {delta != null && <p className={`text-sm font-semibold tabular-nums pb-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSigned(delta)} that day</p>}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">drag across the chart to read any day</p>
                </>
              ) : null;
            })()}
            <div
              className="relative mt-5"
              style={{ height: 280, touchAction: 'none' }}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
              onPointerMove={(e) => {
                if (e.buttons === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setScrubIndex(Math.round(f * (relData.length - 1)));
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id={`genDrilldownGradient-${platform}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 10 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={48} />
                  <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2.5} fill={`url(#genDrilldownGradient-${platform})`} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-neutral-400 tabular-nums">
              <span>{relData[0] && new Date(relData[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{relData[relData.length - 1] && new Date(relData[relData.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-5">
              {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
                <button key={r.v} onClick={() => { setChartRange(r.v); setScrubIndex(null); }} className={`h-9 rounded-lg text-xs font-semibold ${chartRange === r.v ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700'}`}>{r.l}</button>
              ))}
            </div>
            <div className="mt-5 border border-neutral-200/80 rounded-xl overflow-hidden divide-y divide-neutral-100">
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Total {config.primaryLabel.toLowerCase()}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{formatNumber(primaryCount)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Net over {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(netGrowth)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Best day</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.max(...relData.map((d, i) => i > 0 ? d[currentMetric.dataKey] - relData[i - 1][currentMetric.dataKey] : 0)))}</span></div>
            </div>
            {nearestMilestone && (
              <div className="mt-4 rounded-xl bg-neutral-900 text-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Next milestone</p>
                <p className="text-xl font-bold mt-1.5">{fmtMilestone(nearestMilestone.milestone)} {config.primaryLabel.toLowerCase()}</p>
                <p className="text-xs text-neutral-400 mt-1">~{nearestMilestone.days} days &middot; {nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at the current pace</p>
              </div>
            )}
            <div className="h-6" />
          </div>
          <div className="flex-shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200/80">
            <Link to={`/compare?creators=${platform}:${creator.username}`} className="flex-1 h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold flex items-center justify-center">Compare channels</Link>
          </div>
        </div>
      )}
    </div>
  );
}
