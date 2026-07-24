import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Trophy, ArrowLeft } from 'lucide-react';
import MusicIcon from '../components/MusicIcon';
import YouTubeIcon from '../components/YouTubeIcon';
import { TableSkeleton } from '../components/Skeleton';
import FunErrorState from '../components/FunErrorState';
import CreatorAvatar from '../components/CreatorAvatar';
import Sparkline from '../components/Sparkline';
import SEO from '../components/SEO';
import StructuredData from '../components/StructuredData';
import NotFound from './NotFound';
import { getHubCreators, getSparklineData } from '../services/creatorService';
import { HUBS, getHub, getHubsByPlatform } from '../lib/hubs';
import { HUB_INTROS } from '../lib/hubIntros';
import { formatNumber } from '../lib/utils';
import logger from '../lib/logger';

const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

const MotionLink = motion(Link);

// Per-platform presentation. Kept here rather than in lib/hubs.js so that file
// stays importable from the edge middleware without pulling in icon modules.
const PLATFORM_META = {
  music: {
    name: 'Music',
    icon: MusicIcon,
    tint: 'text-amber-500',
    bar: 'bg-amber-500',
    metric: 'Monthly Listeners',
    metricShort: 'listeners',
    colLabel: 'Artist',
    eyebrow: 'Music genre',
    rankingsPath: '/rankings/music',
    rankingsLabel: 'All music artists',
    siblingLabel: 'Other music genres',
  },
  youtube: {
    name: 'YouTube',
    icon: YouTubeIcon,
    tint: '',
    bar: 'bg-red-500',
    metric: 'Subscribers',
    metricShort: 'subscribers',
    colLabel: 'Channel',
    eyebrow: 'YouTube category',
    rankingsPath: '/rankings/youtube',
    rankingsLabel: 'All YouTubers',
    siblingLabel: 'Other YouTube categories',
  },
};

const LIMIT = 100;

function RankBadge({ rank }) {
  const medal = rank === 1 ? 'bg-amber-400' : rank === 2 ? 'bg-neutral-300' : rank === 3 ? 'bg-orange-300' : null;
  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0 w-10">
      {medal && <span className={`w-1.5 h-1.5 rounded-full ${medal}`} />}
      <span className={`text-sm font-semibold tabular-nums ${rank <= 3 ? 'text-neutral-900' : 'text-neutral-400'}`}>{rank}</span>
    </span>
  );
}

