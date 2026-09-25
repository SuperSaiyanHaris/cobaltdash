import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChartNoAxesColumnIncreasing, DollarSign, LineChart, Radio, Scale } from 'lucide-react';
import YouTubeIcon from './YouTubeIcon';
import TwitchIcon from './TwitchIcon';
import KickIcon from './KickIcon';
import CreatorAvatar from './CreatorAvatar';
import { getRankedCreators } from '../services/creatorService';
import { formatNumber, formatRelativeTimeShort } from '../lib/utils';
import { youtubeAdEarnings } from '../lib/earnings';
import { PLATFORM_ACCENTS, PLATFORM_COUNT } from '../lib/constants';

// "What's inside" section under the home hero: one bento grid that shows
// every core feature at once, each tile a live slice of the real thing and a
// link into it. Replaced the tabbed fake-browser carousel (2026-09-25),
// which showed one feature at a time inside a mock of our own site.

const RANK_TABS = [
  { id: 'youtube', name: 'YouTube', Icon: YouTubeIcon, growthUnit: 'views' },
  { id: 'twitch', name: 'Twitch', Icon: TwitchIcon, growthUnit: 'followers' },
  { id: 'kick', name: 'Kick', Icon: KickIcon, growthUnit: 'paid subs' },
];

const TILE = 'group relative min-w-0 flex flex-col bg-white border border-neutral-200/80 rounded-2xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-neutral-300 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow]';

function fmtUSD(n) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  return `$${Math.round(n)}`;
}

function TileHead({ Icon, tint, title, blurb }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-neutral-900 leading-tight">{title}</h3>
        <p className="text-[13px] text-neutral-500 mt-0.5 leading-snug">{blurb}</p>
      </div>
    </div>
  );
}

