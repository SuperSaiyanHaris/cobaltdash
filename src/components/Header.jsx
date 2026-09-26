import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Search, ChartNoAxesColumnIncreasing, Menu, X, Scale, BookOpen, User, LogOut, LayoutDashboard, Calculator, Heart, Settings, ChevronDown, LayoutGrid, TrendingUp, Megaphone, Milestone, BadgeCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMac } from '../lib/platform';
import useRankingsHint from '../hooks/useRankingsHint';
import YouTubeIcon from './YouTubeIcon';
import TikTokIcon from './TikTokIcon';
import TwitchIcon from './TwitchIcon';
import KickIcon from './KickIcon';
import BlueskyIcon from './BlueskyIcon';
import MusicIcon from './MusicIcon';
import MastodonIcon from './MastodonIcon';
import SubstackIcon from './SubstackIcon';

// Feature launcher entries. `tint` is the only color each gets — a muted icon
// tint for wayfinding, no gradient boxes (precision system).
// Compare and Dashboard live in the header's center pill nav instead of here.
// Keep `description` to ~25 characters (match the existing entries). The card
// grid is a fixed 400px, 2-column layout with a `line-clamp-2` description —
// anything much longer wraps into a mid-word ellipsis cutoff instead of a
// clean 2-line wrap. This has broken before; don't reintroduce it.
const PLATFORM_CHIPS = [
  ['youtube', 'YouTube', YouTubeIcon], ['tiktok', 'TikTok', TikTokIcon], ['twitch', 'Twitch', TwitchIcon], ['kick', 'Kick', KickIcon],
  ['bluesky', 'Bluesky', BlueskyIcon], ['music', 'Music', MusicIcon], ['mastodon', 'Mastodon', MastodonIcon], ['substack', 'Substack', SubstackIcon],
];

const moreLinks = [
  { path: '/trending', label: 'Trending', description: 'Fastest growing creators', icon: TrendingUp, tint: 'text-emerald-500' },
  { path: '/milestones', label: 'Milestones', description: 'Big numbers crossed', icon: Milestone, tint: 'text-indigo-500' },
  { path: '/youtube/money-calculator', label: 'Earnings Calc', description: 'Estimate YouTube revenue', icon: Calculator, tint: 'text-teal-500' },
  { path: '/kick/earnings', label: 'Kick Earnings', description: 'Top streamers\' sub income', icon: Calculator, tint: 'text-green-600' },
  { path: '/badge', label: 'Creator Cards', description: 'Your holographic card', icon: BadgeCheck, tint: 'text-indigo-500' },
  { path: '/promote', label: 'Get Featured', description: 'Promote your creator on ShinyPull', icon: Megaphone, tint: 'text-amber-500' },
  { path: '/blog', label: 'Blog', description: 'Creator economy insights', icon: BookOpen, tint: 'text-cyan-500' },
  { path: '/support', label: 'Support', description: 'Help keep it running', icon: Heart, tint: 'text-rose-500' },
];

