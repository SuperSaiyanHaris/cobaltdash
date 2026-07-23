import { Link } from 'react-router-dom';
import { Clock, Database, RefreshCw, ShieldCheck, Music } from 'lucide-react';
import YouTubeIcon from '../components/YouTubeIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import TikTokIcon from '../components/TikTokIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';
import SEO from '../components/SEO';

// Typographic backbone shared with the rest of the precision system
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';

// Per-platform cards intentionally describe WHAT we show (metrics + any caveat
// that helps a reader understand the numbers), never HOW we obtain it. Source
// is always "Publicly available" — see the hard rule in CLAUDE.md.
// Platform identity is the icon tint alone.
const platforms = [
  {
    icon: YouTubeIcon,
    name: 'YouTube',
    tint: '',
    metrics: ['Subscriber count', 'Total video views', 'Video count'],
    notes: [
      'YouTube rounds subscriber counts to 3 significant figures for all channels, a policy in place since 2019. A channel at 4,237,591 and one at 4,230,000 both display as 4,230,000. Because of this we default to showing view growth, which is always precise.',
    ],
  },
  {
    icon: TikTokIcon,
    name: 'TikTok',
    tint: 'text-pink-500',
    metrics: ['Follower count', 'Total likes', 'Video count'],
    notes: [],
  },
  {
    icon: TwitchIcon,
    name: 'Twitch',
    tint: '',
    metrics: ['Follower count', 'Hours watched (daily, weekly, monthly)', 'Peak and average viewers'],
    notes: [
      'Twitch retired total view counts in 2022, so we track hours watched, the engagement metric streamers and sponsors rely on.',
    ],
  },
  {
    icon: KickIcon,
    name: 'Kick',
    tint: 'text-green-600',
    metrics: ['Paid subscriber count', 'Hours watched (daily, weekly, monthly)', 'Peak and average viewers'],
    notes: [
      'On Kick, the publicly available number is the paid subscriber count rather than total free followers, so that is the figure we show.',
    ],
  },
  {
    icon: BlueskyIcon,
    name: 'Bluesky',
    tint: 'text-sky-500',
    metrics: ['Follower count', 'Post count'],
    notes: [
      'Bluesky has no profile-level view counts, so we track followers and posts only.',
    ],
  },
  {
    icon: MastodonIcon,
    name: 'Mastodon',
    tint: 'text-violet-500',
    metrics: ['Follower count', 'Post count'],
    notes: [
      'Mastodon is decentralized, so handles include the instance (for example, user@instance.tld). It has no profile-level view counts.',
    ],
  },
  {
    icon: RumbleIcon,
    name: 'Rumble',
    tint: 'text-lime-600',
    metrics: ['Follower count', 'Video count'],
    notes: [
      'Rumble does not make a channel-level total view count public, so we track followers and video count only.',
    ],
  },
  {
    icon: SubstackIcon,
    name: 'Substack',
    tint: 'text-orange-500',
    metrics: ['Subscriber reach'],
    notes: [
      'Substack makes subscriber counts public as approximate ranges rather than exact numbers, so the figure shown is an approximate minimum.',
    ],
  },
  {
    icon: Music,
    name: 'Music',
    tint: 'text-amber-500',
    metrics: ['Monthly listeners', 'Total play count', 'Genre tags'],
    notes: [
      'Monthly listeners counts unique listeners over the past 30 days and resets each month. Total plays is a running lifetime total.',
    ],
  },
];

const principles = [
  {
    icon: ShieldCheck,
    tint: 'text-indigo-500',
    title: 'No synthetic data',
    body: 'Every number in our database comes from real data captured at a specific point in time. We never estimate, interpolate, or generate historical data. If we missed a day, that day just has no data.',
  },
  {
    icon: Database,
    tint: 'text-emerald-600',
    title: 'Daily snapshots',
    body: 'Stats are stored as daily snapshots. Charts reflect the actual numbers at collection time. Missing days show as gaps in the chart, not zeroed-out values.',
  },
  {
    icon: RefreshCw,
    tint: 'text-amber-500',
    title: 'Data integrity first',
    body: 'If a collection run fails or returns unexpected data, we skip it entirely rather than write a bad value. A missing day shows as a gap in the chart. A bad data point distorts everything around it.',
  },
  {
    icon: Clock,
    tint: 'text-purple-500',
    title: 'Public data only',
    body: "All data shown on ShinyPull is publicly available. We collect the same information anyone could see by visiting a creator's profile page. We do not access private account data.",
  },
];

export default function Methodology() {
  return (
    <>
      <SEO
        title="Data Methodology"
        description="How ShinyPull presents publicly available creator statistics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music, with daily snapshots and real historical data."
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 py-12 sm:py-14 text-center">
            <p className={`${MICRO} mb-3`}>Methodology</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Data Methodology</h1>
            <p className="mt-2 text-sm sm:text-base text-neutral-500">
              How we present and maintain publicly available creator statistics.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12 space-y-14">

          {/* Core principles */}
          <section>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 mb-1.5">Our Principles</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Accurate data is the whole point of this site. These are the rules we follow to keep it that way.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {principles.map((p) => (
                <div key={p.title} className={`${CARD} p-6 hover:border-neutral-300 transition-colors`}>
                  <p.icon className={`w-5 h-5 ${p.tint} mb-4`} />
                  <h3 className="font-medium text-neutral-900 mb-2">{p.title}</h3>
                  <p className="text-neutral-500 text-sm leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Per-platform */}
          <section>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 mb-1.5">Platform Details</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Each platform works differently. Here's what we track and any limitations worth knowing about.
            </p>
            <div className="space-y-4">
              {platforms.map((p) => (
                <div key={p.name} className={`${CARD} p-6`}>
                  <div className="flex items-center gap-2.5 mb-4">
                    <p.icon className={`w-5 h-5 ${p.tint}`} />
                    <h3 className="text-base font-medium text-neutral-900">{p.name}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className={MICRO}>Publicly available</span>
                    </span>
                    <span className="text-neutral-300">·</span>
                    <span className={MICRO}>Updated daily</span>
                  </div>

                  <div className="mb-5">
                    <p className={`${MICRO} mb-2`}>Metrics Tracked</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.metrics.map((m) => (
                        <span key={m} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-50 border border-neutral-200/80 text-sm text-neutral-700">{m}</span>
                      ))}
                    </div>
                  </div>

                  {p.notes.length > 0 && (
                    <div className="border-l-2 border-neutral-200 pl-4 space-y-2">
                      {p.notes.map((note, i) => (
                        <p key={i} className="text-sm text-neutral-500 leading-relaxed">{note}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Footer CTA */}
          <div className={`${CARD} p-8 text-center`}>
            <h2 className="text-base font-medium text-neutral-900 mb-1.5">Questions about the data?</h2>
            <p className="text-sm text-neutral-500 mb-6">
              If something looks off or you want to know more, reach out.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link
                to="/faq"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-neutral-200 hover:border-neutral-300 text-neutral-900 text-sm font-medium rounded-lg transition-colors"
              >
                Browse FAQ
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors"
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
