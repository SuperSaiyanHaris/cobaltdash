import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ExternalLink, Share2, AlertCircle } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import MusicIcon from '../components/MusicIcon';
import { getChannelByUsername as getYouTubeChannel } from '../services/youtubeService';
import { getChannelByUsername as getTwitchChannel } from '../services/twitchService';
import { getChannelByUsername as getKickChannel } from '../services/kickService';
import { getArtistByMbid, getArtistByName } from '../services/musicService';
import { getCreatorByUsername } from '../services/creatorService';
import Odometer from '../components/Odometer';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';
import { analytics } from '../lib/analytics';
import logger from '../lib/logger';
import { toast } from 'sonner';
import { PLATFORM_DISPLAY_NAMES } from '../lib/constants';

// Per-platform accent used for the counter digits + the white identity badge.
// Badge follows the same white-pill-with-brand-border convention as CreatorProfile
// (bg-white + colored border/text) so the platform's own icon color never has to
// sit on a matching-hue background — that's what made the YouTube badge unreadable.
const platformConfig = {
  youtube: {
    icon: YouTubeIcon,
    accent: 'text-red-500',
    badgeText: 'text-red-700',
    badgeBorder: 'border-red-200',
    label: 'subscribers',
  },
  twitch: {
    icon: TwitchIcon,
    accent: 'text-purple-500',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    label: 'followers',
  },
  kick: {
    icon: KickIcon,
    accent: 'text-green-500',
    badgeText: 'text-green-700',
    badgeBorder: 'border-green-200',
    label: 'paid subscribers',
  },
  music: {
    icon: MusicIcon,
    accent: 'text-amber-500',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    label: 'monthly listeners',
  },
};

// Platform URLs for linking to actual channel
const platformUrls = {
  youtube: (username) => `https://youtube.com/@${username}`,
  twitch: (username) => `https://twitch.tv/${username}`,
  kick: (username) => `https://kick.com/${username}`,
  music: (username) => `https://www.last.fm/music/${encodeURIComponent(username.replace(/-/g, '+'))}`,
};

// How often the counter re-reads the real number. The platform proxies are
// CDN-cached for 60-120s, so polling faster would only re-read the same value.
const POLL_MS = 60 * 1000;

// Only real, fetched counts are ever displayed; the Odometer animates between
// consecutive real readings. (This page previously added random offsets and
// simulated ticks between fetches, which showed numbers that never existed.)
async function fetchCount(platform, username) {
  if (platform === 'youtube') return getYouTubeChannel(username);
  if (platform === 'twitch') return getTwitchChannel(username);
  if (platform === 'kick') return getKickChannel(username);
  if (platform === 'music') {
    const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const dbCreator = await getCreatorByUsername('music', username);
    if (!dbCreator?.platform_id) return null;
    return MBID_RE.test(dbCreator.platform_id)
      ? getArtistByMbid(dbCreator.platform_id)
      : getArtistByName(dbCreator.display_name || username);
  }
  return null;
}

