import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import NewsletterSignup from './NewsletterSignup';
import MusicIcon from './MusicIcon';
import YouTubeIcon from './YouTubeIcon';
import TwitchIcon from './TwitchIcon';
import KickIcon from './KickIcon';
import TikTokIcon from './TikTokIcon';
import BlueskyIcon from './BlueskyIcon';
import MastodonIcon from './MastodonIcon';
import SubstackIcon from './SubstackIcon';

const FEATURE_LINKS = [
  ['/search',                    'Creator Search'],
  ['/rankings',                  'Top Rankings'],
  ['/best',                      'Best by Category'],
  ['/trending',                  'Trending Creators'],
  ['/milestones',                'Milestones'],
  ['/compare',                   'Compare Creators'],
  ['/youtube/money-calculator',  'Money Calculator'],
  ['/blog',                      'Blog'],
];

const PLATFORM_LINKS = [
  ['/rankings/youtube',  'YouTube',  YouTubeIcon],
  ['/rankings/tiktok',   'TikTok',   TikTokIcon],
  ['/rankings/twitch',   'Twitch',   TwitchIcon],
  ['/rankings/kick',     'Kick',     KickIcon],
  ['/rankings/bluesky',  'Bluesky',  BlueskyIcon],
  ['/rankings/music',    'Music',    MusicIcon],
  ['/rankings/mastodon', 'Mastodon', MastodonIcon],
  ['/rankings/substack', 'Substack', SubstackIcon],
];

const COMPANY_LINKS = [
  ['/about',        'About'],
  ['/contact',      'Contact'],
  ['/faq',          'FAQ'],
  ['/methodology',  'Methodology'],
  ['/support',      'Support'],
];

const LEGAL_LINKS = [
  ['/privacy',  'Privacy'],
  ['/terms',    'Terms'],
  ['/refunds',  'Refunds'],
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-neutral-200 mt-auto">
      <div className="border-b border-neutral-200 bg-neutral-50">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NewsletterSignup variant="bar" />
        </div>
      </div>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-10">

          {/* Brand */}
          <div className="col-span-2 md:col-span-2 md:pr-8">
            <Link to="/" aria-label="ShinyPull home" className="flex items-baseline gap-[3px] mb-3 group">
              <span className="text-[22px] leading-none font-bold tracking-tight text-neutral-900">ShinyPu</span>
              <span aria-hidden="true" className="inline-block w-[5px] h-[14px] rounded-[2px] bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500" />
              <span aria-hidden="true" className="inline-block w-[5px] h-[19px] rounded-[2px] -ml-px bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500" />
            </Link>
            <p className="text-sm text-neutral-600 leading-relaxed max-w-sm">
              Creator analytics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Substack, and Music. Updated daily.
            </p>

            {/* CTA — Get featured */}
            <Link
              to="/promote"
              className="inline-flex items-center gap-1.5 mt-5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Promote your creator
            </Link>

            {/* Follow on X / TikTok */}
            <div className="flex items-center gap-4 mt-3 ml-2">
              <a
                href="https://x.com/ShinyPull"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow ShinyPull on X"
                className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 transition-colors text-xs font-medium"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Follow on X
              </a>
              <a
                href="https://www.tiktok.com/@shinypull"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow ShinyPull on TikTok"
                className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 transition-colors text-xs font-medium"
              >
                <TikTokIcon className="w-3.5 h-3.5" />
                Follow on TikTok
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold mb-4 text-neutral-900 uppercase tracking-wider">Product</h3>
            <ul className="space-y-2.5 text-sm">
              {FEATURE_LINKS.map(([to, label]) => (
                <li key={to}>
                  {/* py-1.5 -my-1.5: expands the tap target to clear 24px
                      (flagged by PageSpeed) without changing the list's
                      visual row spacing -- the negative margin cancels the
                      padding out of the layout box space-y-2.5 measures. */}
                  <Link to={to} className="block py-1.5 -my-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Platforms — laid out in a 2-column grid (column-major flow) so the
              list reads top-to-bottom in each column instead of a tall single
              stack. col-span-2 of the outer 6-col grid gives the inner columns
              breathing room. Adding a new platform automatically extends both
              columns evenly via gridTemplateRows. */}
          <div className="col-span-2 md:col-span-2">
            <h3 className="text-xs font-semibold mb-4 text-neutral-900 uppercase tracking-wider">Platforms</h3>
            <ul
              className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm"
              style={{ gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(PLATFORM_LINKS.length / 2)}, minmax(0, 1fr))` }}
            >
              {PLATFORM_LINKS.map(([to, label, Icon]) => (
                <li key={to}>
                  <Link to={to} className="flex items-center gap-2 py-1.5 -my-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold mb-4 text-neutral-900 uppercase tracking-wider">Company</h3>
            <ul className="space-y-2.5 text-sm">
              {COMPANY_LINKS.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="block py-1.5 -my-1.5 text-neutral-600 hover:text-neutral-900 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-neutral-200 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-neutral-500">
          <p>&copy; {currentYear} ShinyPull. Statistics are provided for informational purposes only.</p>
          <div className="flex items-center gap-4">
            {LEGAL_LINKS.map(([to, label]) => (
              <Link key={to} to={to} className="py-1.5 -my-1.5 hover:text-neutral-900 transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
