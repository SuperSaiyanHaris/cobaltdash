import { Link } from 'react-router-dom';
import { BarChart3, Youtube, Twitch, Music } from 'lucide-react';
import KickIcon from './KickIcon';
import TikTokIcon from './TikTokIcon';
import BlueskyIcon from './BlueskyIcon';
import MastodonIcon from './MastodonIcon';
import RumbleIcon from './RumbleIcon';
import SubstackIcon from './SubstackIcon';

const FEATURE_LINKS = [
  ['/search',                    'Creator Search'],
  ['/rankings',                  'Top Rankings'],
  ['/trending',                  'Trending Creators'],
  ['/compare',                   'Compare Creators'],
  ['/youtube/money-calculator',  'Money Calculator'],
  ['/blog',                      'Blog'],
];

const PLATFORM_LINKS = [
  ['/rankings/youtube',  'YouTube',  Youtube],
  ['/rankings/tiktok',   'TikTok',   TikTokIcon],
  ['/rankings/twitch',   'Twitch',   Twitch],
  ['/rankings/kick',     'Kick',     KickIcon],
  ['/rankings/bluesky',  'Bluesky',  BlueskyIcon],
  ['/rankings/music',    'Music',    Music],
  ['/rankings/mastodon', 'Mastodon', MastodonIcon],
  ['/rankings/rumble',   'Rumble',   RumbleIcon],
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
              Creator analytics across YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music. Updated daily.
            </p>

            {/* CTA — Get featured */}
            <Link
              to="/promote"
              className="inline-flex items-center gap-1.5 mt-5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Promote your creator
            </Link>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-xs font-semibold mb-4 text-neutral-900 uppercase tracking-wider">Product</h3>
            <ul className="space-y-2.5 text-sm">
              {FEATURE_LINKS.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="text-neutral-600 hover:text-neutral-900 transition-colors">
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
                  <Link to={to} className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors">
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
                  <Link to={to} className="text-neutral-600 hover:text-neutral-900 transition-colors">
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
              <Link key={to} to={to} className="hover:text-neutral-900 transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
