import { Link } from 'react-router-dom';
import { Youtube, Twitch, Clock, Database, RefreshCw, ShieldCheck, Music } from 'lucide-react';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';

const platforms = [
  {
    icon: Youtube,
    name: 'YouTube',
    color: 'text-red-400',
    borderColor: 'border-red-800',
    bgColor: 'bg-red-950/20',
    iconBg: 'from-red-500 to-red-600',
    shadow: 'shadow-red-500/20',
    metrics: ['Subscriber count', 'Total video views', 'Video count'],
    source: 'YouTube Data API',
    frequency: '3x daily',
    notes: [
      'YouTube rounds subscriber counts to 3 significant figures for all channels — a policy in place since 2019. A channel at 4,237,591 and one at 4,230,000 both display as 4,230,000.',
      'Because rounding makes subscriber changes invisible on large channels, ShinyPull defaults to showing view growth on YouTube profiles. Views are always precise.',
    ],
  },
  {
    icon: TikTokIcon,
    name: 'TikTok',
    color: 'text-pink-400',
    borderColor: 'border-pink-800',
    bgColor: 'bg-pink-950/20',
    iconBg: 'from-pink-500 to-pink-600',
    shadow: 'shadow-pink-500/20',
    metrics: ['Follower count', 'Total likes', 'Video count'],
    source: 'Public profile pages',
    frequency: '4x daily',
    notes: [
      'All TikTok data shown is publicly visible on creator profiles. We refresh TikTok more frequently than other platforms to keep up with faster-moving accounts.',
    ],
  },
  {
    icon: Twitch,
    name: 'Twitch',
    color: 'text-purple-400',
    borderColor: 'border-purple-800',
    bgColor: 'bg-purple-950/20',
    iconBg: 'from-purple-500 to-purple-600',
    shadow: 'shadow-purple-500/20',
    metrics: ['Follower count', 'Hours watched (daily, weekly, monthly)', 'Stream count', 'Peak and average viewers per stream'],
    source: 'Twitch API',
    frequency: 'Followers 3x daily. Streams monitored every 3 hours.',
    notes: [
      'Twitch removed total view counts in 2022. Hours watched is the replacement — the metric used by streamers, sponsors, and analytics tools across the industry.',
      'Hours watched is built from live viewer samples collected every few minutes during each stream, then rolled up into daily, weekly, and monthly totals.',
    ],
  },
  {
    icon: KickIcon,
    name: 'Kick',
    color: 'text-green-400',
    borderColor: 'border-green-800',
    bgColor: 'bg-green-950/20',
    iconBg: 'from-green-500 to-green-600',
    shadow: 'shadow-green-500/20',
    metrics: ['Paid subscriber count', 'Hours watched (daily, weekly, monthly)', 'Stream count', 'Peak and average viewers per stream'],
    source: 'Kick API',
    frequency: 'Subscribers 3x daily. Streams monitored every 3 hours.',
    notes: [
      "Kick only exposes paid subscriber counts, not free follower totals. The number on Kick profiles represents paying subscribers only, which is always smaller than the total audience.",
      'Hours watched is tracked the same way as Twitch — viewer samples taken during live streams, aggregated into daily, weekly, and monthly figures.',
    ],
  },
  {
    icon: BlueskyIcon,
    name: 'Bluesky',
    color: 'text-sky-400',
    borderColor: 'border-sky-800',
    bgColor: 'bg-sky-950/20',
    iconBg: 'from-sky-400 to-sky-600',
    shadow: 'shadow-sky-500/20',
    metrics: ['Follower count', 'Post count'],
    source: 'Bluesky public API',
    frequency: '3x daily',
    notes: [
      'Bluesky is a decentralized social network where all profile data is public by design. No private information is collected.',
      'Bluesky has no profile-level view counts, so we track followers and posts only.',
    ],
  },
  {
    icon: MastodonIcon,
    name: 'Mastodon',
    color: 'text-violet-400',
    borderColor: 'border-violet-800',
    bgColor: 'bg-violet-950/20',
    iconBg: 'from-violet-500 to-purple-600',
    shadow: 'shadow-violet-500/20',
    metrics: ['Follower count', 'Post count'],
    source: 'Mastodon ActivityPub (public)',
    frequency: '3x daily',
    notes: [
      'Mastodon is federated. Each account belongs to a specific instance (e.g. mastodon.social, hachyderm.io), and handles include the instance: user@instance.tld.',
      'We hit each instance\'s public API directly and fall back to mastodon.social federated search for less common instances. No authentication is needed.',
      'No profile-level view counts exist on Mastodon, so we track followers and posts only.',
    ],
  },
  {
    icon: RumbleIcon,
    name: 'Rumble',
    color: 'text-lime-600',
    borderColor: 'border-lime-700',
    bgColor: 'bg-lime-950/20',
    iconBg: 'from-lime-500 to-green-600',
    shadow: 'shadow-lime-500/20',
    metrics: ['Follower count', 'Video count'],
    source: 'Rumble public channel pages',
    frequency: '3x daily',
    notes: [
      'Rumble has no public API, so we scrape the public channel pages at a polite ~1 request per second.',
      'Both /c/ channels and /user/ accounts are supported. We store the kind in our internal identifier so we always hit the right URL.',
      'Channel-level total view counts are not exposed by Rumble, so we track followers and video count only.',
    ],
  },
  {
    icon: SubstackIcon,
    name: 'Substack',
    color: 'text-orange-600',
    borderColor: 'border-orange-700',
    bgColor: 'bg-orange-950/20',
    iconBg: 'from-orange-500 to-amber-600',
    shadow: 'shadow-orange-500/20',
    metrics: ['Subscriber reach', 'Category leaderboard rank'],
    source: 'Substack category leaderboards (public)',
    frequency: '3x daily',
    notes: [
      'Substack does not publish exact subscriber counts. The public category leaderboards expose an order-of-magnitude band instead (1K, 10K, 100K, 1M).',
      'Because those bands tie heavily, we rank Substack newsletters by their position across the category leaderboards rather than by the band alone.',
      'The number shown on a publication is the band floor, not an exact count.',
    ],
  },
  {
    icon: Music,
    name: 'Music',
    color: 'text-amber-400',
    borderColor: 'border-amber-800',
    bgColor: 'bg-amber-950/20',
    iconBg: 'from-amber-500 to-orange-500',
    shadow: 'shadow-amber-500/20',
    metrics: ['Monthly listeners', 'Total play count', 'Genre tags'],
    source: 'Last.fm',
    frequency: '3x daily',
    notes: [
      'Monthly listeners counts unique listeners over the past 30 days and resets each month. Total plays is a running lifetime total across all Last.fm users.',
      'Genre tags are pulled from community-curated tags on Last.fm and reflect the most commonly applied labels for each artist.',
    ],
  },
];

