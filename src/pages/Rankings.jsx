import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Youtube, Twitch, TrendingUp, Users, Eye, Trophy, Info, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Megaphone, ArrowRight } from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import { Music } from 'lucide-react';
import { TableSkeleton } from '../components/Skeleton';
import FunErrorState from '../components/FunErrorState';
import CreatorAvatar from '../components/CreatorAvatar';
import Sparkline from '../components/Sparkline';
import { getRankedCreators, getFeaturedListings, getSparklineData } from '../services/creatorService';
import SEO from '../components/SEO';
import StructuredData from '../components/StructuredData';
import { analytics } from '../lib/analytics';
import { formatNumber } from '../lib/utils';
import logger from '../lib/logger';

const platforms = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'bg-red-600',    hoverColor: 'hover:bg-red-500',    lightBg: 'bg-red-50',     textColor: 'text-red-700',    available: true },
  { id: 'tiktok',  name: 'TikTok',  icon: TikTokIcon, color: 'bg-pink-600',  hoverColor: 'hover:bg-pink-500',   lightBg: 'bg-pink-50',    textColor: 'text-pink-700',   available: true },
  { id: 'twitch',  name: 'Twitch',  icon: Twitch,   color: 'bg-purple-600', hoverColor: 'hover:bg-purple-500', lightBg: 'bg-purple-50',  textColor: 'text-purple-700', available: true },
  { id: 'kick',    name: 'Kick',    icon: KickIcon, color: 'bg-green-600',  hoverColor: 'hover:bg-green-500',  lightBg: 'bg-green-50',   textColor: 'text-green-700',  available: true },
  { id: 'bluesky', name: 'Bluesky', icon: BlueskyIcon, color: 'bg-sky-500',  hoverColor: 'hover:bg-sky-400',    lightBg: 'bg-sky-50',     textColor: 'text-sky-700',    available: true },
  { id: 'music',   name: 'Music',   icon: Music,        color: 'bg-amber-600',  hoverColor: 'hover:bg-amber-500',  lightBg: 'bg-amber-50',   textColor: 'text-amber-700',  available: true },
  { id: 'mastodon',name: 'Mastodon',icon: MastodonIcon, color: 'bg-violet-600', hoverColor: 'hover:bg-violet-500', lightBg: 'bg-violet-50',  textColor: 'text-violet-700', available: true },
  { id: 'rumble',  name: 'Rumble',  icon: RumbleIcon,   color: 'bg-lime-600',   hoverColor: 'hover:bg-lime-500',   lightBg: 'bg-lime-50',    textColor: 'text-lime-700',   available: true },
  { id: 'substack',name: 'Substack',icon: SubstackIcon, color: 'bg-orange-600', hoverColor: 'hover:bg-orange-500', lightBg: 'bg-orange-50',  textColor: 'text-orange-700', available: true },
];

const topCounts = [50, 100, 500];

// SEO helpers per platform
function getSeoData(platform, rankType, topCount) {
  const p = platform?.name || 'Creator';
  const pid = platform?.id || 'youtube';
  const countLabel = `Top ${topCount}`;

  const metricLabel = rankType === 'views' ? 'Most Viewed' :
    rankType === 'growth' ? 'Fastest Growing' :
    pid === 'tiktok' || pid === 'twitch' || pid === 'bluesky' || pid === 'mastodon' || pid === 'rumble' ? 'Most Followed' :
    pid === 'music' ? 'Most Listeners' :
    pid === 'kick' ? 'Most Subscribed' : 'Most Subscribed';

  // Avoid duplicating the platform name in the title (e.g. "Top 50 Mastodon Mastodon Creators")
  // by special-casing each platform's noun, with a generic fallback.
  const platformNoun = {
    youtube: 'YouTubers',
    tiktok: 'TikTokers',
    twitch: 'Twitch Streamers',
    kick: 'Kick Streamers',
    bluesky: 'Bluesky Accounts',
    music: 'Music Artists',
    mastodon: 'Mastodon Accounts',
    rumble: 'Rumble Channels',
    substack: 'Substack Newsletters',
  }[pid] || `${p} Creators`;
  const title = `${countLabel} ${rankType === 'growth' ? 'Fastest Growing ' : rankType === 'views' ? 'Most Viewed ' : ''}${platformNoun} (2026) - Live Rankings`;

  const descriptions = {
    youtube: `The ${countLabel.toLowerCase()} most subscribed YouTubers ranked by subscribers, views, and growth. Updated daily with live stats. See who has the most YouTube subscribers in 2026.`,
    tiktok: `${countLabel} most followed TikTok creators ranked by followers, likes, and growth. Updated daily. See who has the most TikTok followers in 2026.`,
    twitch: `${countLabel} most followed Twitch streamers ranked by followers, watch hours, and growth. Updated daily. Find the most watched Twitch streamers in 2026.`,
    kick: `${countLabel} Kick streamers ranked by paid subscribers and growth. Updated daily. See the top Kick streamers in 2026.`,
    bluesky: `${countLabel} most followed Bluesky accounts ranked by followers and growth. Updated daily. See who has the most Bluesky followers in 2026.`,
    music: `${countLabel} most listened music artists ranked by monthly listeners and total plays. Updated daily. See who has the most listeners in 2026.`,
    mastodon: `${countLabel} most followed Mastodon accounts ranked by followers and posts. Updated daily across the fediverse. See who has the most Mastodon followers in 2026.`,
    rumble: `${countLabel} most followed Rumble channels ranked by followers and video count. Updated daily. See the biggest creators on Rumble in 2026.`,
    substack: `${countLabel} top Substack newsletters ranked by subscriber reach across every category. Updated daily. See the biggest Substack writers in 2026.`,
  };

  const keywords = {
    youtube: `top youtubers, top ${topCount} youtubers, most subscribed youtubers, biggest youtube channels, who has the most youtube subscribers, most popular youtubers 2026, youtube rankings`,
    tiktok: `top tiktokers, top ${topCount} tiktokers, most followed tiktok, who has the most tiktok followers, most tiktok likes, biggest tiktok accounts 2026, tiktok rankings`,
    twitch: `top twitch streamers, top ${topCount} twitch streamers, most followed twitch, most watched twitch streamers, most hours watched twitch, biggest twitch channels 2026, twitch rankings`,
    kick: `top kick streamers, top ${topCount} kick streamers, most subscribed kick, biggest kick channels 2026, kick rankings`,
    bluesky: `top bluesky accounts, top ${topCount} bluesky creators, most followed bluesky, biggest bluesky accounts 2026, bluesky rankings, bluesky statistics`,
    music: `top music artists, top ${topCount} artists, most listened artists, monthly listeners ranking, biggest music artists 2026, music artist rankings`,
    mastodon: `top mastodon accounts, top ${topCount} mastodon, most followed mastodon, fediverse rankings, biggest mastodon accounts 2026, mastodon statistics`,
    rumble: `top rumble channels, top ${topCount} rumble, most followed rumble, biggest rumble channels 2026, rumble rankings, rumble statistics`,
    substack: `top substack newsletters, top ${topCount} substack, best substack writers, most popular substack 2026, substack leaderboard, substack rankings`,
  };

  return {
    title,
    description: descriptions[pid] || descriptions.youtube,
    keywords: keywords[pid] || keywords.youtube,
  };
}

