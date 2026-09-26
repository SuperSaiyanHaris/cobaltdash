import { Link } from 'react-router-dom';
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
  ['/kick/earnings',             'Kick Earnings'],
  ['/badge',                     'Creator Cards'],
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
  const linkCls = 'block py-1.5 text-sm font-medium text-white/75 hover:text-white transition-colors';
  const headCls = 'text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mb-3';

  return (
    // Dark to match the site's hero bands. The extra bottom padding on phones
    // keeps the last line clear of the floating bottom nav bar.
    <footer className="relative bg-[#0a0a0f] text-white mt-auto">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12">
        <NewsletterSignup variant="bar" className="border border-white/10" />
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-[calc(env(safe-area-inset-bottom)+7rem)] md:pb-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-9 mb-10">

          {/* Brand */}
          <div className="col-span-2 md:col-span-2 md:pr-8">
            <Link to="/" aria-label="ShinyPull home" className="inline-flex items-baseline gap-[3px] mb-3">
              <span className="text-[22px] leading-none font-bold tracking-tight text-white">ShinyPu</span>
              <span aria-hidden="true" className="inline-block w-[5px] h-[14px] rounded-[2px] bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500" />
              <span aria-hidden="true" className="inline-block w-[5px] h-[19px] rounded-[2px] -ml-px bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500" />
            </Link>
            <p className="text-sm text-white/70 leading-relaxed max-w-sm">
              Every creator&apos;s numbers across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Substack and Music. Updated daily.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 mt-5">
              <Link
                to="/promote"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold transition-colors"
              >
                Promote your creator
              </Link>
              <a
                href="https://x.com/ShinyPull"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow ShinyPull on X"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/15 hover:border-white/50 text-white transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.tiktok.com/@shinypull"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow ShinyPull on TikTok"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/15 hover:border-white/50 transition-colors"
              >
                <TikTokIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product: two columns on phones so it isn't one long list */}
          <div className="col-span-2 md:col-span-2">
            <h3 className={headCls}>Product</h3>
            <ul className="grid grid-cols-2 gap-x-6">
              {FEATURE_LINKS.map(([to, label]) => (
                <li key={to}><Link to={to} className={linkCls}>{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="col-span-2 md:col-span-2">
            <h3 className={headCls}>Company</h3>
            <ul className="grid grid-cols-2 gap-x-6">
              {COMPANY_LINKS.map(([to, label]) => (
                <li key={to}><Link to={to} className={linkCls}>{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Platforms as a chip row */}
          <div className="col-span-2 md:col-span-6">
            <h3 className={headCls}>Rankings by platform</h3>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_LINKS.map(([to, label, Icon]) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-white/15 hover:border-white/50 text-sm font-semibold text-white transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-white/65">
          <p>&copy; {currentYear} ShinyPull</p>
          <div className="flex items-center gap-5">
            {LEGAL_LINKS.map(([to, label]) => (
              <Link key={to} to={to} className="py-1.5 font-medium hover:text-white transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