// The 3 primary destinations, always visible as a floating center pill on
// desktop — same role as Ripit's Packs/Collection/Wallet center nav.
const CENTER_NAV = [
  { path: '/rankings',  label: 'Rankings',  icon: ChartNoAxesColumnIncreasing },
  { path: '/compare',   label: 'Compare',   icon: Scale },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAuthenticated } = useAuth();
  const showRankingsHint = useRankingsHint();

  // AuthPanel is rendered at the App level (see App.jsx) — Header's backdrop-blur
  // creates a containing block which would collapse the panel's position:fixed h-full.
  // Header just dispatches openAuthPanel events; App owns the panel state.
  const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel'));
  const mobileMenuRef = useRef(null);
  const mobileSheetRef = useRef(null);

  // No divider line while the page sits at the top (it read as a hard seam
  // against dark heroes and panels); the soft shadow appears once content
  // scrolls under the header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClick(e) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target) && !(mobileSheetRef.current && mobileSheetRef.current.contains(e.target))) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    // The floating bottom nav would otherwise peek out under the open menu.
    document.body.dataset.mobileMenu = 'open';
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
      delete document.body.dataset.mobileMenu;
    };
  }, [mobileMenuOpen]);

  // Close more menu on Escape
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setMoreMenuOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [moreMenuOpen]);


  const isActive = (path) => {
    if (path === '/rankings') return location.pathname.startsWith('/rankings');
    if (path === '/blog') return location.pathname.startsWith('/blog');
    return location.pathname === path;
  };

  const isMoreActive = moreLinks.some(link => isActive(link.path));

  return (
    <header ref={mobileMenuRef} className={`bg-white/85 backdrop-blur-md sticky top-0 z-50 transition-shadow duration-200 ${scrolled ? 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)]' : ''}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">

          {/* Logo — wordmark where the "ll" of Pull are gradient bars, so the
              wordmark doubles as the bar-chart mark. */}
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="ShinyPull home"
            className="flex items-baseline gap-[3px] group flex-shrink-0"
          >
            <span className="text-[26px] leading-none font-bold tracking-tight text-neutral-900">ShinyPu</span>
            <span aria-hidden="true" className="inline-block w-[6px] h-[17px] rounded-[2px] bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500 transition-transform group-hover:-translate-y-0.5" />
            <span aria-hidden="true" className="inline-block w-[6px] h-[23px] rounded-[2px] -ml-px bg-gradient-to-b from-indigo-500 via-purple-500 to-fuchsia-500 transition-transform group-hover:-translate-y-1" />
          </Link>

          {/* Center pill nav — the 3 primary destinations, floating and
              centered independent of logo/right-cluster width, same role as
              a lot of modern app headers' persistent utility nav. */}
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 p-1 bg-white border border-neutral-900 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {CENTER_NAV.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive(path)
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {/* First-visit attention cue — Rankings only, gone for good
                    once the visitor has ever landed on /rankings (any route).
                    A quiet periodic light sweep, not a pulsing ring (too
                    attention-grabby, see feedback 2026-09-03). See
                    useRankingsHint and the sp-hint-sweep keyframe in index.css. */}
                {path === '/rankings' && showRankingsHint && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                    <span
                      className="absolute inset-y-0 w-1/2 sp-hint-sweep"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,.4), transparent)' }}
                    />
                  </span>
                )}
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Desktop Nav — right cluster: quick search, secondary features, auth */}
          <nav className="hidden md:flex items-center gap-1">

            {/* Search — opens the command palette (Cmd+K) */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('openCommandPalette'))}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-neutral-900 hover:bg-neutral-100 transition-colors group"
              aria-label="Open command palette"
            >
              <Search className="w-4 h-4" />
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-neutral-900 rounded text-neutral-900">
                {isMac ? <span className="text-xs leading-none">⌘</span> : 'Ctrl+'}K
              </kbd>
            </button>

            {/* More launcher */}
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-neutral-900 transition-colors ${
                  moreMenuOpen || isMoreActive ? 'bg-neutral-100' : 'hover:bg-neutral-100'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>More</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${moreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-[400px] bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 p-3">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-1 mb-2.5">Features</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {moreLinks.map(link => {
                        const Icon = link.icon;
                        const active = isActive(link.path);
                        return (
                          <Link
                            key={link.path}
                            to={link.path}
                            onClick={() => setMoreMenuOpen(false)}
                            className={`group flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                              active ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-lg bg-neutral-50 border border-neutral-200/80 flex items-center justify-center flex-shrink-0">
                              <Icon className={`w-4 h-4 ${link.tint}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-neutral-900 text-sm leading-tight">{link.label}</p>
                                {link.badge && (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none flex-shrink-0">
                                    {link.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-neutral-500 leading-tight mt-0.5 line-clamp-2">{link.description}</p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Auth section */}
            <div className="ml-3 pl-3 border-l border-neutral-900">
              {isAuthenticated ? (
                <div className="relative">
                  {(() => {
                    const name = user?.user_metadata?.display_name || user?.email?.split('@')[0] || '?';
                    const initials = name.slice(0, 2).toUpperCase();
                    return (
                      <button
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className="flex items-center gap-2 p-0.5 rounded-full hover:ring-2 hover:ring-neutral-200 transition-all"
                        aria-label="Account menu"
                      >
                        <div className="w-8 h-8 bg-neutral-900 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {initials}
                        </div>
                      </button>
                    );
                  })()}

                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-neutral-200 py-1.5 z-50">
                        <div className="px-4 py-2.5 border-b border-neutral-200 mb-1">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{user?.user_metadata?.display_name || user?.email?.split('@')[0]}</p>
                          <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
                        </div>
                        <Link
                          to="/dashboard"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 w-full transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4 text-neutral-400" />
                          Dashboard
                        </Link>
                        <Link
                          to="/account"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 w-full transition-colors"
                        >
                          <Settings className="w-4 h-4 text-neutral-400" />
                          Account Settings
                        </Link>
                        <div className="border-t border-neutral-200 mt-1 pt-1">
                          <button
                            onClick={() => {
                              signOut();
                              setUserMenuOpen(false);
                            }}
                            className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
                          >
                            <LogOut className="w-4 h-4 text-neutral-400" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  to="/auth/sign-in"
                  className="flex items-center gap-2 px-3.5 py-2 bg-neutral-900 text-white rounded-lg text-sm font-semibold hover:bg-neutral-800 transition-colors"
                >
                  Sign in
                </Link>
              )}
            </div>
          </nav>

          {/* Mobile action buttons — Rankings and Search dropped 2026-09-02, both
              already reachable via the hamburger's Quick access grid below, and
              Search also lives in the new bottom tab bar (MobileBottomNav.jsx). */}
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu: a dark full-screen sheet under the header. It only
            holds what the floating bottom bar doesn't (Dashboard, Compare,
            Rankings, Blog and Search live there), plus rankings by platform
            and the account. The bottom bar hides while this is open. */}
        {/* Portaled to <body>: the header's backdrop-blur makes it the
            containing block for fixed children, which squashed this sheet
            into the 64px header. Clicks inside still count as "inside the
            menu" via mobileSheetRef. */}
        {mobileMenuOpen && createPortal(
          <nav ref={mobileSheetRef} className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto bg-[#0a0a0f] text-white px-4 pt-5 pb-10" aria-label="Menu">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mb-3">Explore</p>
            <div className="grid grid-cols-2 gap-2">
              {moreLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.path);
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                      active ? 'bg-white text-neutral-950 border-white' : 'bg-white/[0.04] border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span className={`flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${active ? 'bg-neutral-950 text-white' : 'bg-white/10'}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">{link.label}</span>
                      <span className={`block text-[11px] truncate ${active ? 'text-neutral-600' : 'text-white/60'}`}>{link.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mt-7 mb-3">Rankings</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_CHIPS.map(([p, label, Icon]) => (
                <Link
                  key={p}
                  to={`/rankings/${p}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border text-sm font-semibold transition-colors ${
                    location.pathname === `/rankings/${p}` ? 'bg-white text-neutral-950 border-white' : 'border-white/15 hover:border-white/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white text-neutral-950 text-sm font-black flex-shrink-0">
                      {(user?.user_metadata?.display_name || user?.email || '?').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">{user?.user_metadata?.display_name || user?.email?.split('@')[0]}</span>
                      <span className="block text-xs text-white/65 truncate">{user?.email}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Link
                      to="/account"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 h-12 rounded-xl bg-white text-neutral-950 text-sm font-bold"
                    >
                      <Settings className="w-4 h-4" /> Account
                    </Link>
                    <button
                      onClick={() => { signOut(); setMobileMenuOpen(false); }}
                      className="flex items-center justify-center gap-2 h-12 rounded-xl border border-white/25 text-sm font-bold text-white"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  to="/auth/sign-in"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center h-12 rounded-xl bg-white text-neutral-950 text-sm font-bold"
                >
                  Sign in
                </Link>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/75">
              {[['/about', 'About'], ['/faq', 'FAQ'], ['/methodology', 'Methodology'], ['/contact', 'Contact']].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMobileMenuOpen(false)} className="py-1 hover:text-white">{label}</Link>
              ))}
            </div>
          </nav>,
          document.body,
        )}
      </div>
    </header>
  );
}
