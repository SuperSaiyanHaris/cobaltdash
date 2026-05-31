import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Music } from 'lucide-react';
import SEO from '../components/SEO';
import StructuredData from '../components/StructuredData';

const faqs = [
  {
    category: 'General',
    questions: [
      {
        q: 'What is ShinyPull?',
        a: 'ShinyPull tracks public statistics for content creators and artists across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music (via Last.fm). We collect subscriber counts, follower counts, listener counts, view totals, and more every day, then present the data as charts and historical trends. Think of it as a stats tracker for the creator economy.',
      },
      {
        q: 'Is ShinyPull free?',
        a: 'Yes, ShinyPull is free. Anyone can search creators, view their stats, browse rankings, and compare creators without an account. The only paid product is Featured Listings for businesses who want a sponsored slot in our rankings tables.',
      },
      {
        q: 'What is the Trending page?',
        a: 'The Trending page shows the fastest growing creators on each platform over the last 30 days. Each platform uses the metric that best reflects real growth: view count growth for YouTube (since subscriber counts are rounded by policy), follower growth for TikTok, Bluesky, Mastodon, and Rumble, hours watched growth for Twitch, paid subscriber growth for Kick, and monthly listener growth for Music.',
      },
      {
        q: 'What makes ShinyPull different from other stats trackers?',
        a: 'ShinyPull pulls data directly from official platform APIs where available. Charts are interactive, the layout is built for modern screens, and we track streaming-specific metrics like hours watched that most tools ignore.',
      },
      {
        q: 'Do I need an account to use ShinyPull?',
        a: 'No. You can browse freely without signing up. An account lets you follow creators, get a personalized dashboard, and save reports.',
      },
    ],
  },
  {
    category: 'Data',
    questions: [
      {
        q: 'How often is data updated?',
        a: 'Creator stats are collected multiple times per day. YouTube, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music (Last.fm) run on an automated schedule three times daily. TikTok profiles refresh four times daily. Stream monitoring for Twitch and Kick runs every three hours to track live viewership.',
      },
      {
        q: 'Is the data accurate?',
        a: 'We pull directly from official platform APIs and public data. One known limitation: YouTube has rounded subscriber counts to three significant figures since 2019 (so 1,234,567 would show as 1,230,000). This is a YouTube policy, not a ShinyPull issue. All other platform data is as precise as the platform provides.',
      },
      {
        q: 'Where does the data come from?',
        a: 'All data is publicly available. We use the YouTube Data API, Twitch Helix API, Kick API, Bluesky AT Protocol API, Mastodon ActivityPub API, Substack category leaderboard API, and Last.fm API for those platforms. For TikTok and Rumble, we collect publicly available profile statistics from their public pages. We never access private account information.',
      },
      {
        q: 'Why does my favorite creator not show up?',
        a: "We add creators over time. If a creator isn't in our database yet, you can request them on the search page. TikTok creator requests are processed automatically within 24 hours. For other platforms, search directly by username and their profile will be added automatically.",
      },
      {
        q: 'Can I trust the historical data?',
        a: "Yes. We store real snapshots taken at the time of collection. We don't backfill or estimate past data. If a creator was added to ShinyPull recently, their history only goes back to when we first tracked them.",
      },
    ],
  },
  {
    category: 'Platform-Specific',
    questions: [
      {
        q: "Why do YouTube subscriber changes always show as 0?",
        a: "YouTube rounds subscriber counts for all channels over 1,000 subscribers. Daily changes on large channels are smaller than the rounding threshold, so the displayed change appears as 0. The actual growth is real, it just can't be seen from subscriber counts alone. We default to showing view growth for YouTube because views are not rounded.",
      },
      {
        q: 'What does Kick show for follower counts?',
        a: "Kick's public API does not expose free follower counts. The number shown on Kick profiles is the paid subscriber count, not total followers. This is a Kick API limitation.",
      },
      {
        q: 'What are Hours Watched on Twitch and Kick?',
        a: "Hours Watched is the standard metric for streaming platforms. It's calculated from live viewership data collected every few minutes during streams, multiplied by stream duration. It shows total audience engagement better than follower counts alone.",
      },
      {
        q: 'What does Bluesky track?',
        a: 'We track follower count and post count for Bluesky accounts. Bluesky does not have profile-level view counts, so we only show the metrics the platform provides.',
      },
      {
        q: 'What does Mastodon track?',
        a: 'We track follower count and post count for Mastodon accounts across the federation. Mastodon is decentralized, so handles include the instance (e.g. user@mastodon.social). We support the major instances and federate through mastodon.social for everything else. Mastodon has no profile-level view counts.',
      },
      {
        q: 'What does Rumble track?',
        a: 'We track follower count and video count for Rumble channels. Rumble has no public API, so we scrape the public channel pages at a polite rate (~1 request per second). We support both /c/ channel pages and /user/ accounts. Per-video view totals are not aggregated at the channel level so we do not track total views (yet).',
      },
      {
        q: 'What does Substack track?',
        a: 'We track subscriber reach for Substack newsletters. Substack does not publish exact subscriber numbers, so we use the order-of-magnitude band it shows on its category leaderboards (1K, 10K, 100K, 1M). Because those bands tie heavily, our Substack rankings are ordered by each publication\'s position across the category leaderboards, not by the band alone. The displayed number is the band floor.',
      },
      {
        q: 'What does Music track?',
        a: 'The Music platform is powered by Last.fm data. We track monthly listeners (how many unique listeners an artist had in the last 30 days) and total play count (cumulative scrobbles across all Last.fm users). Artist genre tags are also shown. Last.fm deprecated artist profile images in 2019, so we show a fallback icon instead.',
      },
    ],
  },
  {
    category: 'Account',
    questions: [
      {
        q: 'How do I add a creator to ShinyPull?',
        a: 'Search for the creator by username on our search page. For YouTube, Twitch, Kick, Bluesky, Mastodon, and Rumble, the profile is fetched and added automatically when you search. For TikTok, you can submit a request if no result is found, and it will be processed within 24 hours.',
      },
      {
        q: 'How do I follow a creator?',
        a: 'Click the Follow button on any creator profile page. Free accounts can follow up to 5 creators. Paid plans raise that limit.',
      },
      {
        q: 'I found incorrect data. How do I report it?',
        a: (
          <>
            Use the <Link to="/contact" className="text-indigo-400 hover:text-indigo-300">contact form</Link> or email us at{' '}
            <a href="mailto:shinypull@proton.me" className="text-indigo-400 hover:text-indigo-300">shinypull@proton.me</a>.
            Let us know the creator name, platform, and what looks wrong.
          </>
        ),
      },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-white hover:bg-neutral-50 transition-colors"
      >
        <span className="font-semibold text-neutral-900">{q}</span>
        {open
          ? <ChevronUp className="w-5 h-5 text-indigo-400 flex-shrink-0" />
          : <ChevronDown className="w-5 h-5 text-neutral-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-6 py-4 bg-white/50 border-t border-neutral-200 text-neutral-700 leading-relaxed">
          {typeof a === 'string' ? a : a}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  // FAQPage schema unlocks rich-result accordion in Google search results.
  // Flatten the categorized list into the schema's mainEntity array.
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.flatMap(cat => cat.questions).map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <>
      <SEO
        title="FAQ"
        description="Frequently asked questions about ShinyPull. Learn how we track creator stats, how often data updates, and how to add a creator."
      />
      <StructuredData schema={faqSchema} />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-200 py-16">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-neutral-900 mb-4">Frequently Asked Questions</h1>
            <p className="text-xl text-neutral-500">
              Common questions about ShinyPull, our data, and how everything works.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">
          {faqs.map((section) => (
            <div key={section.category}>
              <h2 className="text-lg font-bold text-indigo-400 uppercase tracking-wider mb-4">
                {section.category}
              </h2>
              <div className="space-y-3">
                {section.questions.map((item, i) => (
                  <FAQItem key={i} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}

          <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Still have questions?</h2>
            <p className="text-neutral-500 mb-6">
              We're happy to help. Reach out and we'll get back to you within 24-48 hours.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
