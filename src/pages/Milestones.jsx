import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Milestone, Loader2, Music } from 'lucide-react';
import { Youtube, Twitch } from 'lucide-react';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import { getRecentMilestones } from '../services/creatorService';
import { formatNumber, formatRelativeTime } from '../lib/utils';

const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, tint: 'text-red-500', metric: 'subscribers' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, tint: 'text-pink-500', metric: 'followers' },
  { id: 'twitch', name: 'Twitch', icon: Twitch, tint: 'text-purple-500', metric: 'followers' },
  { id: 'kick', name: 'Kick', icon: KickIcon, tint: 'text-green-600', metric: 'paid subs' },
  { id: 'bluesky', name: 'Bluesky', icon: BlueskyIcon, tint: 'text-sky-500', metric: 'followers' },
  { id: 'music', name: 'Music', icon: Music, tint: 'text-amber-500', metric: 'listeners' },
  { id: 'mastodon', name: 'Mastodon', icon: MastodonIcon, tint: 'text-violet-500', metric: 'followers' },
  { id: 'rumble', name: 'Rumble', icon: RumbleIcon, tint: 'text-lime-600', metric: 'followers' },
  { id: 'substack', name: 'Substack', icon: SubstackIcon, tint: 'text-orange-600', metric: 'subscribers' },
];
const PLATFORM_LOOKUP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export default function Milestones() {
  const [activePlatform, setActivePlatform] = useState(null); // null = all
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cache, setCache] = useState({});

  useEffect(() => {
    const key = activePlatform || 'all';
    if (cache[key]) {
      setMilestones(cache[key]);
      return;
    }
    setLoading(true);
    getRecentMilestones(activePlatform, 60).then((data) => {
      setMilestones(data || []);
      setCache((prev) => ({ ...prev, [key]: data || [] }));
      setLoading(false);
    });
  }, [activePlatform]);

  return (
    <>
      <SEO
        title="Creator Milestones"
        description="Real subscriber, follower, and listener thresholds crossed across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music, as they happen."
        keywords="creator milestones, subscriber milestones, follower milestones, creator growth events, youtube subscriber milestone, twitch follower milestone"
      />
      <div className="min-h-screen bg-[#fafaf9]">
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 py-10 sm:py-12 flex items-end justify-between gap-6">
            <div>
              <p className={`${MICRO} mb-3 flex items-center gap-1.5`}>
                <Milestone className="w-3 h-3 text-neutral-400" />
                Milestones
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Creator Milestones</h1>
              <p className="mt-2 text-sm text-neutral-500">Real subscriber, follower, and listener thresholds crossed, as they happen.</p>
              <p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-2xl">
                Every time a tracked creator's number crosses a round threshold, it shows up here.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 pb-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-600 tracking-wide">UPDATED DAILY</span>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Platform filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-3 mb-6 scrollbar-hide">
            <button
              onClick={() => setActivePlatform(null)}
              className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
                activePlatform === null
                  ? 'bg-neutral-900 border-neutral-900 text-white'
                  : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
              }`}
            >
              All platforms
            </button>
            {PLATFORMS.map((p) => {
              const PIcon = p.icon;
              const isActive = p.id === activePlatform;
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePlatform(p.id)}
                  className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border flex-shrink-0 ${
                    isActive
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                  }`}
                >
                  <PIcon className={`w-4 h-4 ${isActive ? 'text-white' : p.tint}`} />
                  {p.name}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
            </div>
          ) : milestones.length === 0 ? (
            <p className="text-center py-20 text-neutral-400 text-sm">No milestones recorded here yet.</p>
          ) : (
            <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
              {milestones.map((m) => {
                const meta = PLATFORM_LOOKUP[m.platform];
                const PIcon = meta?.icon;
                return (
                  <Link
                    key={m.id}
                    to={`/${m.platform}/${m.username}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="relative flex-shrink-0">
                      <CreatorAvatar
                        src={m.profileImage}
                        name={m.displayName}
                        size="lg"
                        rounded="rounded-lg"
                        className="!w-10 !h-10"
                      />
                      {PIcon && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-neutral-200 flex items-center justify-center">
                          <PIcon className={`w-2.5 h-2.5 ${meta.tint}`} />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-900 truncate text-sm">{m.displayName}</p>
                      <p className="text-xs text-neutral-400 truncate">
                        Crossed {formatNumber(m.threshold)} {meta?.metric || 'followers'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-neutral-900 text-sm tabular-nums">{formatNumber(m.metricValue)}</p>
                      <p className={MICRO}>{formatRelativeTime(m.crossedAt)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {!loading && milestones.length > 0 && (
            <div className={`mt-10 ${CARD} p-6 sm:p-8`}>
              <h2 className="text-base font-medium text-neutral-900 mb-3">How milestones work</h2>
              <div className="space-y-2 text-sm text-neutral-500 leading-relaxed">
                <p>When a creator's public number moves from below one of these thresholds to at or above it, that's recorded as a milestone the first time it happens. Every entry here reflects a real number that was actually recorded, nothing is predicted or estimated.</p>
                <p>Thresholds are scaled per platform, since a Kick paid-subscriber count and a YouTube subscriber count operate on completely different scales.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