const principles = [
  {
    icon: ShieldCheck,
    color: 'from-indigo-500 to-indigo-600',
    shadow: 'shadow-indigo-500/30',
    title: 'No synthetic data',
    body: 'Every number in our database comes from a real API call or data collection at a specific point in time. We never estimate, interpolate, or generate historical data. If we missed a day, that day just has no data.',
  },
  {
    icon: Database,
    color: 'from-emerald-500 to-teal-500',
    shadow: 'shadow-emerald-500/30',
    title: 'Daily snapshots',
    body: 'Stats are stored as daily snapshots. Charts reflect the actual numbers at collection time. Missing days show as gaps in the chart, not zeroed-out values.',
  },
  {
    icon: RefreshCw,
    color: 'from-amber-500 to-orange-500',
    shadow: 'shadow-amber-500/30',
    title: 'Data integrity first',
    body: 'If a collection run fails or returns unexpected data, we skip it entirely rather than write a bad value. A missing day shows as a gap in the chart. A bad data point distorts everything around it.',
  },
  {
    icon: Clock,
    color: 'from-purple-500 to-purple-600',
    shadow: 'shadow-purple-500/30',
    title: 'Public data only',
    body: "All data shown on ShinyPull is publicly available. We collect the same information anyone could see by visiting a creator's profile page. We do not access private account data.",
  },
];

export default function Methodology() {
  return (
    <>
      <SEO
        title="Data Methodology"
        description="Learn how ShinyPull collects and maintains creator statistics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music (Last.fm)."
      />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-200 py-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-neutral-900 mb-4">Data Methodology</h1>
            <p className="text-xl text-neutral-500">
              How we collect, store, and maintain creator statistics.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12 space-y-14">

          {/* Core principles */}
          <section>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Our Principles</h2>
            <p className="text-neutral-500 mb-8">
              Accurate data is the whole point of this site. These are the rules we follow to keep it that way.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              {principles.map((p) => (
                <div key={p.title} className="group bg-white border border-neutral-200 rounded-2xl p-6 hover:border-neutral-300 transition-colors">
                  <div className={`w-12 h-12 bg-gradient-to-br ${p.color} rounded-xl flex items-center justify-center shadow-lg ${p.shadow} mb-4`}>
                    <p.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-neutral-900 mb-2">{p.title}</h3>
                  <p className="text-neutral-500 text-sm leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Per-platform */}
          <section>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Platform Details</h2>
            <p className="text-neutral-500 mb-8">
              Each platform works differently. Here's what we track and any limitations worth knowing about.
            </p>
            <div className="space-y-6">
              {platforms.map((p) => (
                <div key={p.name} className={`bg-white border ${p.borderColor} rounded-2xl p-6`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 bg-gradient-to-br ${p.iconBg} rounded-xl flex items-center justify-center shadow-lg ${p.shadow}`}>
                      <p.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900">{p.name}</h3>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 mb-5 text-sm">
                    <div>
                      <p className="text-neutral-400 uppercase text-xs font-semibold tracking-wider mb-1">Data Source</p>
                      <p className="text-neutral-700">{p.source}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 uppercase text-xs font-semibold tracking-wider mb-1">Update Frequency</p>
                      <p className="text-neutral-700">{p.frequency}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400 uppercase text-xs font-semibold tracking-wider mb-1">Metrics Tracked</p>
                      <ul className="text-neutral-700 space-y-0.5">
                        {p.metrics.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  </div>

                  {p.notes.length > 0 && (
                    <div className={`${p.bgColor} rounded-xl p-4 space-y-2`}>
                      {p.notes.map((note, i) => (
                        <p key={i} className="text-sm text-neutral-700 leading-relaxed">{note}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Footer CTA */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Questions about the data?</h2>
            <p className="text-neutral-500 mb-6">
              If something looks off or you want to know more, reach out.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/faq"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-semibold rounded-xl transition-colors"
              >
                Browse FAQ
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