export function hubSeo(hub, count) {
  const meta = PLATFORM_META[hub.platform] || PLATFORM_META.music;
  const t = hub.title.toLowerCase();
  const title = `Best ${hub.title} ${titleCase(hub.noun)} (2026) - Top ${count || ''} Ranked`.replace(/\s+/g, ' ');
  return {
    title,
    description: `The best ${hub.title} ${hub.noun} ranked by ${meta.metricShort}. ${count ? `${count} ${hub.noun} ` : ''}tracked and updated daily. See who the biggest ${hub.title} ${hub.noun} are in 2026.`,
    keywords: `best ${t} ${hub.noun}, top ${t} ${hub.noun}, biggest ${t} ${hub.noun} 2026, most popular ${t} ${hub.noun}, ${t} rankings`,
  };
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function HubPage() {
  const { slug } = useParams();
  const hub = getHub(slug);
  if (!hub) return <NotFound />;
  return <Hub hub={hub} key={hub.slug} />;
}

function Hub({ hub }) {
  const [creators, setCreators] = useState([]);
  const [sparklines, setSparklines] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const meta = PLATFORM_META[hub.platform] || PLATFORM_META.music;
  const Icon = meta.icon;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHubCreators(hub, LIMIT);
      setCreators(data);
      setLoading(false);

      // Trends are decorative — never block the table on them.
      if (data.length) {
        getSparklineData(data.map((c) => c.id), 30)
          .then(setSparklines)
          .catch(() => {});
      }
    } catch (e) {
      logger.error('HubPage load failed', e);
      setError(e.message || 'Failed to load');
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // GA page_view is fired globally by RouteChangeTracker in App.jsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.slug]);

  const seo = useMemo(() => hubSeo(hub, creators.length), [hub, creators.length]);

  const schema = useMemo(() => {
    if (!creators.length) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Best ${hub.title} ${titleCase(hub.noun)}`,
      description: `The best ${hub.title} ${hub.noun} ranked by ${meta.metricShort}, updated daily.`,
      numberOfItems: creators.length,
      itemListElement: creators.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.display_name,
        url: `https://shinypull.com/${hub.platform}/${c.username}`,
      })),
    };
  }, [creators, hub]);

  const siblings = getHubsByPlatform(hub.platform).filter((h) => h.slug !== hub.slug);

  return (
    <>
      <SEO title={seo.title} description={seo.description} keywords={seo.keywords} />
      {schema && <StructuredData schema={schema} />}

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <Link
              to="/best"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-900 transition-colors mb-4"
            >
              <ArrowLeft className="w-3 h-3" />
              All categories
            </Link>
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className={`${MICRO} mb-3 flex items-center gap-1.5`}>
                  {Icon && <Icon className={`w-3 h-3 ${meta.tint}`} />}
                  {meta.eyebrow}
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
                  Best {hub.title} {titleCase(hub.noun)}
                </h1>
                <p className="mt-2 text-sm text-neutral-500">
                  Ranked by {meta.metric.toLowerCase()}. Updated daily.
                </p>
                {HUB_INTROS[hub.slug] && (
                  <p className="mt-4 text-sm sm:text-base text-neutral-600 leading-relaxed max-w-2xl">
                    {HUB_INTROS[hub.slug]}
                  </p>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-2 pb-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-600 tracking-wide">UPDATED DAILY</span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {/* Only the parent-rankings link sits above the table. The full
              category list is a navigation aid, not a control, and 28 chips
              above the fold buried rank 1 on mobile — it lives below instead. */}
          <div className="flex flex-wrap gap-1.5 mb-6">
            <Link
              to={meta.rankingsPath}
              className="flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium border bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
            >
              {Icon && <Icon className={`w-4 h-4 ${meta.tint}`} />}
              {meta.rankingsLabel}
            </Link>
          </div>

          {/* Table */}
          <div className={`${CARD} overflow-hidden`}>
            <div className={`hidden md:grid grid-cols-12 gap-4 px-6 py-3 sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-neutral-200/80 ${MICRO}`}>
              <div className="col-span-1">Rank</div>
              <div className="col-span-6">{meta.colLabel}</div>
              <div className="col-span-3 text-right">{meta.metric}</div>
              <div className="col-span-2 text-right">30-Day Trend</div>
            </div>

            {loading && (
              <div className="px-6 py-4">
                <TableSkeleton rows={10} />
              </div>
            )}

            {!loading && error && (
              <FunErrorState type="server" message={error} onRetry={load} retryText="Retry" />
            )}

            {!loading && !error && creators.length === 0 && (
              <div className="px-6 py-16 text-center">
                <Trophy className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-900 font-medium mb-1">No artists tracked here yet</p>
                <p className="text-sm text-neutral-500">This category will fill in as data comes in</p>
              </div>
            )}

            {!loading && !error && creators.map((c) => {
              const series = sparklines[c.id] || [];
              const trend = series.length >= 2
                ? (series[series.length - 1] > series[0] ? 'up' : series[series.length - 1] < series[0] ? 'down' : 'flat')
                : 'flat';
              return (
                <MotionLink
                  key={c.id}
                  to={`/${c.platform}/${c.username}`}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="relative grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-neutral-100 hover:bg-neutral-50 transition-colors group"
                >
                  <span className={`pointer-events-none absolute left-0 top-0 bottom-0 w-0.5 ${meta.bar} opacity-0 group-hover:opacity-100 transition-opacity`} />

                  <div className="col-span-2 md:col-span-1">
                    <RankBadge rank={c.rank} />
                  </div>

                  <div className="col-span-10 md:col-span-6 flex items-center gap-3 min-w-0">
                    <CreatorAvatar src={c.profile_image} name={c.display_name} size="lg" rounded="rounded-lg" className="!w-10 !h-10" />
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 truncate">{c.display_name}</p>
                      {/* On mobile the metric column is hidden, so surface the
                          number under the name instead of losing it. */}
                      <p className="md:hidden text-xs text-neutral-500 tabular-nums mt-0.5">
                        {formatNumber(c.subscribers)} {meta.metricShort}
                      </p>
                    </div>
                  </div>

                  <div className="hidden md:block col-span-3 text-right">
                    <span className="text-sm font-medium text-neutral-900 tabular-nums">
                      {formatNumber(c.subscribers)}
                    </span>
                  </div>

                  <div className="hidden md:flex col-span-2 items-center justify-end">
                    {series.length >= 2 ? (
                      <Sparkline data={series} trend={trend} width={80} height={24} />
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </div>
                </MotionLink>
              );
            })}
          </div>

          {/* Cross-link out to the platform rankings */}
          {!loading && !error && creators.length > 0 && (
            <div className="mt-6 flex justify-center">
              <Link
                to={meta.rankingsPath}
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors group"
              >
                See the full {meta.name.toLowerCase()} rankings
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}

          {/* Sibling categories — the internal linking spine that lets a crawler
              (or a reader) reach every other hub from any one of them. */}
          <div className="mt-12 pt-8 border-t border-neutral-200/80">
            <p className={`${MICRO} mb-3`}>{meta.siblingLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {siblings.map((h) => (
                <Link
                  key={h.slug}
                  to={`/best/${h.slug}`}
                  className="flex items-center h-9 px-3.5 rounded-lg text-sm font-medium border bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
                >
                  {h.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * /best — index of every hub. Exists so the hub set is reachable in one hop
 * from the nav and the sitemap, rather than only via sibling chips.
 */
export function HubIndex() {
  const platforms = [...new Set(HUBS.map((h) => h.platform))];

  return (
    <>
      <SEO
        title="Best Creators by Category (2026) - Ranked Lists"
        description="Browse the best creators by category. Ranked lists of the top YouTubers and artists in every category, updated daily with live stats."
        keywords="best creators by category, best youtubers by category, best gaming youtubers, best artists by genre, creator category rankings"
      />
      <div className="min-h-screen bg-[#fafaf9]">
        <div className="bg-white border-b border-neutral-200/80">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <p className={`${MICRO} mb-3`}>Categories</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
              Best creators by category
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Ranked lists by category. Updated daily.
            </p>
          </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {platforms.map((platform) => {
            const meta = PLATFORM_META[platform] || PLATFORM_META.music;
            const Icon = meta.icon;
            const hubs = getHubsByPlatform(platform);
            return (
              <div key={platform} className="mb-10">
                <p className={`${MICRO} mb-3 flex items-center gap-1.5`}>
                  {Icon && <Icon className={`w-3 h-3 ${meta.tint}`} />}
                  {meta.name} · {hubs.length} categories
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {hubs.map((h) => (
                    <Link
                      key={h.slug}
                      to={`/best/${h.slug}`}
                      className={`${CARD} px-4 py-3 flex items-center justify-between gap-2 hover:border-neutral-300 transition-colors group`}
                    >
                      <span className="text-sm font-medium text-neutral-900 truncate">{h.title}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
