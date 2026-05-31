import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Loader2, Music } from 'lucide-react';
import { Youtube, Twitch } from 'lucide-react';
import SEO from '../components/SEO';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import { getRankedCreators } from '../services/creatorService';
import { formatNumber } from '../lib/utils';
import CreatorAvatar from '../components/CreatorAvatar';

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, textColor: 'text-red-400', activeBg: 'bg-red-50', activeBorder: 'border-red-300', followerLabel: 'subscribers', growthLabel: 'views gained', growthNote: 'YouTube rounds subscriber counts by policy, so views are used as the growth metric.' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, textColor: 'text-pink-400', activeBg: 'bg-pink-50', activeBorder: 'border-pink-300', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
  { id: 'twitch', name: 'Twitch', icon: Twitch, textColor: 'text-purple-400', activeBg: 'bg-purple-50', activeBorder: 'border-purple-300', followerLabel: 'followers', growthLabel: 'watch hours gained', growthNote: 'Twitch growth is measured by hours watched per month, the standard streaming metric.' },
  { id: 'kick', name: 'Kick', icon: KickIcon, textColor: 'text-green-400', activeBg: 'bg-green-50', activeBorder: 'border-green-300', followerLabel: 'paid subs', growthLabel: 'paid subs gained', growthNote: 'On Kick, the publicly available number is paid subscribers rather than free followers.' },
  { id: 'bluesky', name: 'Bluesky', icon: BlueskyIcon, textColor: 'text-sky-400', activeBg: 'bg-sky-50', activeBorder: 'border-sky-300', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
  { id: 'music', name: 'Music', icon: Music, textColor: 'text-amber-400', activeBg: 'bg-amber-50', activeBorder: 'border-amber-300', followerLabel: 'listeners', growthLabel: 'listeners gained', growthNote: 'Monthly listener growth. Reflects how many more unique listeners an artist reached this month vs. last.' },
  { id: 'mastodon', name: 'Mastodon', icon: MastodonIcon, textColor: 'text-violet-400', activeBg: 'bg-violet-50', activeBorder: 'border-violet-300', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
  { id: 'rumble', name: 'Rumble', icon: RumbleIcon, textColor: 'text-lime-600', activeBg: 'bg-lime-50', activeBorder: 'border-lime-300', followerLabel: 'followers', growthLabel: 'followers gained', growthNote: null },
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
      <div className="min-h-screen bg-[#fafafa]">
        {/* Page header */}
        <div className="bg-white/60 border-b border-neutral-200">
          <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Updated Daily</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 mb-2">Trending Creators</h1>
            <p className="text-neutral-500 text-base sm:text-lg mb-4">Fastest growing channels and accounts over the last 30 days.</p>
            <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl">
              These rankings show which creators are gaining the most ground right now. Each platform uses the metric that best captures real growth.
              YouTube ranks by total views gained since subscriber counts are rounded by policy.
              Twitch and Kick rank by hours watched, which is the standard metric sponsors and analytics platforms use.
              TikTok, Bluesky, and Music rank by follower and listener growth directly.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Platform tabs */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-8 scrollbar-hide">
            {PLATFORMS.map(p => {
              const PIcon = p.icon;
              const isActive = p.id === activePlatform;
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePlatform(p.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all duration-200 border flex-shrink-0 ${
                    isActive
                      ? `${p.activeBg} ${p.activeBorder} ${p.textColor}`
                      : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300'
                  }`}
                >
                  <PIcon className="w-4 h-4" />
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Metric note */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-neutral-400">
              Ranked by <span className="text-neutral-500 font-medium">{platform.growthLabel}</span> over the last 30 days
              {platform.growthNote && <span className="hidden sm:inline">. {platform.growthNote}</span>}
            </p>
          </div>

          {/* Creator list */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : creators.length === 0 ? (
            <p className="text-center py-20 text-neutral-400">No growth data available yet for this platform.</p>
          ) : (
            <div className="space-y-2">
              {creators.map((creator, i) => {

                const baseSubs = creator.latestStats.subscribers - creator.growth30d;
                const growthPct = baseSubs > 0 ? ((creator.growth30d / baseSubs) * 100).toFixed(1) : null;
                return (
                  <Link
                    key={creator.id}
                    to={`/${activePlatform}/${creator.username}`}
                    className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:bg-neutral-50 transition-all duration-200 group"
                  >
                    <span className="w-6 text-center text-sm font-bold text-neutral-400 flex-shrink-0">{i + 1}</span>
                    <CreatorAvatar
                      src={creator.profile_image}
                      name={creator.display_name}
                      size="lg"
                      className="!w-10 !h-10 sm:!w-11 sm:!h-11"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900 truncate group-hover:text-white text-sm sm:text-base">{creator.display_name}</p>
                      <p className="text-xs text-neutral-400 truncate">{formatNumber(creator.latestStats.subscribers)} {platform.followerLabel}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-emerald-400 text-sm sm:text-base">+{formatNumber(creator.growth30d)}</p>
                      <p className="text-xs text-neutral-400">{platform.growthLabel}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Methodology note */}
          {!loading && creators.length > 0 && (
            <div className="mt-10 bg-white/60 border border-neutral-200 rounded-2xl p-6 sm:p-8">
              <h2 className="text-base font-bold text-neutral-900 mb-3">How growth is calculated</h2>
              <div className="space-y-2 text-sm text-neutral-500 leading-relaxed">
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
