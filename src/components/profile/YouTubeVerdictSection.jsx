import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartSkeleton, TextBoneSkeleton } from '../../components/Skeleton';
import { ExternalLink, Eye, MessageCircle, Play, ThumbsUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildYouTubeSeries, computeViewsMomentum, findNextMilestone, fmtMilestone, fmtSigned, formatEarningsSingle, getPercentileBand, renderNoHistoryMessage } from './verdictHelpers';
import { formatNumber, formatRelativeTime } from '../../lib/utils';
import { useMemo, useState } from 'react';

// ============================================================================
// Verdict-first profile layout (added 2026-08-28, generalized to all 9
// platforms same day). Replaces the old flat stack of equally-weighted cards
// with: a plain-language verdict sentence, one prominent relative-axis chart,
// a stat strip, a revenue+live row (YouTube/Twitch/Kick/Music only), and
// tabbed sections (Daily readings first, per the standing instruction —
// Recent videos/Latest post/Top tracks second, About third).
//
// Every number here derives from the SAME `metrics`/`statsHistory` the rest
// of the page already computes — no parallel calculation, so the chart's net
// growth, the hero delta, and the stat strip can never disagree with each
// other the way the old page's cards sometimes did.
//
// YouTube gets its own bespoke section (YouTubeVerdictSection) since it's the
// only platform with a revenue estimate and a real per-video "Recent videos"
// list. The other 8 platforms share GenericVerdictSection, configured per
// platform via GENERIC_PLATFORM_CONFIG below — each only gets a stat cell,
// chart metric, or tab it has real data for (see that section's own comment).
// ============================================================================