function getH1Text(platform, topCount) {
  const pid = platform?.id || 'youtube';
  const labels = {
    youtube: `Top ${topCount} YouTubers`,
    tiktok: `Top ${topCount} TikTok Creators`,
    twitch: `Top ${topCount} Twitch Streamers`,
    kick: `Top ${topCount} Kick Streamers`,
    bluesky: `Top ${topCount} Bluesky Accounts`,
    music: `Top ${topCount} Music Artists`,
    mastodon: `Top ${topCount} Mastodon Accounts`,
    rumble: `Top ${topCount} Rumble Channels`,
    substack: `Top ${topCount} Substack Newsletters`,
  };
  return labels[pid] || `Top ${topCount} ${platform?.name} Creators`;
}

function getSubheading(platform) {
  const pid = platform?.id || 'youtube';
  const subs = {
    youtube: 'Ranked by subscribers, views, and growth. Updated daily.',
    tiktok: 'Ranked by followers, likes, and growth. Updated daily.',
    twitch: 'Ranked by followers, watch hours, and growth. Updated daily.',
    kick: 'Ranked by paid subscribers and growth. Updated daily.',
    bluesky: 'Ranked by followers and growth. Updated daily.',
    music: 'Ranked by monthly listeners and total plays. Updated daily.',
    mastodon: 'Ranked by followers and posts across the fediverse. Updated daily.',
    rumble: 'Ranked by followers and video output. Updated daily.',
    substack: 'Ranked by subscriber reach across every Substack category. Updated daily.',
  };
  return subs[pid] || 'Ranked by stats and growth. Updated daily.';
}

// Build ItemList structured data for SEO
function createRankingListSchema(rankings, platform, topCount) {
  if (!rankings.length) return null;
  const siteUrl = 'https://shinypull.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: getH1Text(platform, topCount),
    description: `Live rankings of the top ${topCount} ${platform?.name || ''} creators, updated daily.`,
    numberOfItems: rankings.length,
    itemListElement: rankings.map((creator, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: creator.display_name,
      url: `${siteUrl}/${creator.platform}/${creator.username}`,
    })),
  };
}

export default function Rankings() {
  const { platform: urlPlatform } = useParams();
  const navigate = useNavigate();

  // If no platform in URL, show overview page
  if (!urlPlatform) {
    return <RankingsOverview />;
  }

  return <PlatformRankings urlPlatform={urlPlatform} />;
}

