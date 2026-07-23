import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ExternalLink, Share2, AlertCircle } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import { Music } from 'lucide-react';
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

// Neon streaming-overlay theme — per-platform glow/text-shadow values
const platformConfig = {
  youtube: {
    icon: YouTubeIcon,
    color: 'text-red-400',
    bgGradient: 'from-red-500 to-rose-600',
    glowColor: 'shadow-red-500/30',
    neonGlow: '0 0 24px rgba(248,113,113,0.6), 0 0 60px rgba(248,113,113,0.35), 0 0 120px rgba(248,113,113,0.18)',
    neonAccent: '#f87171',
    label: 'subscribers',
    avgGrowthPerSecond: 2.5,
  },
  twitch: {
    icon: TwitchIcon,
    color: 'text-purple-400',
    bgGradient: 'from-purple-500 to-fuchsia-600',
    glowColor: 'shadow-purple-500/30',
    neonGlow: '0 0 24px rgba(192,132,252,0.6), 0 0 60px rgba(192,132,252,0.35), 0 0 120px rgba(192,132,252,0.18)',
    neonAccent: '#c084fc',
    label: 'followers',
    avgGrowthPerSecond: 0.8,
  },
  kick: {
    icon: KickIcon,
    color: 'text-green-400',
    bgGradient: 'from-green-500 to-emerald-600',
    glowColor: 'shadow-green-500/30',
    neonGlow: '0 0 24px rgba(74,222,128,0.6), 0 0 60px rgba(74,222,128,0.35), 0 0 120px rgba(74,222,128,0.18)',
    neonAccent: '#4ade80',
    label: 'paid subscribers',
    avgGrowthPerSecond: 0.3,
  },
  music: {
    icon: Music,
    color: 'text-amber-400',
    bgGradient: 'from-amber-500 to-orange-600',
    glowColor: 'shadow-amber-500/30',
    neonGlow: '0 0 24px rgba(251,191,36,0.6), 0 0 60px rgba(251,191,36,0.35), 0 0 120px rgba(251,191,36,0.18)',
    neonAccent: '#fbbf24',
    label: 'monthly listeners',
    avgGrowthPerSecond: 1.0,
  },
};

// Platform URLs for linking to actual channel
const platformUrls = {
  youtube: (username) => `https://youtube.com/@${username}`,
  twitch: (username) => `https://twitch.tv/${username}`,
  kick: (username) => `https://kick.com/${username}`,
  music: (username) => `https://www.last.fm/music/${encodeURIComponent(username.replace(/-/g, '+'))}`,
};

// Helper function to generate realistic random offset based on channel size
// Offsets are small enough to only affect last 3-4 digits, keeping the displayed count consistent
const getRandomOffset = (count) => {
  let maxOffset = 0;

  // Keep offsets small - only vary the last few digits so count looks consistent with profile
  if (count > 100000000) maxOffset = 5000;       // 100M+: ±5k (affects 5th digit at most)
  else if (count > 50000000) maxOffset = 3000;   // 50M-100M: ±3k
  else if (count > 10000000) maxOffset = 1500;   // 10M-50M: ±1.5k
  else if (count > 1000000) maxOffset = 800;     // 1M-10M: ±800
  else if (count > 100000) maxOffset = 300;      // 100k-1M: ±300
  else if (count > 10000) maxOffset = 100;       // 10k-100k: ±100
  else maxOffset = 50;                           // <10k: ±50

  // Return random offset between -maxOffset and +maxOffset
  return Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;
};

