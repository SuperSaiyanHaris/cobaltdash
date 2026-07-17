import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon, Youtube, Twitch, User, AlertCircle, ArrowRight, Clock, CheckCircle, X, ChevronDown } from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import { CreatorRowSkeleton } from '../components/Skeleton';
import FunErrorState from '../components/FunErrorState';
import { searchChannels as searchYouTube } from '../services/youtubeService';
import { searchChannels as searchTwitch } from '../services/twitchService';
import { searchChannels as searchKick } from '../services/kickService';
import { searchBluesky } from '../services/blueskyService';
import { searchArtists as searchMusic } from '../services/musicService';
import { Music } from 'lucide-react';
import { upsertCreator, saveCreatorStats, searchCreators } from '../services/creatorService';
import CreatorAvatar from '../components/CreatorAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import { analytics } from '../lib/analytics';
import { formatNumber } from '../lib/utils';
import logger from '../lib/logger';

const platformIcons = {
  youtube: Youtube,
  tiktok: TikTokIcon,
  twitch: Twitch,
  kick: KickIcon,
  bluesky: BlueskyIcon,
  music: Music,
  mastodon: MastodonIcon,
  rumble: RumbleIcon,
  substack: SubstackIcon,
};

// Platform identity is the icon tint alone — precision system
const platformTint = {
  youtube: 'text-red-500',
  tiktok: 'text-pink-500',
  twitch: 'text-purple-500',
  kick: 'text-green-600',
  bluesky: 'text-sky-500',
  music: 'text-amber-500',
  mastodon: 'text-violet-500',
  rumble: 'text-lime-600',
  substack: 'text-orange-500',
  instagram: 'text-pink-500',
};

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

const platforms = [
  { id: 'youtube', name: 'YouTube', icon: Youtube, available: true },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, available: true },
  { id: 'twitch', name: 'Twitch', icon: Twitch, available: true },
  { id: 'kick', name: 'Kick', icon: KickIcon, available: true },
  { id: 'bluesky', name: 'Bluesky', icon: BlueskyIcon, available: true },
  { id: 'music', name: 'Music', icon: Music, available: true },
  { id: 'mastodon', name: 'Mastodon', icon: MastodonIcon, available: true },
  { id: 'rumble', name: 'Rumble', icon: RumbleIcon, available: true },
  { id: 'substack', name: 'Substack', icon: SubstackIcon, available: true },
];

const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'most', label: 'Most followers' },
  { id: 'fewest', label: 'Fewest followers' },
  { id: 'az', label: 'A to Z' },
];

const RANGE_OPTIONS = [
  { id: 'any', label: 'Any size', min: 0, max: Infinity },
  { id: 'under100k', label: 'Under 100K', min: 0, max: 100_000 },
  { id: '100k-1m', label: '100K – 1M', min: 100_000, max: 1_000_000 },
  { id: '1m-10m', label: '1M – 10M', min: 1_000_000, max: 10_000_000 },
  { id: '10mplus', label: '10M+', min: 10_000_000, max: Infinity },
];

