import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Music } from 'lucide-react';
import SEO from '../components/SEO';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import { getRankedCreators } from '../services/creatorService';
import { formatNumber } from '../lib/utils';
import CreatorAvatar from '../components/CreatorAvatar';
import PageHero from '../components/PageHero';
import RankingsPodium from '../components/rankings/RankingsPodium';

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', icon: YouTubeIcon, tint: '', followerLabel: 'subscribers', growthLabel: 'views gained', growthNote: 'YouTube rounds subscriber counts by policy, so views are used as the growth metric.' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, tint: 'text-pink-500', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
  { id: 'twitch', name: 'Twitch', icon: TwitchIcon, tint: '', followerLabel: 'followers', growthLabel: 'watch hours gained', growthNote: 'Twitch growth is measured by hours watched per month, the standard streaming metric.' },
  { id: 'kick', name: 'Kick', icon: KickIcon, tint: 'text-green-600', followerLabel: 'paid subs', growthLabel: 'paid subs gained', growthNote: 'On Kick, the publicly available number is paid subscribers rather than free followers.' },
  { id: 'bluesky', name: 'Bluesky', icon: BlueskyIcon, tint: 'text-sky-500', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
  { id: 'music', name: 'Music', icon: Music, tint: 'text-amber-500', followerLabel: 'listeners', growthLabel: 'listeners gained', growthNote: 'Monthly listener growth. Reflects how many more unique listeners an artist reached this month vs. last.' },
  { id: 'mastodon', name: 'Mastodon', icon: MastodonIcon, tint: 'text-violet-500', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
];

export default function Trending() {
  const [activePlatform, setActivePlatform] = useState('youtube');
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cache, setCache] = useState({});

  useEffect(() => {
    if (cache[activePlatform]) {
      setCreators(cache[activePlatform]);
      return;
    }
    setLoading(true);
    getRankedCreators(activePlatform, 'growth', 25).then(data => {
      const filtered = (data || []).filter(c => c.growth30d > 0);
      setCreators(filtered);
      setCache(prev => ({ ...prev, [activePlatform]: filtered }));
      setLoading(false);
    });
  }, [activePlatform]);

  const platform = PLATFORMS.find(p => p.id === activePlatform);

  return (
    <>
      <SEO
        title="Trending Creators"
        description="See the fastest growing YouTube, TikTok, Twitch, Kick, Bluesky, and Music artists this month. Rankings updated daily."
        keywords="trending creators, fastest growing youtubers, fastest growing tiktok accounts, trending streamers, creator growth rankings"
      />
      <div className="min-h-screen bg-[#fafaf9]">
        <PageHero
          eyebrow="Trending · updated daily"
          title="Who's growing fastest right now."
          subtitle="The creators gaining the most ground over the last 30 days, platform by platform."
        >
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {PLATFORMS.map(p => {
              const PIcon = p.icon;
              const isActive = p.id === activePlatform;
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePlatform(p.id)}
                  className={`flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors border flex-shrink-0 ${
                    isActive ? 'bg-white border-white text-neutral-950' : 'bg-white/[0.06] border-white/15 text-white hover:border-white/50'
                  }`}
                >
                  <PIcon className={`w-4 h-4 ${isActive ? p.tint : 'text-white'}`} />
                  {p.name}
                </button>
              );
            })}
          </div>
          {!loading && creators.length >= 3 && (
            <RankingsPodium creators={creators.slice(0, 3).map(c => ({ ...c, platform: activePlatform }))} />
          )}
        </PageHero>

        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-10">
          {/* Metric note */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-neutral-600">
              Ranked by <span className="text-neutral-600 font-medium">{platform.growthLabel}</span> over the last 30 days
              {platform.growthNote && <span className="hidden sm:inline">. {platform.growthNote}</span>}
            </p>
          </div>

          {/* Creator list */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
            </div>
          ) : creators.length === 0 ? (
            <p className="text-center py-20 text-neutral-600 text-sm">No growth data available yet for this platform.</p>
          ) : (
            <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
              {creators.map((creator, i) => {

                const baseSubs = creator.latestStats.subscribers - creator.growth30d;
                const growthPct = baseSubs > 0 ? ((creator.growth30d / baseSubs) * 100).toFixed(1) : null;
                return (
                  <Link
                    key={creator.id}
                    to={`/${activePlatform}/${creator.username}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-neutral-50 transition-colors"
                  >
                    <span className={`w-6 text-right text-sm font-semibold tabular-nums flex-shrink-0 ${i < 3 ? 'text-neutral-900' : 'text-neutral-600'}`}>{i + 1}</span>
                    <CreatorAvatar
                      src={creator.profile_image}
                      name={creator.display_name}
                      size="lg"
                      rounded="rounded-lg"
                      className="!w-10 !h-10"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-900 truncate text-sm">{creator.display_name}</p>
                      <p className="text-xs text-neutral-600 truncate tabular-nums">{formatNumber(creator.latestStats.subscribers)} {platform.followerLabel}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-emerald-600 text-sm tabular-nums">
                        +{formatNumber(creator.growth30d)}
                        {growthPct && <span className="ml-1.5 text-xs font-medium text-emerald-600/70">+{growthPct}%</span>}
                      </p>
                      <p className={MICRO}>{platform.growthLabel}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Methodology note */}
          {!loading && creators.length > 0 && (
            <div className={`mt-10 ${CARD} p-6 sm:p-8`}>
              <h2 className="text-base font-medium text-neutral-900 mb-3">How growth is calculated</h2>
              <div className="space-y-2 text-sm text-neutral-700 leading-relaxed">
                <p>Growth is the difference between a creator's latest stat and their stat from 30 days ago. All data is publicly available, collected multiple times per day.</p>
                <p>YouTube uses total view growth instead of subscribers because YouTube rounds subscriber counts to three significant figures by policy. Twitch and Kick use hours watched, the metric the streaming industry uses to measure audience engagement. TikTok, Bluesky, and Music use follower and listener growth, which are the primary public metrics on those platforms.</p>
                <p>Only creators with positive growth appear here. Creators are tracked daily, so rankings update as new data comes in.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