function RankingsOverview() {
  const navigate = useNavigate();
  const [platformData, setPlatformData] = useState({});
  const [sponsoredByPlatform, setSponsoredByPlatform] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        // Rankings are the critical content — show them first
        const rankResults = await Promise.all(
          platforms.map(async (p) => {
            try {
              const data = await getRankedCreators(p.id, 'subscribers', 10);
              return { platform: p.id, data };
            } catch {
              return { platform: p.id, data: [] };
            }
          })
        );
        const map = {};
        rankResults.forEach(r => { map[r.platform] = r.data; });
        setPlatformData(map);
      } finally {
        setLoading(false);
      }

      // Featured listings load in the background — non-blocking.
      // They're cached after first load so this is near-instant on repeat visits.
      Promise.all(
        platforms.map(async (p) => {
          try {
            const listings = await getFeaturedListings(p.id);
            return { platform: p.id, listings };
          } catch {
            return { platform: p.id, listings: [] };
          }
        })
      ).then(results => {
        const sMap = {};
        results.forEach(r => { sMap[r.platform] = r.listings; });
        setSponsoredByPlatform(sMap);
      });
    };
    loadAll();
  }, []);

  return (
    <>
      <SEO
        title="Creator Rankings - Top YouTubers, TikTokers, Twitch, Kick, Bluesky & Music Artists (2026)"
        description="Live rankings of the top creators across YouTube, TikTok, Twitch, Kick, Bluesky, and Music. Updated daily with subscriber counts, follower stats, and growth metrics."
        keywords="top youtubers, top tiktokers, top twitch streamers, top kick streamers, top bluesky accounts, top music artists, creator rankings, most subscribers, most followers, live rankings 2026"
      />
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-neutral-200">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-neutral-900">Creator Rankings</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-sm sm:text-base text-neutral-500">Top creators across all platforms. Updated daily.</p>
          </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
                  <TableSkeleton rows={5} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {platforms.map((platform) => {
                const Icon = platform.icon;
                const creators = platformData[platform.id] || [];
                const follLabel = platform.id === 'tiktok' || platform.id === 'twitch' || platform.id === 'bluesky' || platform.id === 'mastodon' || platform.id === 'rumble' ? 'followers' : platform.id === 'music' ? 'listeners' : platform.id === 'kick' ? 'paid subs' : 'subscribers';

                return (
                  <div key={platform.id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                    {/* Platform Header */}
                    <div className={`flex items-center px-5 py-4 ${platform.lightBg} border-b border-neutral-200`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 ${platform.color} rounded-lg flex items-center justify-center`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="font-bold text-neutral-900">Top {platform.name} Creators</h2>
                      </div>
                    </div>

                    {/* Mini Rankings List */}
                    <div className="divide-y divide-gray-800/70">
                      {creators.length === 0 ? (
                        <div className="px-5 py-8 text-center text-neutral-700 text-sm">No data available</div>
                      ) : (() => {
                        const listings = sponsoredByPlatform[platform.id] || [];
                        const premiumListings = listings.filter(l => l.placement_tier === 'premium');
                        const items = [];

                        const pushPremiumSlot = (slotKey, advertiser) => {
                          if (advertiser) {
                            // Sold slot — render the buyer's creator
                            const c = advertiser.creators;
                            items.push(
                              <Link
                                key={slotKey}
                                to={`/${c?.platform}/${c?.username}`}
                                className="flex items-center gap-3 px-5 py-3 bg-amber-50 hover:bg-amber-100 border-y border-amber-200/60 transition-colors group"
                              >
                                <span className="inline-flex items-center justify-center gap-0.5 px-1.5 h-6 rounded-md text-[10px] font-bold flex-shrink-0 bg-amber-200 border border-amber-300 text-amber-900" title="Premium featured listing">
                                  <span className="text-[9px]">★</span>Ad
                                </span>
                                <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="sm" rounded="rounded-lg" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-neutral-900 truncate group-hover:text-amber-700 transition-colors">{c?.display_name}</p>
                                </div>
                              </Link>
                            );
                          } else {
                            // Unsold slot — ghost "Your Creator Here" row that
                            // promotes the product on every rankings page. Auto-
                            // replaced the moment the slot sells (queue logic).
                            items.push(
                              <Link
                                key={slotKey}
                                to="/promote"
                                className="flex items-center gap-3 px-5 py-3 bg-amber-50/60 hover:bg-amber-50 border-y border-dashed border-amber-300 transition-colors group relative overflow-hidden"
                              >
                                <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/40 to-transparent animate-marquee" />
                                <span className="inline-flex items-center justify-center gap-0.5 px-1.5 h-6 rounded-md text-[10px] font-bold flex-shrink-0 bg-amber-200 border border-amber-300 text-amber-900" title="Premium featured listing available">
                                  <span className="text-[9px]">★</span>Ad
                                </span>
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0 shadow shadow-amber-500/20">
                                  ★
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-neutral-900 truncate group-hover:text-amber-700 transition-colors">Your Creator Here</p>
                                  <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Premium slot available</p>
                                </div>
                                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-amber-700 group-hover:gap-2 transition-all whitespace-nowrap">
                                  Claim <ArrowRight className="w-3 h-3" />
                                </span>
                              </Link>
                            );
                          }
                        };

                        creators.forEach((creator, index) => {
                          // Premium slot 1: between rank 4 and 5
                          if (index === 4) pushPremiumSlot('premium-ghost-1', premiumListings[0]);
                          // Premium slot 2: between rank 9 and 10
                          if (index === 9) pushPremiumSlot('premium-ghost-2', premiumListings[1]);
                          items.push(
                            <Link
                              key={creator.id}
                              to={`/${creator.platform}/${creator.username}`}
                              className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors group"
                            >
                              <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                index === 0 ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40' :
                                index === 1 ? 'bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/30' :
                                index === 2 ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40' :
                                'bg-neutral-50 text-neutral-400'
                              }`}>
                                {index + 1}
                              </span>
                              <CreatorAvatar src={creator.profile_image} name={creator.display_name} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-neutral-900 truncate group-hover:text-indigo-400 transition-colors">
                                  {creator.display_name}
                                </p>
                              </div>
                              <span className="text-sm font-medium text-neutral-700 flex-shrink-0">
                                {formatNumber(creator.subscribers)} {follLabel}
                              </span>
                            </Link>
                          );
                        });
                        return items;
                      })()}
                    </div>

                    {/* View Full Rankings Button */}
                    <div className="px-5 py-3 border-t border-neutral-200">
                      <Link
                        to={`/rankings/${platform.id}`}
                        className={`block w-full text-center py-2.5 rounded-xl text-sm font-medium ${platform.color} text-white ${platform.hoverColor} transition-colors`}
                      >
                        View Top 50 {platform.name} Creators
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PlatformRankings({ urlPlatform }) {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState(urlPlatform || 'youtube');
  const [selectedRankType, setSelectedRankType] = useState('subscribers');
  const [topCount, setTopCount] = useState(50);
  const [topCountOpen, setTopCountOpen] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('desc');
  const [sponsoredListings, setSponsoredListings] = useState([]);
  // creator_id → number[] (30-day subscriber series). Loaded lazily after rankings render.
  const [sparklines, setSparklines] = useState({});

  const rankTypes = [
    { id: 'subscribers', name: selectedPlatform === 'tiktok' || selectedPlatform === 'twitch' || selectedPlatform === 'bluesky' || selectedPlatform === 'mastodon' || selectedPlatform === 'rumble' ? 'Top Followers' : selectedPlatform === 'music' ? 'Top Listeners' : selectedPlatform === 'kick' ? 'Top Paid Subs' : 'Top Subscribers', icon: Users },
    // Hide views for platforms whose APIs don't expose view data
    ...(selectedPlatform !== 'kick' && selectedPlatform !== 'tiktok' && selectedPlatform !== 'bluesky' && selectedPlatform !== 'music' && selectedPlatform !== 'mastodon' && selectedPlatform !== 'rumble' && selectedPlatform !== 'substack' ? [{ id: 'views', name: 'Most Views', icon: Eye }] : []),
    { id: 'growth', name: 'Fastest Growing', icon: TrendingUp },
  ];

  useEffect(() => {
    if (urlPlatform && urlPlatform !== selectedPlatform) {
      setSelectedPlatform(urlPlatform);
    }
  }, [urlPlatform]);

  useEffect(() => {
    loadRankings();
  }, [selectedPlatform, selectedRankType, topCount]);

  useEffect(() => {
    getFeaturedListings(selectedPlatform)
      .then(setSponsoredListings)
      .catch(() => setSponsoredListings([]));
  }, [selectedPlatform]);

  const loadRankings = async () => {
    setLoading(true);
    setError(null);
    setSparklines({});
    try {
      const data = await getRankedCreators(selectedPlatform, selectedRankType, topCount);
      setRankings(data);

      // Lazy-load sparkline data after the main rankings render — non-blocking.
      // Fire-and-forget; sparklines fade in as data arrives.
      if (data.length > 0) {
        getSparklineData(data.map(c => c.id), 30)
          .then(setSparklines)
          .catch(() => {}); // sparklines are non-critical
      }
    } catch (err) {
      logger.error('Failed to load rankings:', err);
      setError(err.message || 'Failed to load rankings');
      setRankings([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset column sort when rank type or platform changes
  useEffect(() => {
    setSortColumn(null);
    setSortDirection('desc');
  }, [selectedRankType, selectedPlatform]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      // Data is pre-sorted desc by the active rank type, so if clicking that
      // same column with no custom sort active, start ascending for a visible change
      const startDir = (!sortColumn && column === selectedRankType) ? 'asc' : 'desc';
      setSortColumn(column);
      setSortDirection(startDir);
    }
  };

  const sortedRankings = useMemo(() => {
    const withRank = rankings.map((c, i) => ({ ...c, originalRank: i + 1 }));
    if (!sortColumn) return withRank;
    const getValue = (creator) => {
      switch (sortColumn) {
        case 'subscribers': return creator.subscribers || 0;
        case 'views': return creator.totalViews || 0;
        case 'growth': return creator.growth30d || 0;
        default: return 0;
      }
    };
    return [...withRank].sort((a, b) => {
      const aVal = getValue(a);
      const bVal = getValue(b);
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [rankings, sortColumn, sortDirection]);

  // Inject sponsored slots into the organic ranking list:
  //   Premium: 2 slots reserved, between ranks 4-5 and 9-10
  //   Basic:   3 slots reserved, every 5 rows starting at organic index 14
  //
  // When a slot is SOLD: render the buyer's creator with the Ad badge.
  // When a slot is UNSOLD: render a ghost "Your Creator Here" row that links
  //   to /promote. This advertises the product on every rankings page and
  //   gets seamlessly replaced the moment someone buys (queue auto-promotes).
  const PREMIUM_SLOT_PRICE = '$149/mo';
  const BASIC_SLOT_PRICE = '$49/mo';
  const displayList = useMemo(() => {
    const premiumListings = sponsoredListings.filter(l => l.placement_tier === 'premium');
    const basicListings = sponsoredListings.filter(l => l.placement_tier !== 'premium');

    // Build a flat queue of premium slot fills (real listing OR ghost) of length 2
    const premiumQueue = [];
    for (let k = 0; k < 2; k++) {
      premiumQueue.push(premiumListings[k] || null);
    }
    // Basic queue length = however many slots fit in the visible ranking range.
    // Slots sit at organic indexes 14, 19, 24, 29, ... → one slot every 5 rows
    // starting at index 14. For Top 50 that's 8 slots, Top 100 = 18, Top 500 = 98.
    // This ensures ghost "Your Creator Here" promos appear in every reserved
    // basic slot on every page-size variant, not just the first 3.
    const totalBasicSlots = sortedRankings.length >= 15
      ? Math.floor((sortedRankings.length - 14) / 5) + 1
      : 0;
    const basicQueue = [];
    for (let k = 0; k < totalBasicSlots; k++) {
      basicQueue.push(basicListings[k] || null);
    }

    const makeSponsored = (listing, isPremium, slotIndex) => {
      if (listing) {
        const c = listing.creators || {};
        return {
          ...c,
          isSponsored: true,
          isPremium,
          listingId: listing.id,
          display_name: c.display_name,
          username: c.username,
          profile_image: c.profile_image,
          platform: c.platform,
        };
      }
      // Ghost placeholder — same shape so the row renderer handles both
      return {
        isSponsored: true,
        isPremium,
        isGhost: true,
        listingId: `ghost-${isPremium ? 'premium' : 'basic'}-${slotIndex}`,
        display_name: 'Your Creator Here',
        username: null,
        profile_image: null,
        platform: selectedPlatform,
        slotPrice: isPremium ? PREMIUM_SLOT_PRICE : BASIC_SLOT_PRICE,
      };
    };

    const result = [];
    let premiumIdx = 0;
    let basicIdx = 0;
    let nextBasicSlot = 14; // organic index where the first basic slot drops in

    for (let i = 0; i < sortedRankings.length; i++) {
      // Premium slot #1: between rank 4 and 5 (organic index 4)
      if (i === 4 && premiumIdx < premiumQueue.length) {
        result.push(makeSponsored(premiumQueue[premiumIdx], true, premiumIdx));
        premiumIdx++;
      }
      // Premium slot #2: between rank 9 and 10
      if (i === 9 && premiumIdx < premiumQueue.length) {
        result.push(makeSponsored(premiumQueue[premiumIdx], true, premiumIdx));
        premiumIdx++;
      }
      // Basic slots: every 5 rows from organic index 14
      if (basicIdx < basicQueue.length && i === nextBasicSlot) {
        result.push(makeSponsored(basicQueue[basicIdx], false, basicIdx));
        basicIdx++;
        nextBasicSlot += 5;
      }
      result.push(sortedRankings[i]);
    }
    return result;
  }, [sortedRankings, sponsoredListings, selectedPlatform]);

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-neutral-700" />;
    return sortDirection === 'desc'
      ? <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
      : <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />;
  };

  const handlePlatformChange = (platformId) => {
    if (!platformId) return;
    setSelectedPlatform(platformId);
    // Reset rank type if switching to a platform that doesn't support it
    const noViews = platformId === 'kick' || platformId === 'tiktok' || platformId === 'bluesky' || platformId === 'music' || platformId === 'mastodon' || platformId === 'rumble' || platformId === 'substack';
    if (selectedRankType === 'views' && noViews) setSelectedRankType('subscribers');
    navigate(`/rankings/${platformId}`);
    analytics.switchPlatform('rankings', platformId);
  };

  const followerLabel = selectedPlatform === 'tiktok' || selectedPlatform === 'twitch' || selectedPlatform === 'bluesky' || selectedPlatform === 'mastodon' || selectedPlatform === 'rumble' ? 'Followers' : selectedPlatform === 'music' ? 'Listeners' : selectedPlatform === 'kick' ? 'Paid Subs' : 'Subscribers';
  // Optional secondary stat column shown between the sparkline and Growth.
  // Each platform maps to the one extra public metric worth showing (or none).
  // `key` is the field on the ranking row; `sortKey` is the sortable column id.
  // Platforms with no meaningful second metric (twitch/kick use hours-watched
  // via the growth tab; substack has only subscribers) show no column and give
  // the Creator column the extra span so the row fills the grid evenly.
  const SECONDARY_COLUMN = {
    youtube:  { label: 'Views',  key: 'totalViews', sortKey: 'views' },
    tiktok:   { label: 'Likes',  key: 'totalViews', sortKey: 'views' },
    music:    { label: 'Plays',  key: 'totalViews', sortKey: 'views' },
    rumble:   { label: 'Videos', key: 'totalPosts', sortKey: null },
    mastodon: { label: 'Posts',  key: 'totalPosts', sortKey: null },
    bluesky:  { label: 'Posts',  key: 'totalPosts', sortKey: null },
  };
  const secondaryCol = SECONDARY_COLUMN[selectedPlatform] || null;
  // Full literal class strings (not interpolated) so Tailwind's JIT emits them.
  const creatorColSpanHeader = secondaryCol ? 'col-span-4' : 'col-span-5';
  const creatorColSpanRow = secondaryCol ? 'md:col-span-4' : 'md:col-span-5';
  const currentPlatform = platforms.find(p => p.id === selectedPlatform);
  const seoData = getSeoData(currentPlatform, selectedRankType, topCount);
  const listSchema = createRankingListSchema(rankings, currentPlatform, topCount);

  return (
    <>
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
      />
      {listSchema && <StructuredData schema={listSchema} />}

      <div className="min-h-screen bg-[#fafafa]">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-neutral-200">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900">{getH1Text(currentPlatform, topCount)}</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-sm sm:text-base text-neutral-700">{getSubheading(currentPlatform)}</p>
          </div>
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          {/* Platform Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              const isSelected = selectedPlatform === platform.id;

              return (
                <button
                  key={platform.id}
                  onClick={() => platform.available && handlePlatformChange(platform.id)}
                  disabled={!platform.available}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                    isSelected
                      ? `${platform.color} text-white shadow-md`
                      : platform.available
                      ? 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      : 'bg-neutral-50 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                  {platform.name}
                  {!platform.available && <span className="text-xs opacity-75">(Soon)</span>}
                </button>
              );
            })}
          </div>

          {/* Rank Type Tabs + Top Count Selector */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
              {rankTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedRankType(type.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    selectedRankType === type.id
                      ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <type.icon className="w-4 h-4 flex-shrink-0" />
                  <span className={selectedRankType === type.id ? 'inline' : 'hidden sm:inline'}>{type.name}</span>
                </button>
              ))}
            </div>

            {/* Top Count Dropdown */}
            <div className="relative">
              <button
                onClick={() => setTopCountOpen(!topCountOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl font-medium text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 transition-all"
              >
                <Trophy className="w-4 h-4 text-indigo-500" />
                Top {topCount}
                <ChevronDown className={`w-4 h-4 text-neutral-700 transition-transform ${topCountOpen ? 'rotate-180' : ''}`} />
              </button>
              {topCountOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setTopCountOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-40 min-w-[120px] overflow-hidden">
                    {topCounts.map(count => (
                      <button
                        key={count}
                        onClick={() => {
                          setTopCount(count);
                          setTopCountOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          topCount === count
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        Top {count}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rankings Table */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Sticky Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-neutral-200 text-sm font-semibold text-neutral-700 uppercase tracking-wider">
              <div className="col-span-1">Rank</div>
              <div className={creatorColSpanHeader}>Creator</div>
              <button
                onClick={() => handleSort('subscribers')}
                className="col-span-2 flex items-center justify-end gap-1 text-right hover:text-neutral-700 transition-colors cursor-pointer"
              >
                <span>{followerLabel}</span>
                <SortIcon column="subscribers" />
              </button>
              <div className="col-span-2 text-right">30-Day Trend</div>
              {secondaryCol && (
                secondaryCol.sortKey ? (
                  <button
                    onClick={() => handleSort(secondaryCol.sortKey)}
                    className="col-span-2 flex items-center justify-end gap-1 text-right hover:text-neutral-700 transition-colors cursor-pointer"
                  >
                    <span>{secondaryCol.label}</span>
                    <SortIcon column={secondaryCol.sortKey} />
                  </button>
                ) : (
                  <div className="col-span-2 text-right">{secondaryCol.label}</div>
                )
              )}
              <button
                onClick={() => handleSort('growth')}
                className="col-span-1 flex items-center justify-end gap-1.5 text-right hover:text-neutral-700 transition-colors cursor-pointer group"
              >
                <span>Growth</span>
                <SortIcon column="growth" />
                <div className="relative">
                  <Info className="w-3.5 h-3.5 text-neutral-700 cursor-help" />
                  <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 pointer-events-none normal-case tracking-normal font-normal">
                    {selectedPlatform === 'youtube'
                      ? 'YouTube growth based on total views'
                      : selectedPlatform === 'kick'
                      ? 'Kick growth based on paid subscribers'
                      : selectedPlatform === 'tiktok'
                      ? 'TikTok growth based on followers'
                      : selectedPlatform === 'bluesky'
                      ? 'Bluesky growth based on followers'
                      : 'Twitch growth based on watch hours'}
                  </div>
                </div>
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="px-6 py-4">
                <TableSkeleton rows={10} />
              </div>
            )}

            {/* Error State - Fun Version */}
            {!loading && error && (
              <FunErrorState
                type={error.includes('fetch') ? 'server' : 'network'}
                message={error}
                onRetry={loadRankings}
                retryText="Retry"
              />
            )}

            {/* Empty State */}
            {!loading && !error && rankings.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-neutral-700" />
                </div>
                <p className="text-neutral-700 font-medium mb-2">No ranking data available yet</p>
                <p className="text-sm text-neutral-700">Rankings will appear here once creators are tracked</p>
              </div>
            )}

            {/* Rankings List */}
            {!loading && !error && displayList.map((creator, index) => {
              if (creator.isSponsored) {
                const isPremium = creator.isPremium;
                const isGhost = creator.isGhost;
                // Ghost slots link to /promote (CTA), real slots link to the
                // creator's profile. Different visual treatment makes the
                // available-slot read clearly without breaking the row layout.
                const RowComponent = isGhost ? Link : Link;
                const rowHref = isGhost ? '/promote' : `/${creator.platform}/${creator.username}`;
                const rowClass = isGhost
                  ? 'grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-50 transition-colors group relative overflow-hidden'
                  : isPremium
                    ? 'grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-amber-200/60 bg-amber-50 hover:bg-amber-100 transition-colors group'
                    : 'grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-amber-100 bg-amber-50/50 hover:bg-amber-50 transition-colors group';
                return (
                  <RowComponent
                    key={`sponsored-${creator.listingId}`}
                    to={rowHref}
                    className={rowClass}
                  >
                    {/* Ghost gets an animated shimmer to read as "this is the product, not a row" */}
                    {isGhost && (
                      <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/40 to-transparent animate-marquee" />
                    )}

                    {/* "Ad" badge in rank column */}
                    <div className="col-span-2 md:col-span-1 flex items-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold tracking-wide ${
                          isPremium
                            ? 'bg-amber-200 border border-amber-300 text-amber-900'
                            : 'bg-amber-100 border border-amber-200 text-amber-800'
                        }`}
                        title={isPremium ? 'Premium featured listing' : 'Featured listing'}
                      >
                        {isPremium && <span className="text-[10px]">★</span>}
                        Ad
                      </span>
                    </div>

                    {/* Creator info OR ghost call-to-action */}
                    <div className={`col-span-10 flex items-center gap-3 min-w-0 ${creatorColSpanRow}`}>
                      {isGhost ? (
                        <>
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-base font-extrabold flex-shrink-0 shadow-md shadow-amber-500/20">
                            {isPremium ? '★' : '+'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-neutral-900 group-hover:text-amber-700 transition-colors">
                              Your Creator Here
                            </p>
                            <p className="text-[11px] text-amber-700 font-semibold uppercase tracking-wider">
                              {isPremium ? 'Premium slot' : 'Basic slot'} available · {creator.slotPrice}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <CreatorAvatar src={creator.profile_image} name={creator.display_name} size="lg" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate text-neutral-900 group-hover:text-amber-700 transition-colors">
                              {creator.display_name}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Empty stat columns to match the organic-row layout, then a
                        Claim CTA in the trailing column. Views column only when
                        the platform actually has a Views column. */}
                    <div className="hidden md:block col-span-2" />
                    <div className="hidden md:block col-span-2" />
                    {secondaryCol && <div className="hidden md:block col-span-2" />}
                    <div className="hidden md:flex col-span-1 items-center justify-end">
                      {isGhost && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 group-hover:gap-2 transition-all whitespace-nowrap">
                          Claim
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </RowComponent>
                );
              }

              return (
                <Link
                  key={creator.id}
                  to={`/${creator.platform}/${creator.username}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-neutral-200 hover:bg-neutral-50 transition-colors group"
                >
                  {/* Rank */}
                  <div className="col-span-2 md:col-span-1">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                      creator.originalRank === 1 ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50' :
                      creator.originalRank === 2 ? 'bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/30' :
                      creator.originalRank === 3 ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40' :
                      'bg-neutral-50 text-neutral-400'
                    }`}>
                      {creator.originalRank}
                    </span>
                  </div>

                  {/* Creator Info */}
                  <div className={`col-span-10 flex items-center gap-3 min-w-0 ${creatorColSpanRow}`}>
                    <CreatorAvatar src={creator.profile_image} name={creator.display_name} size="lg" />
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 truncate group-hover:text-indigo-400 transition-colors">
                        {creator.display_name}
                      </p>
                    </div>
                  </div>

                  {/* Subscribers / Followers */}
                  <div className="hidden md:block col-span-2 text-right">
                    <span className="font-semibold text-neutral-900 tabular-nums">{formatNumber(creator.subscribers)}</span>
                  </div>

                  {/* Sparkline trend */}
                  <div className="hidden md:flex col-span-2 justify-end items-center">
                    <Sparkline data={sparklines[creator.id] || []} width={88} height={28} />
                  </div>

                  {/* Secondary metric (Views/Likes/Plays/Videos/Posts) per platform */}
                  {secondaryCol && (
                    <div className="hidden md:block col-span-2 text-right">
                      <span className="text-neutral-700 tabular-nums">{formatNumber(creator[secondaryCol.key])}</span>
                    </div>
                  )}

                  {/* 30-Day Growth, absolute + percentage.
                      growth_30d is in different units per platform (views for YouTube, followers for TikTok/Bluesky,
                      watch hours for Twitch, paid subs for Kick). Pick the right base for the %, and skip the %
                      when the result would be implausible (e.g. when units don't match). */}
                  <div className="hidden md:flex col-span-1 flex-col items-end justify-center">
                    {(() => {
                      const g = creator.growth30d;
                      if (typeof g !== 'number') return null;
                      // Choose base by platform: YouTube growth is views, Twitch is watch hours (no clean %),
                      // every other platform tracks the same unit as the displayed "subscribers" field.
                      let base = null;
                      if (selectedPlatform === 'youtube') base = creator.totalViews;
                      else if (selectedPlatform === 'twitch') base = null; // hide % — units differ from displayed count
                      else base = creator.subscribers;
                      const denom = typeof base === 'number' && base > Math.abs(g) ? base - g : null;
                      const pct = denom && denom > 0 ? (g / denom) * 100 : null;
                      const showPct = pct !== null && Math.abs(pct) < 1000;
                      const color = g > 0 ? 'text-emerald-400' : g < 0 ? 'text-red-400' : 'text-neutral-400';
                      const arrow = g > 0 ? '▲' : g < 0 ? '▼' : '·';
                      return (
                        <>
                          <span className={`font-semibold text-sm tabular-nums ${color}`}>
                            {g > 0 ? '+' : ''}{formatNumber(g)}
                          </span>
                          {showPct && (
                            <span className={`text-[10px] tabular-nums ${color} opacity-80`}>
                              {arrow} {Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Stats - Mobile (inline in creator column) */}
                  <div className="md:hidden col-span-12 pl-[52px] -mt-2 pb-1">
                    <span className="text-xs text-neutral-500">
                      <span className="font-semibold text-neutral-800">{formatNumber(creator.subscribers)}</span> {followerLabel.toLowerCase()}
                      {secondaryCol && (
                        <span className="ml-2 text-neutral-400">· <span className="font-semibold text-neutral-700">{formatNumber(creator[secondaryCol.key])}</span> {secondaryCol.label.toLowerCase()}</span>
                      )}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* SEO FAQ Section */}
          {!loading && !error && rankings.length > 0 && (
            <div className="mt-12 bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-6">
                {currentPlatform?.name} Rankings FAQ
              </h2>
              <div className="space-y-6 text-neutral-700 text-sm sm:text-base leading-relaxed">
                {selectedPlatform === 'youtube' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most YouTube subscribers?</h3>
                      <p>{rankings[0]?.display_name} currently holds the top spot with {formatNumber(rankings[0]?.subscribers)} subscribers. Our rankings are updated daily from publicly available data.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">How are the top YouTuber rankings calculated?</h3>
                      <p>We track subscriber counts, total views, and 30-day growth for every channel in our database. You can sort by subscribers, views, or fastest growing to find the top YouTubers by any metric.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">How often are these rankings updated?</h3>
                      <p>Stats are collected multiple times per day, so the rankings reflect the latest publicly available data from YouTube.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'tiktok' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most TikTok followers?</h3>
                      <p>{rankings[0]?.display_name} sits at the top with {formatNumber(rankings[0]?.subscribers)} followers. We track follower counts and likes for TikTok's biggest creators.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most TikTok likes?</h3>
                      <p>Our TikTok rankings track both followers and total likes. Sort by different metrics to see who's leading in each category.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'twitch' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who is the most followed Twitch streamer?</h3>
                      <p>{rankings[0]?.display_name} leads with {formatNumber(rankings[0]?.subscribers)} followers. We track all major Twitch streamers with daily updates.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Which Twitch streamer has the most watch hours?</h3>
                      <p>We track hours watched for every Twitch streamer in our database. Sort by growth to see which streamers are pulling the most watch hours over the last 30 days.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'kick' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who is the top Kick streamer?</h3>
                      <p>{rankings[0]?.display_name} leads the Kick rankings with {formatNumber(rankings[0]?.subscribers)} paid subscribers. We track all major Kick streamers with daily updates.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">How are Kick rankings different from Twitch?</h3>
                      <p>Kick rankings are based on paid subscriber counts rather than free followers. This makes the numbers smaller but more meaningful in terms of direct creator support.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'bluesky' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most Bluesky followers?</h3>
                      <p>{rankings[0]?.display_name} holds the top spot with {formatNumber(rankings[0]?.subscribers)} followers. We track major Bluesky accounts with daily updates from publicly available data.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">How are Bluesky rankings calculated?</h3>
                      <p>We track follower counts and post activity for Bluesky accounts, ranked by followers and updated daily.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'music' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most monthly listeners?</h3>
                      <p>{rankings[0]?.display_name} holds the top spot with {formatNumber(rankings[0]?.subscribers)} monthly listeners. Rankings update daily from publicly available data.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">What do the listener counts mean?</h3>
                      <p>Monthly listeners count the number of unique people who played an artist's music in the last 30 days. Total plays count every stream ever recorded. Both metrics come from Last.fm's global tracking data.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'mastodon' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most Mastodon followers?</h3>
                      <p>{rankings[0]?.display_name} leads with {formatNumber(rankings[0]?.subscribers)} followers. We track major fediverse accounts using publicly available information, updated daily.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">How do Mastodon handles work?</h3>
                      <p>Mastodon is decentralized, so every account belongs to an instance and the handle includes it (for example, user@mastodon.social).</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'rumble' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Who has the most Rumble followers?</h3>
                      <p>{rankings[0]?.display_name} leads the Rumble rankings with {formatNumber(rankings[0]?.subscribers)} followers. We track follower counts and video output for major channels, updated daily.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">What do Rumble rankings track?</h3>
                      <p>We track follower count and video output for major Rumble channels using publicly available information, updated daily.</p>
                    </div>
                  </>
                )}
                {selectedPlatform === 'substack' && (
                  <>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">What are the top Substack newsletters?</h3>
                      <p>{rankings[0]?.display_name} sits at the top of our Substack rankings. We track the biggest newsletters across every Substack category and update daily.</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Why are Substack numbers approximate?</h3>
                      <p>Substack makes subscriber counts public as approximate ranges rather than exact numbers, so the figure shown is an approximate minimum.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