// Small bordered dropdown shared by the sort + range controls. Same open/close
// pattern as the Rankings "Top Count" / "Browse by category" dropdowns.
function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) || options[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3.5 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
      >
        <span className="text-neutral-400">{label}:</span> {current.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 sm:left-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-lg shadow-xl z-40 min-w-[170px] py-1">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                  o.id === value ? 'text-neutral-900 font-medium bg-neutral-50' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Relevance + popularity score for sorting search results.
// Ensures big creators who "contain" the query beat tiny channels that "start with" it.
// Normalizes away spaces/underscores/dashes so "nick mercs" matches "NICKMERCS",
// "peanut butter gamer" matches "peanutbuttergamer", etc.
function searchScore(creator, query) {
  const q = query.toLowerCase();
  const qn = q.replace(/[\s_\-]/g, '');
  const uname = (creator.username || '').toLowerCase();
  const dname = (creator.displayName || '').toLowerCase();
  const unamen = uname.replace(/[\s_\-]/g, '');
  const dnamen = dname.replace(/[\s_\-]/g, '');
  const count = creator.subscribers || creator.followers || 0;
  let bonus = 0;
  if (uname === q || dname === q || unamen === qn || dnamen === qn) {
    bonus = 1_000_000_000;
  } else if (uname.startsWith(q) || dname.startsWith(q) || unamen.startsWith(qn) || dnamen.startsWith(qn)) {
    bonus = 1_000_000;
  } else if (uname.includes(q) || dname.includes(q) || unamen.includes(qn) || dnamen.includes(qn)) {
    bonus = 1_000;
  }
  return bonus + count;
}

// TikTok search function - searches database
async function searchTikTok(query, limit = 25) {
  const results = await searchCreators(query, 'tiktok');

  const withStats = await Promise.all(
    results.map(async (creator) => {
      const { data: stats } = await supabase
        .from('creator_stats')
        .select('followers, total_views, total_posts')
        .eq('creator_id', creator.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        platform: 'tiktok',
        platformId: creator.platform_id,
        username: creator.username,
        displayName: creator.display_name || creator.username,
        profileImage: creator.profile_image,
        description: creator.description,
        followers: stats?.followers || 0,
        totalLikes: stats?.total_views || 0,
        totalPosts: stats?.total_posts || 0,
      };
    })
  );

  return withStats.slice(0, limit);
}

// Twitch DB search - supplements the live Twitch API results with creators we
// already track. Twitch's own search ranks by recent activity, so a big channel
// that hasn't streamed in a while (e.g. TheBurntPeanut) can be missing from the
// first 25 results even though they have 2M followers.
async function searchTwitchFromDB(query) {
  const results = await searchCreators(query, 'twitch');

  const withStats = await Promise.all(
    results.map(async (creator) => {
      const { data: stats } = await supabase
        .from('creator_stats')
        .select('subscribers')
        .eq('creator_id', creator.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        platform: 'twitch',
        platformId: creator.platform_id,
        username: creator.username,
        displayName: creator.display_name || creator.username,
        profileImage: creator.profile_image,
        description: creator.description,
        followers: stats?.subscribers || 0,
      };
    })
  );

  return withStats;
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const validPlatforms = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];
  const initialPlatform = validPlatforms.includes(searchParams.get('platform')) ? searchParams.get('platform') : 'youtube';
  const [selectedPlatform, setSelectedPlatform] = useState(initialPlatform);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [requestStatus, setRequestStatus] = useState(null); // null, 'requesting', 'success', 'error'
  const [requestMessage, setRequestMessage] = useState('');
  const [normalizedUsername, setNormalizedUsername] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [rangeFilter, setRangeFilter] = useState('any');
  const { user } = useAuth();

  // Normalize a display name / search query to a likely TikTok username
  const normalizeToUsername = (input) => {
    return input
      .trim()
      .toLowerCase()
      .replace(/^@/, '')             // strip leading @
      .replace(/[^a-z0-9._]/g, '')   // remove everything except allowed chars
      .replace(/^\.+|\.+$/g, '')     // trim leading/trailing dots
      .slice(0, 30);                 // max 30 chars
  };

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams, selectedPlatform]);

  const handlePlatformChange = (platformId) => {
    setSelectedPlatform(platformId);
    setResults([]);
    setSearched(false);
    // Clear request status when switching platforms
    setRequestStatus(null);
    setRequestMessage('');
    // A follower-size bucket that made sense for the last platform (e.g.
    // "10M+" on YouTube) can be misleading on a much smaller platform.
    setSortBy('relevance');
    setRangeFilter('any');
    // Always write platform to URL so back-button restores it correctly
    const q = query.trim() || searchParams.get('q') || '';
    const newParams = { platform: platformId };
    if (q) newParams.q = q;
    setSearchParams(newParams);
  };

  const performSearch = async (searchQuery, platform = selectedPlatform) => {
    if (!searchQuery.trim()) return;

    // Track search
    analytics.search(searchQuery);

    setLoading(true);
    setError(null);
    setSearched(true);
    // Clear request status when searching for a new creator
    setRequestStatus(null);
    setRequestMessage('');

    try {
      let channels = [];
      if (platform === 'youtube') {
        channels = await searchYouTube(searchQuery, 25);
        if (channels.length > 0) {
          void persistSearchResults(channels);
        }
      } else if (platform === 'tiktok') {
        // Search TikTok creators from database
        channels = await searchTikTok(searchQuery, 25);
      } else if (platform === 'twitch') {
        // Fetch Twitch API results and our DB in parallel, then merge.
        // The Twitch API sorts by recent activity — big channels that haven't
        // streamed lately can be missing from the first 25 results entirely.
        const [apiResults, dbResults] = await Promise.all([
          searchTwitch(searchQuery, 25),
          searchTwitchFromDB(searchQuery),
        ]);
        const seen = new Set();
        channels = [];
        for (const c of [...apiResults, ...dbResults]) {
          const key = (c.username || '').toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            channels.push(c);
          }
        }
        if (channels.length > 0) {
          void persistSearchResults(channels);
        }
      } else if (platform === 'kick') {
        channels = await searchKick(searchQuery, 25);
        if (channels.length > 0) {
          void persistSearchResults(channels);
        }
      } else if (platform === 'bluesky') {
        channels = await searchBluesky(searchQuery, 25);
        if (channels.length > 0) {
          void persistSearchResults(channels);
        }
      } else if (platform === 'music') {
        channels = await searchMusic(searchQuery, 25);
        if (channels.length > 0) {
          void persistSearchResults(channels);
        }
      } else if (platform === 'mastodon' || platform === 'rumble' || platform === 'substack') {
        // All DB-first (live Mastodon federated search requires auth,
        // Rumble is Cloudflare-blocked from our IPs). The fuzzy search RPC
        // returns rows from the `creators` table only — it doesn't include
        // follower counts (those live in `creator_stats`). Hydrate each
        // result with its latest stats row so the result cards show real
        // follower numbers instead of 0.
        const rows = await searchCreators(searchQuery, platform);
        channels = await Promise.all(
          (rows || []).map(async (c) => {
            const { data: stats } = await supabase
              .from('creator_stats')
              .select('followers, total_posts')
              .eq('creator_id', c.id)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            return {
              platform,
              platformId: c.platform_id,
              username: c.username,
              displayName: c.display_name,
              profileImage: c.profile_image,
              description: c.description,
              // Both platforms measure followers, not subscribers. Populate
              // both fields so the result-card renderer works regardless of
              // which key it reads.
              followers: stats?.followers || 0,
              subscribers: stats?.followers || 0,
              totalPosts: stats?.total_posts || 0,
            };
          })
        );
      }
      channels.sort((a, b) => searchScore(b, searchQuery) - searchScore(a, searchQuery));
      setResults(channels.slice(0, 25));
      // Pre-fill normalized username for TikTok request flow
      if (platform === 'tiktok') {
        setNormalizedUsername(normalizeToUsername(searchQuery));
      } else if (platform === 'rumble' || platform === 'mastodon' || platform === 'substack') {
        // DB-only platforms: keep the raw query (case-sensitive handles / URLs)
        // so the creator can paste their exact handle or link to self-add.
        setNormalizedUsername(searchQuery.trim());
      }
    } catch (err) {
      logger.error('Search error:', err);
      setError(err.message || 'Failed to search. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim(), platform: selectedPlatform });
    }
  };

  const persistSearchResults = async (channels) => {
    for (const channel of channels) {
      try {
        const dbCreator = await upsertCreator(channel);
        await saveCreatorStats(dbCreator.id, {
          subscribers: channel.subscribers || channel.followers,
          totalViews: channel.totalViews,
          totalPosts: channel.totalPosts,
        });
      } catch (dbErr) {
        logger.warn('Failed to persist creator:', dbErr);
      }
    }
  };

  const handleRequestCreator = async (usernameOverride) => {
    const username = usernameOverride || normalizedUsername;
    if (!username) return;

    setRequestStatus('requesting');
    setRequestMessage('');

    try {
      const response = await fetch('/api/request-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          username,
          userId: user?.id || null,
        }),
      });

      const data = await response.json();

      if (data.success || data.exists) {
        setRequestStatus('success');
        setRequestMessage(data.message);
        // Track request event
        analytics.event('request_creator', {
          platform: selectedPlatform,
          username: query.trim(),
        });
      } else {
        setRequestStatus('error');
        setRequestMessage(data.error || 'Failed to submit request');
      }
    } catch (err) {
      logger.error('Request creator error:', err);
      setRequestStatus('error');
      setRequestMessage('Failed to submit request. Please try again.');
    }
  };

  const currentPlatform = platforms.find(p => p.id === selectedPlatform);

  const selectedRange = RANGE_OPTIONS.find((r) => r.id === rangeFilter) || RANGE_OPTIONS[0];
  const filteredResults = results.filter((c) => {
    const count = c.subscribers || c.followers || 0;
    return count >= selectedRange.min && count <= selectedRange.max;
  });
  const displayedResults = [...filteredResults].sort((a, b) => {
    const aCount = a.subscribers || a.followers || 0;
    const bCount = b.subscribers || b.followers || 0;
    if (sortBy === 'most') return bCount - aCount;
    if (sortBy === 'fewest') return aCount - bCount;
    if (sortBy === 'az') return (a.displayName || '').localeCompare(b.displayName || '');
    return 0; // relevance: results are already scored/ordered from the search itself
  });

  return (
    <>
      <SEO
        title="Search Creators"
        description="Search for any YouTube, TikTok, Twitch, Kick, Bluesky, or music artist to view their subscriber count, follower growth, stream history, and full analytics."
        keywords="search youtube channels, search tiktok creators, find twitch streamers, kick channel stats, bluesky analytics, creator subscriber count"
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <p className={`${MICRO} mb-3`}>Search</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Search Creators</h1>
            <p className="mt-2 text-sm text-neutral-500">Find any creator and view their detailed statistics</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Platform Tabs */}
          <div className="flex flex-wrap gap-1.5 mb-6 justify-center">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              const isSelected = selectedPlatform === platform.id;

              return (
                <button
                  key={platform.id}
                  onClick={() => platform.available && handlePlatformChange(platform.id)}
                  disabled={!platform.available}
                  className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-medium transition-colors border ${
                    isSelected
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : platform.available
                      ? 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                      : 'bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {Icon && <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : platformTint[platform.id]}`} />}
                  <span className="whitespace-nowrap">{platform.name}</span>
                  {!platform.available && <span className="text-xs opacity-75">(Soon)</span>}
                </button>
              );
            })}
          </div>

          {/* Search Form */}
          <form onSubmit={handleSubmit} className="mb-10 max-w-2xl mx-auto">
            <div className="space-y-3">
              <div className="relative flex items-center bg-white rounded-xl border border-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-neutral-400 transition-colors">
                <SearchIcon className="absolute left-4 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${currentPlatform?.name || ''} creators...`}
                  className="w-full pl-11 pr-11 py-3.5 bg-transparent text-neutral-900 placeholder-neutral-400 focus:outline-none text-base rounded-xl"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto sm:min-w-[200px] sm:mx-auto sm:block px-8 py-3 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          {/* Error State - Fun Version */}
          {error && (
            <FunErrorState
              type={error.includes('fetch') ? 'server' : 'network'}
              message={error}
              onRetry={() => window.location.reload()}
              retryText="Reload Page"
            />
          )}

          {/* Loading State */}
          {loading && (
            <div className="space-y-3">
              <div className="text-center mb-6">
                <p className="text-sm text-neutral-500">Searching {currentPlatform?.name}...</p>
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <CreatorRowSkeleton key={i} />
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && searched && !error && results.length === 0 && (
            <div className={`text-center py-14 ${CARD}`}>
              <User className="w-6 h-6 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-base font-medium text-neutral-900 mb-1">No creators found</h3>
              <p className="text-sm text-neutral-500 mb-4">
                We couldn't find any {currentPlatform?.name} creators matching "{query}"
              </p>

              {/* TikTok: Request Creator Button */}
              {selectedPlatform === 'tiktok' && (
                <>
                  {requestStatus === null && (
                    <div className="mt-6 max-w-md mx-auto px-4">
                      <p className="text-sm text-neutral-500 mb-3">
                        If you know the exact handle, enter it below. Otherwise leave as-is and our smart search will find the right match.
                      </p>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-neutral-400 text-base font-medium">@</span>
                        <input
                          type="text"
                          value={normalizedUsername}
                          onChange={(e) => setNormalizedUsername(normalizeToUsername(e.target.value))}
                          placeholder="e.g. charlidamelio"
                          className="flex-1 px-3.5 py-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 text-sm transition-colors"
                        />
                      </div>
                      <button
                        onClick={() => handleRequestCreator()}
                        disabled={!normalizedUsername}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-neutral-900 hover:bg-neutral-800"
                      >
                        <Clock className="w-4 h-4" />
                        Request @{normalizedUsername || '...'}
                      </button>
                      <p className="text-xs text-neutral-400 mt-3">
                        We'll add them within 24 hours
                      </p>
                    </div>
                  )}

                  {requestStatus === 'requesting' && (
                    <div className="mt-6 max-w-md mx-auto p-4 border border-neutral-200 rounded-lg">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-neutral-500">Submitting request...</p>
                    </div>
                  )}

                  {requestStatus === 'success' && (
                    <div className="mt-6 max-w-md mx-auto p-4 border border-emerald-200 bg-emerald-50/50 rounded-lg">
                      <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                      <p className="text-sm text-emerald-700 font-medium mb-1">Request Submitted!</p>
                      <p className="text-sm text-emerald-600">{requestMessage}</p>
                    </div>
                  )}

                  {requestStatus === 'error' && (
                    <div className="mt-6 max-w-md mx-auto p-4 border border-red-200 bg-red-50/50 rounded-lg">
                      <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                      <p className="text-sm text-red-700 font-medium mb-1">Request Failed</p>
                      <p className="text-sm text-red-600">{requestMessage}</p>
                      <button
                        onClick={() => handleRequestCreator()}
                        className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium underline"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* DB-only platforms (no live search): let the creator add themselves.
                  Queued and processed off-platform by GitHub Actions. */}
              {['rumble', 'mastodon', 'substack'].includes(selectedPlatform) && (() => {
                const cfg = {
                  rumble:   { noun: 'Rumble channel',   placeholder: 'rumble.com/user/YourName  or  YourName' },
                  mastodon: { noun: 'Mastodon account', placeholder: 'yourname@mastodon.social' },
                  substack: { noun: 'Substack',         placeholder: 'yourname.substack.com' },
                }[selectedPlatform];
                return (
                  <>
                    {requestStatus === null && (
                      <div className="mt-6 max-w-md mx-auto px-4">
                        <p className="text-sm text-neutral-500 mb-3">
                          Run this {cfg.noun}? Add it and we'll start tracking it. Paste your link or handle.
                        </p>
                        <input
                          type="text"
                          value={normalizedUsername}
                          onChange={(e) => setNormalizedUsername(e.target.value)}
                          placeholder={cfg.placeholder}
                          className="w-full px-3.5 py-2.5 mb-4 bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 text-sm transition-colors"
                        />
                        <button
                          onClick={() => handleRequestCreator()}
                          disabled={!normalizedUsername || normalizedUsername.trim().length < 2}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-neutral-900 hover:bg-neutral-800"
                        >
                          <Clock className="w-4 h-4" />
                          Track this {selectedPlatform === 'rumble' ? 'channel' : selectedPlatform === 'substack' ? 'newsletter' : 'account'}
                        </button>
                        <p className="text-xs text-neutral-400 mt-3">
                          We'll add it within 24 hours, then build daily stats automatically.
                        </p>
                      </div>
                    )}

                    {requestStatus === 'requesting' && (
                      <div className="mt-6 max-w-md mx-auto p-4 border border-neutral-200 rounded-lg">
                        <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-sm text-neutral-500">Submitting...</p>
                      </div>
                    )}

                    {requestStatus === 'success' && (
                      <div className="mt-6 max-w-md mx-auto p-4 border border-emerald-200 bg-emerald-50/50 rounded-lg">
                        <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                        <p className="text-sm text-emerald-700 font-medium mb-1">Got it!</p>
                        <p className="text-sm text-emerald-600">{requestMessage}</p>
                      </div>
                    )}

                    {requestStatus === 'error' && (
                      <div className="mt-6 max-w-md mx-auto p-4 border border-red-200 bg-red-50/50 rounded-lg">
                        <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                        <p className="text-sm text-red-700 font-medium mb-1">Couldn't add it</p>
                        <p className="text-sm text-red-600">{requestMessage}</p>
                        <button
                          onClick={() => handleRequestCreator()}
                          className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium underline"
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Standard platforms: Standard message */}
              {!['tiktok', 'rumble', 'mastodon', 'substack'].includes(selectedPlatform) && (
                <p className="text-sm text-neutral-400">
                  Try searching for a different name or check the spelling
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <p className={MICRO}>
                  {displayedResults.length === results.length
                    ? `${results.length} creators found`
                    : `${displayedResults.length} of ${results.length} creators`}
                </p>
                <div className="flex items-center gap-2">
                  <FilterDropdown label="Sort" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
                  <FilterDropdown label="Size" options={RANGE_OPTIONS} value={rangeFilter} onChange={setRangeFilter} />
                </div>
              </div>

              {displayedResults.length === 0 ? (
                <div className={`text-center py-10 ${CARD}`}>
                  <p className="text-sm text-neutral-500">No creators in this size range.</p>
                  <button
                    onClick={() => setRangeFilter('any')}
                    className="mt-2 text-sm text-neutral-900 font-medium hover:underline"
                  >
                    Clear size filter
                  </button>
                </div>
              ) : (
              <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
                {displayedResults.map((creator) => {
                  const Icon = platformIcons[creator.platform] || User;
                  const tint = platformTint[creator.platform] || 'text-neutral-400';

                  return (
                    <Link
                      key={creator.platformId}
                      to={`/${creator.platform}/${creator.username}`}
                      state={{ platformId: creator.platformId }}
                      className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-neutral-50 transition-colors group"
                    >
                      <CreatorAvatar
                        src={creator.profileImage}
                        name={creator.displayName}
                        size="lg"
                        rounded="rounded-lg"
                        className="!w-10 !h-10 sm:!w-11 sm:!h-11 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-neutral-900 truncate">
                          {creator.displayName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <Icon className={`w-3 h-3 flex-shrink-0 ${tint}`} />
                          <p className="text-xs text-neutral-400 truncate">@{creator.username}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-baseline gap-2">
                        <p className="text-[15px] font-semibold text-neutral-900 tabular-nums">{formatNumber(creator.subscribers || creator.followers)}</p>
                        <p className={MICRO}>
                          {creator.platform === 'twitch' || creator.platform === 'tiktok' || creator.platform === 'bluesky' || creator.platform === 'mastodon' || creator.platform === 'rumble' ? 'followers' :
                           creator.platform === 'kick' ? 'paid subs' :
                           creator.platform === 'music' ? 'listeners' : 'subscribers'}
                        </p>
                      </div>
                      <ArrowRight className="hidden sm:block w-4 h-4 text-neutral-300 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* TikTok: Request Creator (when no exact username match) */}
          {selectedPlatform === 'tiktok' && searched && results.length > 0 && query && (
            (() => {
              // Check if any result has exact username match
              const hasExactMatch = results.some(r => r.username.toLowerCase() === query.toLowerCase());

              if (!hasExactMatch) {
                return (
                  <div className={`text-center py-8 ${CARD}`}>
                    <div className="max-w-md mx-auto">
                      <p className="text-sm text-neutral-500 mb-4">
                        Can't find "@{query}"? TikTok creators are added by request.
                      </p>

                      {requestStatus === null && (
                        <>
                          <p className="text-sm text-neutral-500 mb-3">
                            If you know the exact handle, enter it below. Otherwise leave as-is and our smart search will find the right match.
                          </p>
                          <div className="flex items-center gap-2 mb-4 px-4">
                            <span className="text-neutral-400 text-base font-medium">@</span>
                            <input
                              type="text"
                              value={normalizedUsername}
                              onChange={(e) => setNormalizedUsername(normalizeToUsername(e.target.value))}
                              placeholder="e.g. charlidamelio"
                              className="flex-1 px-3.5 py-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 text-sm transition-colors"
                            />
                          </div>
                          <button
                            onClick={() => handleRequestCreator()}
                            disabled={!normalizedUsername}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-neutral-900 hover:bg-neutral-800"
                          >
                            <Clock className="w-4 h-4" />
                            Request @{normalizedUsername || '...'}
                          </button>
                          <p className="text-xs text-neutral-400 mt-3">
                            We'll add them within 24 hours
                          </p>
                        </>
                      )}

                      {requestStatus === 'requesting' && (
                        <div className="p-4 border border-neutral-200 rounded-lg">
                          <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          <p className="text-sm text-neutral-500">Submitting request...</p>
                        </div>
                      )}

                      {requestStatus === 'success' && (
                        <div className="p-4 border border-emerald-200 bg-emerald-50/50 rounded-lg">
                          <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                          <p className="text-sm text-emerald-700 font-medium mb-1">Request Submitted!</p>
                          <p className="text-sm text-emerald-600">{requestMessage}</p>
                        </div>
                      )}

                      {requestStatus === 'error' && (
                        <div className="p-4 border border-red-200 bg-red-50/50 rounded-lg">
                          <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                          <p className="text-sm text-red-700 font-medium mb-1">Request Failed</p>
                          <p className="text-sm text-red-600">{requestMessage}</p>
                          <button
                            onClick={() => handleRequestCreator()}
                            className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium underline"
                          >
                            Try Again
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()
          )}
        </div>
      </div>
    </>
  );
}

