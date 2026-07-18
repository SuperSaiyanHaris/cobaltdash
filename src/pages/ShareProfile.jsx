import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Youtube, Twitch, TrendingUp, TrendingDown } from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import CreatorAvatar from '../components/CreatorAvatar';
import { getCreatorByUsername, getCreatorStats } from '../services/creatorService';
import { formatNumber } from '../lib/utils';

const platformIcons = {
  youtube: Youtube,
  twitch: Twitch,
  kick: KickIcon,
  tiktok: TikTokIcon,
  bluesky: BlueskyIcon,
  mastodon: MastodonIcon,
  rumble: RumbleIcon,
  substack: SubstackIcon,
};

const platformColors = {
  youtube:  { bg: 'bg-red-600',    chart: '#ef4444' },
  twitch:   { bg: 'bg-purple-600', chart: '#a855f7' },
  kick:     { bg: 'bg-green-600',  chart: '#22c55e' },
  tiktok:   { bg: 'bg-pink-600',   chart: '#ec4899' },
  bluesky:  { bg: 'bg-sky-500',    chart: '#0ea5e9' },
  mastodon: { bg: 'bg-violet-600', chart: '#7c3aed' },
  rumble:   { bg: 'bg-lime-600',   chart: '#65a30d' },
  substack: { bg: 'bg-orange-600', chart: '#ea580c' },
};

const platformConfig = {
  youtube:  { primary: 'Subscribers',  secondary: (s) => s.total_views  ? { label: 'Total Views',  value: s.total_views  } : null },
  twitch:   { primary: 'Followers',    secondary: null },
  kick:     { primary: 'Paid Subs',    secondary: null },
  tiktok:   { primary: 'Followers',    secondary: (s) => s.total_views  ? { label: 'Total Likes',  value: s.total_views  } : null },
  bluesky:  { primary: 'Followers',    secondary: (s) => s.total_posts  ? { label: 'Posts',        value: s.total_posts  } : null },
  mastodon: { primary: 'Followers',    secondary: (s) => s.total_posts  ? { label: 'Posts',        value: s.total_posts  } : null },
  rumble:   { primary: 'Followers',    secondary: (s) => s.total_posts  ? { label: 'Videos',       value: s.total_posts  } : null },
  substack: { primary: 'Subscribers',  secondary: null },
};

export default function ShareProfile() {
  const { platform, username } = useParams();
  const [creator, setCreator] = useState(null);
  const [statsHistory, setStatsHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [platform, username]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const dbCreator = await getCreatorByUsername(platform, username);
      if (!dbCreator) { setError('not found'); return; }
      const stats = await getCreatorStats(dbCreator.id, 30);
      setCreator(dbCreator);
      setStatsHistory(stats || []);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  };

  const Icon = platformIcons[platform];
  const colors = platformColors[platform] || platformColors.youtube;
  const config = platformConfig[platform] || platformConfig.bluesky;

  const sorted = [...statsHistory].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  const latest = sorted[sorted.length - 1];
  const earliest = sorted[0];

  const latestCount = latest ? (latest.subscribers || latest.followers || 0) : 0;
  const earliestCount = earliest ? (earliest.subscribers || earliest.followers || 0) : 0;
  const growth30d = sorted.length > 1 ? latestCount - earliestCount : null;
  const growthPct = growth30d !== null && earliestCount > 0
    ? ((growth30d / earliestCount) * 100).toFixed(1)
    : null;

  const secondary = latest && config.secondary ? config.secondary(latest) : null;

  const chartData = sorted.map(s => ({
    date: new Date(s.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: s.subscribers || s.followers || 0,
  }));

  const trackingSince = creator?.created_at
    ? new Date(creator.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <SEO title="Loading..." />
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <SEO title="Creator Not Found" noindex />
        <p className="text-neutral-500">Creator not found.</p>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`${creator.display_name} - ${platform} Stats`}
        description={`${creator.display_name}'s ${platform} stats. ${formatNumber(latestCount)} ${config.primary.toLowerCase()}${growth30d !== null ? `, ${growth30d >= 0 ? '+' : ''}${formatNumber(growth30d)} in the last 30 days` : ''}.`}
      />

      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white border border-neutral-200/80 rounded-xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
            {/* Platform accent bar */}
            <div className={`h-1 ${colors.bg}`} />

            <div className="p-6 sm:p-8">
              {/* Profile header */}
              <div className="flex items-center gap-4 mb-7">
                <CreatorAvatar
                  src={creator.profile_image}
                  name={creator.display_name}
                  size="xl"
                  rounded="rounded-2xl"
                  className="!w-16 !h-16 sm:!w-20 sm:!h-20 border-2 border-neutral-300"
                />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 truncate">{creator.display_name}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-neutral-500">@{creator.username}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors.bg} text-white`}>
                      {Icon && <Icon className="w-3 h-3" />}
                      {platform}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats strip — one bordered container, hairline-divided cells */}
              <div className={`grid ${secondary ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-neutral-200/80 border border-neutral-200/80 rounded-lg mb-6`}>
                {/* Primary */}
                <div className="p-3 sm:p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-1">{config.primary}</p>
                  <p className="text-xl sm:text-2xl font-semibold text-neutral-900 tabular-nums">{formatNumber(latestCount)}</p>
                </div>

                {/* 30-day growth */}
                {growth30d !== null && (
                  <div className="p-3 sm:p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-1">Last 30d</p>
                    <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${growth30d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {growth30d >= 0 ? '+' : ''}{formatNumber(growth30d)}
                    </p>
                    {growthPct !== null && (
                      <div className={`flex items-center gap-0.5 mt-1 text-xs font-medium tabular-nums ${growth30d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {growth30d >= 0
                          ? <TrendingUp className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />}
                        {growthPct}%
                      </div>
                    )}
                  </div>
                )}

                {/* Secondary (views / likes / posts) */}
                {secondary && (
                  <div className="p-3 sm:p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-1">{secondary.label}</p>
                    <p className="text-xl sm:text-2xl font-semibold text-neutral-900 tabular-nums">{formatNumber(secondary.value)}</p>
                  </div>
                )}
              </div>

              {/* Chart */}
              {chartData.length > 1 && (
                <div className="h-36 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="shareChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={colors.chart} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={colors.chart} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', color: '#404040', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        formatter={(value) => [formatNumber(value), config.primary]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={colors.chart}
                        strokeWidth={2}
                        fill="url(#shareChartGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                <p className="text-xs text-neutral-400">
                  {trackingSince ? `Tracked since ${trackingSince} · ` : ''}Powered by ShinyPull
                </p>
                <Link
                  to={`/${platform}/${username}`}
                  className="text-xs font-medium text-neutral-900 hover:text-neutral-600 transition-colors whitespace-nowrap"
                >
                  Full stats →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