function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function LiveCount() {
  const { platform, username } = useParams();
  // One result per route; `loading` is simply "no result for this route yet",
  // so navigating between counters never shows the previous creator's number.
  const routeKey = `${platform}/${username}`;
  const [result, setResult] = useState({ key: null, creator: null, error: null });
  const [count, setCount] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const loading = result.key !== routeKey;
  const creator = loading ? null : result.creator;
  const error = loading ? null : result.error;

  const config = platformConfig[platform] || platformConfig.youtube;
  const Icon = config.icon;
  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCount(platform, username);
        if (cancelled) return;
        if (!data) { setResult({ key: routeKey, creator: null, error: 'Creator not found' }); return; }
        const value = data.subscribers || data.followers || 0;
        setCount(value);
        setUpdatedAt(Date.now());
        setResult({ key: routeKey, creator: data, error: null });
        analytics.viewLiveCount(platform, username, data.displayName, value);
      } catch (err) {
        if (cancelled) return;
        logger.error('Fetch error:', err);
        setResult({ key: routeKey, creator: null, error: err.message || 'Failed to load creator' });
      }
    })();
    return () => { cancelled = true; };
  }, [platform, username, routeKey]);

  // Re-read the real count while the tab is visible
  useEffect(() => {
    if (!creator) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await fetchCount(platform, username);
        if (cancelled || !data) return;
        const value = data.subscribers || data.followers;
        if (value) setCount(value);
        setUpdatedAt(Date.now());
      } catch {
        // Keep showing the last real reading
      }
    };
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [creator, platform, username]);

  const handleShare = async () => {
    const url = window.location.href;
    const text = `${creator?.displayName || username}'s live ${config.label} count`;

    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        analytics.share(platform, username, creator?.displayName, 'native');
      } catch {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(url);
      analytics.share(platform, username, creator?.displayName, 'copy_link');
      toast.success('Live count link copied');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <SEO title="Loading..." />
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400 text-lg">Loading live count...</p>
        </div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <SEO title="Creator Not Found" noindex />
        <div className="text-center">
          <AlertCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-3">Creator Not Found</h2>
          <p className="text-gray-400 mb-6 text-lg">{error || `Could not find @${username} on ${platformName}`}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-neutral-900 font-semibold rounded-2xl hover:bg-neutral-100 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`${creator.displayName} Live ${config.label.charAt(0).toUpperCase() + config.label.slice(1)} Count`}
        description={`Watch ${creator.displayName}'s ${platformName} ${config.label} count update in real-time. Refreshed from the platform every minute.`}
      />

      <div className="relative isolate min-h-screen grain-dark bg-[#0a0a0f] flex flex-col overflow-hidden">
        {/* Bespoke background — flat dark base + a faint engineering dot-grid,
            same texture used on the home hero. No glow blobs, no radial washes. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />

        {/* Main Content */}
        <div className="relative flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
          <div className="text-center w-full max-w-4xl">

            {/* Live Indicator — small dot + micro text, the sitewide LIVE convention */}
            <div className="inline-flex items-center gap-2.5 mb-6 sm:mb-8 px-3.5 py-1.5 rounded-full border border-red-500/30 bg-red-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-red-400 font-semibold text-xs sm:text-sm uppercase tracking-[0.25em]">On Air</span>
            </div>

            {/* Creator Info */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-12">
              <CreatorAvatar
                src={creator.profileImage}
                name={creator.displayName}
                size="3xl"
                rounded="rounded-2xl sm:rounded-3xl"
                loading="eager"
                className="!w-24 !h-24 sm:!w-28 sm:!h-28 md:!w-32 md:!h-32 border-4 border-white/10"
              />
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">{creator.displayName}</h1>
                <p className="text-gray-400 text-base sm:text-lg mb-3">@{creator.username || username}</p>
                <a
                  href={platformUrls[platform]?.(creator.username || username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-white border ${config.badgeBorder} ${config.badgeText} hover:opacity-90 transition-opacity`}
                >
                  <Icon className="w-4 h-4" />
                  {platformName}
                </a>
              </div>
            </div>

            {/* The Big Counter — bold solid color, no glow shadow */}
            <div className="mb-10 sm:mb-14">
              <div
                className={`text-5xl sm:text-6xl md:text-8xl lg:text-9xl xl:text-[10rem] font-black ${config.accent} tracking-tighter leading-none`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {count !== null && (
                  <Odometer value={count} duration={800} />
                )}
              </div>
              <p className="text-base sm:text-lg md:text-xl text-neutral-500 mt-5 font-semibold uppercase tracking-[0.3em]">
                {config.label}
              </p>
              <p className="text-xs sm:text-sm text-neutral-500 mt-3">
                {updatedAt ? `Updated ${formatAgo(now - updatedAt)}` : ''} &middot; refreshes every minute
                {platform === 'youtube' && count >= 1000 && <span className="block mt-1 text-neutral-600">YouTube rounds public subscriber counts to 3 significant figures</span>}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition-colors border border-white/10"
              >
                <Share2 className="w-5 h-5" />
                Share
              </button>
              <Link
                to={`/${platform}/${username}`}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl transition-colors border border-white/10"
              >
                <ExternalLink className="w-5 h-5" />
                Full Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
