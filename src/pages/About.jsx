import SEO from '../components/SEO';
import { Link } from 'react-router-dom';
import { BarChart3, Users, TrendingUp, Globe, Database, RefreshCw } from 'lucide-react';

export default function About() {
  return (
    <>
      <SEO
        title="About Us"
        description="Learn about ShinyPull - the leading social media analytics platform for tracking YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music artist statistics."
      />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-200 py-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-neutral-900 mb-4">About ShinyPull</h1>
            <p className="text-xl text-neutral-500">
              Comprehensive social media analytics for creators and fans
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">What We Do</h2>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              ShinyPull tracks public statistics for content creators and music artists across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music (via Last.fm).
              We collect stats every day and store them as historical snapshots, so you can see exactly how channels and artists have grown over time.
            </p>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              Every chart on ShinyPull is built from real data collected at a real point in time. No estimates, no synthetic fills, no smoothing. If we missed a day, the chart shows a gap. We think that's more honest than showing made-up continuity.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              Everything on ShinyPull is free to browse. No account required to search creators, view charts, or check rankings.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Why We Built This</h2>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              The creator economy moves fast. Sponsorship deals, channel acquisitions, platform migrations, audience shifts. The people making decisions in this space need accurate data, not estimates from tools that haven't been updated in years.
            </p>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              We started building ShinyPull because we kept running into the same problem: existing analytics tools were either too expensive, too slow to update, or showing data that clearly didn't match what the platforms themselves were displaying. We figured we could do better.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              The result is a site that collects data multiple times per day, stores every snapshot, and presents it without editorializing. Subscriber counts are shown exactly as the platform provides them. We note known limitations (like YouTube's rounding policy) but we don't hide them or pretend they don't exist. The goal is transparency, not flattery.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {[
              { Icon: Users,      title: 'Live counts',      text: 'Subscriber and follower counts updated multiple times per day.', accent: 'red' },
              { Icon: TrendingUp, title: 'Growth charts',    text: 'Historical trends going back to when we first started tracking a creator.', accent: 'emerald' },
              { Icon: BarChart3,  title: 'Rankings',         text: 'Top creators by platform, updated daily with real numbers.', accent: 'amber' },
              { Icon: Globe,      title: 'Cross-platform',   text: 'YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music all in one place.', accent: 'sky' },
              { Icon: Database,   title: 'Stream tracking',  text: 'Hours watched, peak viewers, and stream history for Twitch and Kick.', accent: 'violet' },
              { Icon: RefreshCw,  title: 'Always current',   text: 'Automated collection runs around the clock. No stale data.', accent: 'indigo' },
            ].map((item) => {
              const accentMap = {
                red:     'bg-red-50 text-red-600 border-red-100',
                emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                amber:   'bg-amber-50 text-amber-600 border-amber-100',
                sky:     'bg-sky-50 text-sky-600 border-sky-100',
                violet:  'bg-violet-50 text-violet-600 border-violet-100',
                indigo:  'bg-indigo-50 text-indigo-600 border-indigo-100',
              };
              return (
                <div key={item.title} className="flex items-start gap-3 p-5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                  <div className={`w-10 h-10 rounded-lg border ${accentMap[item.accent]} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <item.Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 mb-1">{item.title}</p>
                    <p className="text-sm text-neutral-600 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Our Data</h2>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              All data shown on ShinyPull is publicly available. We collect stats using official platform APIs where
              they exist, and publicly available profile data for platforms that don't offer one. We never access
              private account information.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              Want to know exactly how collection works for each platform?{' '}
              <Link to="/methodology" className="text-indigo-600 hover:text-indigo-700 font-medium underline-offset-2 hover:underline">
                Read our data methodology.
              </Link>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Contact</h2>
            <p className="text-neutral-700 mb-4 leading-relaxed">
              Questions, feedback, or something looks wrong? We'd love to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                Contact form
              </Link>
              <a
                href="mailto:shinypull@proton.me"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-semibold rounded-xl transition-colors text-sm"
              >
                shinypull@proton.me
              </a>
            </div>
          </div>

          <div className="text-center text-sm text-neutral-700 mt-8">
            <p>Copyright ©2026 ShinyPull</p>
          </div>
        </div>
      </div>
    </>
  );
}