function TileLink({ to, children }) {
  return (
    <Link to={to} className="mt-auto pt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-900 hover:gap-1.5 transition-[gap]">
      {children}
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}

function RankingsTile({ youtubeTop }) {
  const [tab, setTab] = useState('youtube');
  const [lists, setLists] = useState({});

  useEffect(() => {
    if (tab === 'youtube' || lists[tab]) return;
    let cancelled = false;
    getRankedCreators(tab, 'subscribers', 7)
      .then((rows) => { if (!cancelled) setLists((l) => ({ ...l, [tab]: rows || [] })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab, lists]);

  const rows = (tab === 'youtube' ? youtubeTop : lists[tab]) || [];
  const active = RANK_TABS.find((t) => t.id === tab);
  const top = rows[0]?.subscribers || 1;
  const accent = PLATFORM_ACCENTS[tab];
  const updatedAt = rows[0]?.computedAt;

  return (
    <div className={`${TILE} lg:col-span-2 lg:row-span-2`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TileHead Icon={ChartNoAxesColumnIncreasing} tint="bg-amber-50 text-amber-600" title="Live rankings" blurb="Every platform's top creators, re-ranked every day." />
        <div role="tablist" aria-label="Rankings platform" className="flex gap-1 p-1 bg-neutral-100 rounded-xl">
          {RANK_TABS.map(({ id, name, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {name}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-4 space-y-0.5">
        {(rows.length ? rows.slice(0, 7) : Array(7).fill(null)).map((c, i) => (
          <li key={c?.id || i}>
            {c ? (
              <Link to={`/${c.platform}/${c.username}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-neutral-50 transition-colors">
                <span className={`w-5 text-center text-sm font-extrabold tabular-nums ${i === 0 ? 'text-amber-500' : 'text-neutral-400'}`}>{i + 1}</span>
                <CreatorAvatar src={c.profile_image} name={c.display_name} size="md" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 truncate">{c.display_name}</span>
                  {/* This creator's count relative to #1, on one shared scale. */}
                  <span className="mt-1.5 block h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                    <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(3, (c.subscribers / top) * 100)}%`, backgroundColor: accent, opacity: 0.85 }} />
                  </span>
                </span>
                <span className="w-24 sm:w-36 text-right flex-shrink-0">
                  <span className="block text-sm font-extrabold text-neutral-900 tabular-nums">{formatNumber(c.subscribers)}</span>
                  <span className="block text-[11px] font-medium text-emerald-600 tabular-nums truncate">
                    {c.growth30d > 0 ? <>+{formatNumber(c.growth30d)}<span className="hidden sm:inline"> {active.growthUnit}</span> / 30d</> : '\u00a0'}
                  </span>
                </span>
              </Link>
            ) : (
              <div className="h-[56px] rounded-xl bg-neutral-100 animate-pulse" />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
        <Link to={`/rankings/${tab}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-900 hover:gap-1.5 transition-[gap]">
          See all {active.name} rankings
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        {updatedAt && <span className="text-[11px] text-neutral-400">Updated {formatRelativeTimeShort(updatedAt)}</span>}
      </div>
    </div>
  );
}

function Sparkline({ values, color }) {
  if (!values || values.length < 2) return <div className="h-24 rounded-lg bg-neutral-100 animate-pulse" />;
  const W = 300, H = 96, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((v - min) / span) * (H - pad * 2)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="bento-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W - pad} ${H} L${pad} ${H} Z`} fill="url(#bento-spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="4" fill={color} />
    </svg>
  );
}

export default function HomeProductBento({ youtubeTop, topHistory, twitchTop, liveStats }) {
  const mr = youtubeTop?.[0];
  const second = youtubeTop?.[1];

  const views = useMemo(() => (topHistory || []).filter((r) => r.total_views > 0).map((r) => r.total_views), [topHistory]);
  const viewsGain = views.length > 1 ? views[views.length - 1] - views[0] : null;
  const monthlyViews = useMemo(() => {
    const rows = (topHistory || []).filter((r) => r.total_views > 0);
    if (rows.length < 2) return null;
    const days = Math.max(1, Math.round((new Date(rows.at(-1).recorded_at) - new Date(rows[0].recorded_at)) / 86400000));
    const delta = rows.at(-1).total_views - rows[0].total_views;
    return delta > 0 ? (delta / days) * 30 : null;
  }, [topHistory]);
  const earnings = monthlyViews ? youtubeAdEarnings(monthlyViews) : null;

  const name = mr?.display_name || 'MrBeast';
  const profile = `/youtube/${mr?.username || 'mrbeast'}`;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-28 mb-16 sm:mb-24">
      <div className="scroll-reveal text-center mb-10 sm:mb-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-3">What&apos;s inside</p>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900">Real rankings. Live data.</h2>
        {liveStats?.creators > 0 && (
          <p className="mt-4 text-sm sm:text-base text-neutral-500 tabular-nums">
            {formatNumber(liveStats.creators)} creators tracked
            <span className="mx-2 text-neutral-300">·</span>
            {formatNumber(liveStats.dataPoints)} data points
            <span className="mx-2 text-neutral-300">·</span>
            {PLATFORM_COUNT} platforms
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankingsTile youtubeTop={youtubeTop} />

        <Link to={profile} className={TILE}>
          <TileHead Icon={LineChart} tint="bg-indigo-50 text-indigo-600" title="Growth charts" blurb="Every creator's history, day by day." />
          <p className="mt-4 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">{name}</span>, views over 30 days
          </p>
          <p className="text-2xl font-extrabold text-neutral-900 tabular-nums tracking-tight">
            {viewsGain > 0 ? `+${formatNumber(viewsGain)}` : '—'}
          </p>
          <div className="mt-2"><Sparkline values={views} color="#6366f1" /></div>
          <span className="mt-auto pt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-900 group-hover:gap-1.5 transition-[gap]">
            Open {name}&apos;s profile <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <div className={TILE}>
          <TileHead Icon={DollarSign} tint="bg-emerald-50 text-emerald-600" title="Earnings estimates" blurb="What creators really make, from their own numbers." />
          <p className="mt-4 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">{name}</span> earns an estimated
          </p>
          <p className="text-3xl font-extrabold text-neutral-900 tabular-nums tracking-tight">
            {earnings ? `${fmtUSD(earnings.low)}–${fmtUSD(earnings.high)}` : '—'}
          </p>
          <p className="text-sm text-neutral-500">a month from YouTube ads</p>
          <TileLink to="/youtube/money-calculator">Try the money calculator</TileLink>
        </div>

        <div className={TILE}>
          <TileHead Icon={Scale} tint="bg-sky-50 text-sky-600" title="Head to head" blurb="Put any creators side by side." />
          {mr && second ? (
            <div className="mt-5 space-y-3">
              {[mr, second].map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="font-semibold text-neutral-900 truncate">{c.display_name}</span>
                      <span className="font-bold text-neutral-900 tabular-nums">{formatNumber(c.subscribers)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${(c.subscribers / mr.subscribers) * 100}%`, opacity: c === mr ? 1 : 0.55 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 h-[72px] rounded-lg bg-neutral-100 animate-pulse" />
          )}
          <TileLink to={mr && second ? `/compare?creators=youtube:${mr.username},youtube:${second.username}` : '/compare'}>Compare creators</TileLink>
        </div>

        <div className={`${TILE} lg:col-span-2`}>
          <TileHead Icon={Radio} tint="bg-rose-50 text-rose-600" title="Live counts" blurb="Follower counts that update in real time, not once a day." />
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {twitchTop && <CreatorAvatar src={twitchTop.profile_image} name={twitchTop.display_name} size="md" />}
              <div className="min-w-0">
                <p className="text-sm text-neutral-600 truncate">
                  <span className="font-semibold text-neutral-900">{twitchTop?.display_name || 'Twitch'}</span> · Twitch followers
                </p>
                <p className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tabular-nums tracking-tight">
                  {twitchTop?.subscribers ? twitchTop.subscribers.toLocaleString('en-US') : '—'}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-60" />
                <span className="relative w-2 h-2 rounded-full bg-rose-500" />
              </span>
              Live
            </span>
          </div>
          <TileLink to={twitchTop ? `/live/twitch/${twitchTop.username}` : '/rankings/twitch'}>Watch the live count</TileLink>
        </div>
      </div>
    </section>
  );
}