function buildYouTubeVerdict({ creator, metrics, rankContext, peakStats }) {
  const rank = rankContext?.rank;
  const total = rankContext?.total;
  const dailyViews = metrics?.dailyAverage?.views ?? 0;
  const weeklyViews = metrics?.weeklyAverage?.views ?? 0;
  // "Accelerating" is only said when the last-7-day pace genuinely beats the
  // last-30-day pace — not asserted by default.
  const accelerating = weeklyViews > 0 && dailyViews > weeklyViews;
  const isAllTimeHigh = peakStats?.subscribers ? creator.subscribers >= peakStats.subscribers : creator.subscribers > 0;
  // The rounding-artifact clause only renders when it's genuinely true: 7-day
  // subscriber delta reads as zero while there's real 30-day movement.
  const sevenDayFlat = metrics && metrics.last14Days && metrics.growthRates &&
    Math.round(metrics.growthRates.sevenDay * (creator.subscribers || 1) / 100) === 0 &&
    (metrics.last30Days?.subs || 0) !== 0;

  const rankClause = rank
    ? (rank === 1 ? <><span className="font-semibold text-neutral-900">#1</span> of {formatNumber(total)} tracked YouTube creators.</> : <>Ranked <span className="font-semibold text-neutral-900">#{formatNumber(rank)}</span> of {formatNumber(total)} tracked YouTube creators.</>)
    : null;

  return (
    <>
      {rankClause}{rankClause ? ' ' : ''}
      {dailyViews > 0 ? (
        <>Views climbing <span className="font-semibold text-emerald-600">{formatNumber(dailyViews)} views</span> a day{accelerating ? ' and accelerating' : ''}
          {isAllTimeHigh && <>; subscriber count is at an all-time high{sevenDayFlat ? ", but YouTube only reports three digits, so week-over-week reads as flat" : ''}</>}.
        </>
      ) : (
        <>Not enough recent data yet to show a growth trend.</>
      )}
    </>
  );
}

export default function YouTubeVerdictSection({ creator, statsHistory, statsReady, metrics, peakStats, rankContext, dbCreatorId, recentVideos }) {
  const [activeTab, setActiveTab] = useState('daily'); // daily first, per standing instruction
  const [chartMetric, setChartMetric] = useState('views');
  const [chartRange, setChartRange] = useState(30);
  const [cpm, setCpm] = useState(3.5);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [scrubIndex, setScrubIndex] = useState(null);

  const total = rankContext?.total;
  const rank = rankContext?.rank;
  const band = getPercentileBand(rank, total);

  const series = useMemo(() => buildYouTubeSeries(statsHistory, chartRange), [statsHistory, chartRange]);
  const momentum = useMemo(() => computeViewsMomentum(statsHistory), [statsHistory]);

  const METRICS = [
    { value: 'views', label: 'Views', dataKey: 'views' },
    { value: 'subscribers', label: 'Subscribers', dataKey: 'subscribers' },
    { value: 'videos', label: 'Videos', dataKey: 'videos' },
  ];
  const currentMetric = METRICS.find((m) => m.value === chartMetric) || METRICS[0];
  const values = series.map((d) => d[currentMetric.dataKey]);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;
  const span = maxV - minV || 1;
  const pad = span * 0.12;
  const relData = series.map((d) => ({ ...d, rel: d[currentMetric.dataKey] - minV }));
  const heroValue = currentMetric.value === 'views' ? formatNumber(creator.totalViews)
    : currentMetric.value === 'subscribers' ? formatNumber(creator.subscribers)
    : formatNumber(creator.totalPosts);
  const netGrowth = values.length >= 2 ? values[values.length - 1] - values[0] : 0;

  const dailyReadingsRows = [...series].reverse();

  // Distinguishes "still fetching stats, real data incoming" from "confirmed,
  // this creator genuinely has under 2 readings" — see statsReady's comment
  // in CreatorProfile. Only the former should show a skeleton; the latter
  // legitimately shows the "just added to tracking" message.
  const stillLoadingStats = !statsReady && statsHistory.length < 2;

  const nearestMilestone = findNextMilestone(creator.totalViews, metrics?.dailyAverage?.views);

  const CPM_MEDIAN = 3.4;
  const monthlyRevenue = (metrics?.last30Days?.views || 0) / 1000 * cpm;

  const tabs = [
    { key: 'daily', label: 'Daily readings', count: dailyReadingsRows.length },
    { key: 'videos', label: 'Recent videos', count: recentVideos.length },
    { key: 'about', label: 'About', count: null },
  ];

  return (
    <div>
      {/* Verdict sentence */}
      {stillLoadingStats ? (
        <TextBoneSkeleton className="h-[15px] w-72 max-w-full" />
      ) : (
        <p className="text-[15px] leading-relaxed text-neutral-800 max-w-2xl text-pretty">
          {buildYouTubeVerdict({ creator, metrics, rankContext, peakStats })}
        </p>
      )}

      {/* Chart card */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
            {METRICS.map((m) => (
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
            <p className="text-xs text-neutral-700">last {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</p>
          </div>
        </div>

        <div className="h-56 sm:h-64 mt-4 cursor-pointer md:cursor-default" onClick={() => setDrilldownOpen(true)}>
          {stillLoadingStats ? (
            <ChartSkeleton />
          ) : relData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={relData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="ytVerdictGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} interval="preserveStartEnd" minTickGap={50} />
                <YAxis
                  domain={[0 - pad, span + pad]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#a3a3a3', fontSize: 11 }}
                  tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0].payload[currentMetric.dataKey];
                    return (
                      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2">
                        <p className="text-xs text-neutral-700">{new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{formatNumber(raw)}</p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2} fill="url(#ytVerdictGradient)" dot={false} activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }} animationDuration={900} />
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
              Next milestone <span className="font-semibold text-neutral-900">{fmtMilestone(nearestMilestone.milestone)} views</span> in ~{nearestMilestone.days} days
              <span className="text-neutral-600"> ({nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, at the current pace)</span>
              <span className="hidden sm:inline text-neutral-600"> Details &rsaquo;</span>
            </button>
          )}
        </div>
      </div>

      {/* 6-cell stat strip — real values, derived from the same metrics/rankContext as everywhere else on the page */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-neutral-200/80 mt-6">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Subscribers</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.subscribers)}</p>
          <p className="text-xs text-emerald-600 mt-1">all-time high</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Total views</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalViews)}</p>
          <p className="text-xs text-neutral-700 mt-1">{creator.createdAt ? `since ${new Date(creator.createdAt).getFullYear()}` : 'lifetime'}</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Videos</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{formatNumber(creator.totalPosts)}</p>
          {metrics && <p className={`text-xs mt-1 ${metrics.last30Days.videos > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>{fmtSigned(metrics.last30Days.videos)} in 30 days</p>}
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Avg / video</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{creator.totalPosts > 0 ? formatNumber(creator.totalViews / creator.totalPosts) : '—'}</p>
          <p className="text-xs text-neutral-700 mt-1">lifetime</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">30-day views</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{metrics ? fmtSigned(metrics.last30Days.views) : '—'}</p>
          {momentum && (
            <p className={`text-xs mt-1 ${momentum.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{momentum.pct >= 0 ? '+' : ''}{momentum.pct.toFixed(2)}% vs. prior 30d</p>
          )}
        </div>
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Platform rank</p>
          <p className="text-xl sm:text-2xl font-bold tabular-nums text-neutral-900 mt-1.5">{rank ? `#${formatNumber(rank)}` : '—'}</p>
          <p className="text-xs text-neutral-700 mt-1">{band != null ? `top ${band}% of tracked` : total ? `of ${formatNumber(total)} tracked` : ''}</p>
        </div>
      </div>

      {/* Revenue + live count row */}
      <div className="flex flex-col lg:flex-row gap-4 mt-6 items-stretch">
        <div className="flex-1 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Estimated revenue</p>
            <span className="flex-1" />
            <p className="text-xs text-neutral-700">your CPM assumption</p>
          </div>
          <div className="flex flex-wrap items-end gap-6 mt-3">
            <div>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-neutral-900 leading-none">{formatEarningsSingle(monthlyRevenue)}</p>
              <p className="text-xs text-neutral-700 mt-1.5">per month &middot; {formatEarningsSingle(monthlyRevenue * 12)} per year</p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-base font-semibold tabular-nums text-neutral-900">${cpm.toFixed(2)}</span>
                <span className="text-xs text-neutral-700">CPM &middot; category median ${CPM_MEDIAN.toFixed(2)}</span>
              </div>
              <input type="range" min="1" max="12" step="0.1" value={cpm} onChange={(e) => setCpm(parseFloat(e.target.value))} className="w-full accent-neutral-900 h-8" />
              <div className="flex justify-between text-[10px] text-neutral-600 mt-0.5"><span>$1</span><span>$12</span></div>
            </div>
          </div>
        </div>
        <div className="lg:w-72 flex-shrink-0 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-5 sm:p-6 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Live subscriber count</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-neutral-900 mt-3">{creator.subscribers?.toLocaleString('en-US')}</p>
          <p className="text-xs text-neutral-700 mt-1">updated every 60s</p>
          <span className="flex-1" />
          <Link to={`/live/youtube/${creator.username}`} className="text-sm font-medium text-neutral-900 hover:underline mt-3 inline-flex items-center gap-1">
            Open full-screen counter <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Section tabs — Daily readings first, Recent videos second, About third */}
      <div className="flex gap-6 mt-8 border-b border-neutral-200/80 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-shrink-0 text-sm font-medium pb-3 -mb-px border-b-2 transition-colors ${
              activeTab === t.key ? 'text-neutral-900 border-neutral-900' : 'text-neutral-700 border-transparent hover:text-neutral-700'
            }`}
          >
            {t.label}{t.count != null && <span className="text-neutral-600 font-normal ml-1.5">{t.count}</span>}
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
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Views</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">&Delta; views</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Subscribers</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Videos</th>
                  <th className="px-5 py-3 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider text-right">Est. revenue</th>
                </tr>
              </thead>
              <tbody>
                {dailyReadingsRows.map((row, i) => {
                  const prev = dailyReadingsRows[i + 1];
                  const delta = prev ? row.views - prev.views : null;
                  return (
                    <tr key={row.date} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 text-neutral-900 tabular-nums">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-5 py-3 text-right font-medium text-neutral-900 tabular-nums">{formatNumber(row.views)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 tabular-nums">{delta != null ? fmtSigned(delta) : '—'}</td>
                      <td className="px-5 py-3 text-right text-neutral-700 tabular-nums">{formatNumber(row.subscribers)}</td>
                      <td className="px-5 py-3 text-right text-neutral-700 tabular-nums">{row.videos}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 tabular-nums">{delta > 0 ? formatEarningsSingle(delta / 1000 * cpm) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile: list, not a table — tables don't survive 390px */}
          <div className="md:hidden divide-y divide-neutral-100">
            {dailyReadingsRows.map((row, i) => {
              const prev = dailyReadingsRows[i + 1];
              const delta = prev ? row.views - prev.views : null;
              return (
                <div key={row.date} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{new Date(row.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-xs text-neutral-700 mt-0.5 tabular-nums">{formatNumber(row.subscribers)} subs &middot; {row.videos} videos</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{delta != null ? fmtSigned(delta) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-600 mt-0.5">&Delta; views</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{delta > 0 ? formatEarningsSingle(delta / 1000 * cpm) : '—'}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-neutral-600 mt-0.5">est. revenue</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="mt-4 space-y-3">
          {recentVideos.length > 0 ? (
            <>
              <a
                href={`https://youtube.com/watch?v=${recentVideos[0].videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden hover:border-neutral-300 transition-colors group"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="relative sm:w-72 flex-shrink-0">
                    <img src={recentVideos[0].thumbnail} alt={recentVideos[0].title} loading="lazy" className="w-full h-44 sm:h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <p className="text-xs font-medium text-neutral-700 mb-1.5">Most recent upload</p>
                      <h3 className="font-semibold text-neutral-900 mb-2 line-clamp-2 group-hover:text-neutral-700 transition-colors">{recentVideos[0].title}</h3>
                      <p className="text-sm text-neutral-700">{formatRelativeTime(recentVideos[0].publishedAt)}</p>
                    </div>
                    <div className="flex items-center gap-5 mt-3 text-sm text-neutral-700">
                      <span className="flex items-center gap-1.5 tabular-nums"><Eye className="w-4 h-4 text-neutral-600" />{formatNumber(recentVideos[0].views)}</span>
                      <span className="flex items-center gap-1.5 tabular-nums"><ThumbsUp className="w-4 h-4 text-neutral-600" />{formatNumber(recentVideos[0].likes)}</span>
                      <span className="flex items-center gap-1.5 tabular-nums"><MessageCircle className="w-4 h-4 text-neutral-600" />{formatNumber(recentVideos[0].comments)}</span>
                    </div>
                  </div>
                </div>
              </a>

              {recentVideos.length > 1 && (
                <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] divide-y divide-neutral-100 overflow-hidden">
                  {recentVideos.slice(1).map((video) => (
                    <a
                      key={video.videoId}
                      href={`https://youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3.5 px-4 py-3 hover:bg-neutral-50 transition-colors group"
                    >
                      <img src={video.thumbnail} alt={video.title} loading="lazy" className="w-24 h-14 flex-shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-neutral-900 line-clamp-1 group-hover:text-neutral-700 transition-colors">{video.title}</h4>
                        <p className="text-xs text-neutral-700 mt-1">{formatRelativeTime(video.publishedAt)}</p>
                        <div className="flex items-center gap-3.5 mt-1.5 text-xs text-neutral-700">
                          <span className="flex items-center gap-1 tabular-nums"><Eye className="w-3.5 h-3.5 text-neutral-600" />{formatNumber(video.views)}</span>
                          <span className="flex items-center gap-1 tabular-nums"><ThumbsUp className="w-3.5 h-3.5 text-neutral-600" />{formatNumber(video.likes)}</span>
                          <span className="flex items-center gap-1 tabular-nums"><MessageCircle className="w-3.5 h-3.5 text-neutral-600" />{formatNumber(video.comments)}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200/80 p-8 text-center text-sm text-neutral-700">No recent video data yet.</div>
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-xl p-6 sm:p-7 mt-4 max-w-3xl">
          {creator.description && <p className="text-sm leading-relaxed text-neutral-700 text-pretty whitespace-pre-line">{creator.description}</p>}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-neutral-200/80">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Joined</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.createdAt ? new Date(creator.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Country</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.country || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Tracked since</p>
              <p className="text-sm text-neutral-900 mt-1">{creator.dbCreatedAt ? new Date(creator.dbCreatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drill-down: scrubbable full-height chart + sticky footer, matches the approved design */}
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
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-700">{new Date(pt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <div className="flex items-end gap-3 mt-2">
                    <p className="text-4xl font-bold tabular-nums text-neutral-900 leading-none">{formatNumber(pt[currentMetric.dataKey])}</p>
                    {delta != null && <p className="text-sm font-semibold text-emerald-600 tabular-nums pb-1">{fmtSigned(delta)} that day</p>}
                  </div>
                  <p className="text-xs text-neutral-700 mt-1.5">drag across the chart to read any day</p>
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
                    <linearGradient id="ytDrilldownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0 - pad, span + pad]} axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 10 }} tickFormatter={(v) => (v <= 0 ? '+0' : '+' + formatNumber(v))} width={48} />
                  <Area type="monotone" dataKey="rel" stroke="#059669" strokeWidth={2.5} fill="url(#ytDrilldownGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-neutral-600 tabular-nums">
              <span>{relData[0] && new Date(relData[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{relData[relData.length - 1] && new Date(relData[relData.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-5">
              {[{ l: '30D', v: 30 }, { l: '60D', v: 60 }, { l: '90D', v: 90 }, { l: 'All', v: 9999 }].map((r) => (
                <button key={r.v} onClick={() => { setChartRange(r.v); setScrubIndex(null); }} className={`h-9 rounded-lg text-xs font-semibold ${chartRange === r.v ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700'}`}>{r.l}</button>
              ))}
            </div>

            <div className="mt-5 border border-neutral-200/80 rounded-xl overflow-hidden divide-y divide-neutral-100">
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Total views</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{formatNumber(creator.totalViews)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Net over {chartRange >= 9999 ? 'all time' : `${chartRange}d`}</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(netGrowth)}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Best day</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.max(...relData.map((d, i) => i > 0 ? d[currentMetric.dataKey] - relData[i - 1][currentMetric.dataKey] : 0)))}</span></div>
              <div className="flex items-center px-4 py-3"><span className="text-sm text-neutral-600">Daily average</span><span className="flex-1" /><span className="text-sm font-semibold tabular-nums">{fmtSigned(Math.round(netGrowth / Math.max(1, relData.length - 1)))}</span></div>
            </div>

            {nearestMilestone && (
              <div className="mt-4 rounded-xl bg-neutral-900 text-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Next milestone</p>
                <p className="text-xl font-bold mt-1.5">{fmtMilestone(nearestMilestone.milestone)} views</p>
                <p className="text-xs text-neutral-600 mt-1">~{nearestMilestone.days} days &middot; {nearestMilestone.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at the current pace</p>
              </div>
            )}
            <div className="h-6" />
          </div>
          <div className="flex-shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200/80">
            <Link to={`/compare?creators=youtube:${creator.username}`} className="flex-1 h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold flex items-center justify-center">Compare channels</Link>
          </div>
        </div>
      )}
    </div>
  );
}