export default function LiveCount() {
  const { platform, username } = useParams();
  const [creator, setCreator] = useState(null);
  const [baseCount, setBaseCount] = useState(null);
  const [estimatedCount, setEstimatedCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const config = platformConfig[platform] || platformConfig.youtube;
  const Icon = config.icon;
  const intervalRef = useRef(null);

  // Fetch creator data
  useEffect(() => {
    const fetchCreator = async () => {
      setLoading(true);
      setError(null);

      try {
        let data = null;
        if (platform === 'youtube') {
          data = await getYouTubeChannel(username);
        } else if (platform === 'twitch') {
          data = await getTwitchChannel(username);
        } else if (platform === 'kick') {
          data = await getKickChannel(username);
        } else if (platform === 'music') {
          const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const dbCreator = await getCreatorByUsername('music', username);
          if (dbCreator?.platform_id) {
            data = MBID_RE.test(dbCreator.platform_id)
              ? await getArtistByMbid(dbCreator.platform_id)
              : await getArtistByName(dbCreator.display_name || username);
          }
        }

        if (data) {
          setCreator(data);
          const count = data.subscribers || data.followers || 0;
          setBaseCount(count);
          
          // Track live count view
          analytics.viewLiveCount(platform, username, data.displayName, count);
          
          // Check localStorage for previous count to make refresh more realistic
          const storageKey = `livecount_${platform}_${username}`;
          const stored = localStorage.getItem(storageKey);
          
          if (stored) {
            try {
              const { count: lastCount, timestamp } = JSON.parse(stored);
              const now = Date.now();
              const hoursSince = (now - timestamp) / (1000 * 60 * 60);
              
              // If data is less than 24 hours old, calculate estimated growth
              if (hoursSince < 24) {
                // Calculate growth multiplier based on subscriber count
                let growthMultiplier = 1;
                if (count > 100000000) growthMultiplier = 3;
                else if (count > 50000000) growthMultiplier = 2.5;
                else if (count > 10000000) growthMultiplier = 2;
                else if (count > 1000000) growthMultiplier = 1.5;
                else if (count > 100000) growthMultiplier = 1;
                else growthMultiplier = 0.5;
                
                const baseGrowthPerSecond = config.avgGrowthPerSecond * growthMultiplier;
                const secondsSince = hoursSince * 3600;
                const estimatedGrowth = Math.round(baseGrowthPerSecond * secondsSince);
                
                // Start from last known count plus estimated growth, but don't exceed API count + reasonable buffer
                const estimatedStart = Math.min(
                  lastCount + estimatedGrowth,
                  count + (baseGrowthPerSecond * 3600) // Max 1 hour ahead of API
                );
                
                setEstimatedCount(Math.max(count, estimatedStart));
              } else {
                // Add random offset for fresh start
                const randomOffset = getRandomOffset(count);
                setEstimatedCount(count + randomOffset);
              }
            } catch (e) {
              const randomOffset = getRandomOffset(count);
              setEstimatedCount(count + randomOffset);
            }
          } else {
            // Add random offset for first-time load
            const randomOffset = getRandomOffset(count);
            setEstimatedCount(count + randomOffset);
          }
        } else {
          setError('Creator not found');
        }
      } catch (err) {
        logger.error('Fetch error:', err);
        setError(err.message || 'Failed to load creator');
      } finally {
        setLoading(false);
      }
    };

    fetchCreator();
  }, [platform, username, config.avgGrowthPerSecond]);

  // Simulate live count changes
  useEffect(() => {
    if (!baseCount || !creator) return;

    const subscribers = baseCount;
    let growthMultiplier = 1;

    // Larger channels grow faster
    if (subscribers > 100000000) growthMultiplier = 3;
    else if (subscribers > 50000000) growthMultiplier = 2.5;
    else if (subscribers > 10000000) growthMultiplier = 2;
    else if (subscribers > 1000000) growthMultiplier = 1.5;
    else if (subscribers > 100000) growthMultiplier = 1;
    else growthMultiplier = 0.5;

    const baseGrowthPerSecond = config.avgGrowthPerSecond * growthMultiplier;

    const updateInterval = () => {
      const interval = 100 + Math.random() * 400;

      intervalRef.current = setTimeout(() => {
        setEstimatedCount(prev => {
          // Random change: mostly positive, occasionally negative
          const direction = Math.random() > 0.15 ? 1 : -1;
          // Increase multiplier for larger, more realistic changes
          const magnitudeMultiplier = subscribers > 10000000 ? 100 : subscribers > 1000000 ? 50 : 10;
          const magnitude = Math.random() * baseGrowthPerSecond * (interval / 1000) * magnitudeMultiplier;
          const change = Math.round(direction * magnitude);
          
          const newCount = Math.max(0, prev + change);
          
          // Save to localStorage on each update
          const storageKey = `livecount_${platform}_${username}`;
          localStorage.setItem(storageKey, JSON.stringify({
            count: newCount,
            timestamp: Date.now()
          }));

          return newCount;
        });

        updateInterval();
      }, interval);
    };

    updateInterval();

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [baseCount, creator, config.avgGrowthPerSecond]);

  const handleShare = async () => {
    const url = window.location.href;
    const text = `${creator?.displayName || username}'s live ${config.label} count`;

    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        analytics.share(platform, username, creator?.displayName, 'native');
      } catch (e) {
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
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black flex items-center justify-center">
        <SEO title="Loading..." />
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-300 text-lg">Loading live count...</p>
        </div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black flex items-center justify-center px-4">
        <SEO title="Creator Not Found" noindex />
        <div className="text-center">
          <AlertCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-3">Creator Not Found</h2>
          <p className="text-gray-300 mb-6 text-lg">{error || `Could not find @${username} on ${platform}`}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl transition-colors"
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
        description={`Watch ${creator.displayName}'s ${platform} ${config.label} count update in real-time. Estimated live counter.`}
      />

      <div className="relative min-h-screen bg-black flex flex-col overflow-hidden">
        {/* Background neon glow blobs — drift slowly behind everything */}
        <div
          className="absolute -top-32 -left-32 w-[40rem] h-[40rem] rounded-full blur-[120px] opacity-40 animate-pulse"
          style={{ backgroundColor: config.neonAccent }}
        />
        <div
          className="absolute -bottom-40 -right-32 w-[36rem] h-[36rem] rounded-full blur-[120px] opacity-25"
          style={{ backgroundColor: config.neonAccent, animationDelay: '1.5s' }}
        />
        {/* Subtle scan lines for that broadcast-overlay feel */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 3px)' }}
        />
        {/* Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />

        {/* Main Content */}
        <div className="relative flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
          <div className="text-center w-full max-w-4xl">

            {/* Live Indicator — bigger, glowing */}
            <div className="inline-flex items-center gap-3 mb-6 sm:mb-8 px-4 py-1.5 rounded-full border-2 border-red-500/50 bg-red-500/10 backdrop-blur-sm" style={{ boxShadow: '0 0 24px rgba(239,68,68,0.4)' }}>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-red-300 font-black text-sm sm:text-base uppercase tracking-[0.3em]">On Air</span>
            </div>

            {/* Creator Info */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-12">
              <div
                className="rounded-2xl sm:rounded-3xl"
                style={{ boxShadow: config.neonGlow }}
              >
                <CreatorAvatar
                  src={creator.profileImage}
                  name={creator.displayName}
                  size="3xl"
                  rounded="rounded-2xl sm:rounded-3xl"
                  loading="eager"
                  className="!w-24 !h-24 sm:!w-28 sm:!h-28 md:!w-32 md:!h-32 border-4"
                />
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">{creator.displayName}</h1>
                <p className="text-gray-300 text-base sm:text-lg mb-3">@{creator.username || username}</p>
                <a
                  href={platformUrls[platform]?.(creator.username || username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r ${config.bgGradient} text-white shadow-lg ${config.glowColor} hover:opacity-90 transition-opacity`}
                >
                  <Icon className="w-4 h-4" />
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </a>
              </div>
            </div>

            {/* The Big Counter — heavy neon text-shadow */}
            <div className="mb-10 sm:mb-14">
              <div
                className={`text-5xl sm:text-6xl md:text-8xl lg:text-9xl xl:text-[10rem] font-black ${config.color} tracking-tighter leading-none`}
                style={{ textShadow: config.neonGlow, fontVariantNumeric: 'tabular-nums' }}
              >
                {estimatedCount !== null && (
                  <Odometer value={estimatedCount} duration={300} />
                )}
              </div>
              <p
                className="text-lg sm:text-xl md:text-2xl text-gray-400 mt-5 font-bold uppercase tracking-[0.3em]"
                style={{ textShadow: `0 0 12px ${config.neonAccent}40` }}
              >
                {config.label}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-gray-900/80 hover:bg-gray-800 backdrop-blur-sm text-white font-medium rounded-xl transition-colors border border-gray-700"
              >
                <Share2 className="w-5 h-5" />
                Share
              </button>
              <Link
                to={`/${platform}/${username}`}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-gray-900/80 hover:bg-gray-800 backdrop-blur-sm text-white font-medium rounded-xl transition-colors border border-gray-700"
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
