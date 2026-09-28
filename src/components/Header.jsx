import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Search, ChartNoAxesColumnIncreasing, Menu, X, Scale, BookOpen, User, LogOut, LayoutDashboard, Calculator, Heart, Settings, ChevronDown, ChevronRight, LayoutGrid, TrendingUp, Megaphone, Milestone, BadgeCheck, MessageCircle, Gift } from 'lucide-react';
import { useProgress } from '../services/progressService';
import { unreadReplies } from '../services/commentsService';
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
  { path: '/pass', label: 'ShinyPass', description: 'Free season pass: 99 levels, 10 packs', icon: Gift, tint: 'text-violet-500' },
  { path: '/trending', label: 'Trending', description: 'Fastest growing creators', icon: TrendingUp, tint: 'text-emerald-500' },
  { path: '/milestones', label: 'Milestones', description: 'Big numbers crossed', icon: Milestone, tint: 'text-indigo-500' },
  { path: '/youtube/money-calculator', label: 'Earnings Calc', description: 'Estimate YouTube revenue', icon: Calculator, tint: 'text-teal-500' },
  { path: '/kick/earnings', label: 'Kick Earnings', description: 'Top streamers\' sub income', icon: Calculator, tint: 'text-green-600' },
  { path: '/card', label: 'Creator Cards', description: 'Your holographic card', icon: BadgeCheck, tint: 'text-indigo-500' },
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
  // Unread replies to the signed-in person's comments, for the account menu.
  // Checked on sign-in and at most every 2 minutes while navigating.
  const [unread, setUnread] = useState(0);
  const unreadChecked = useRef(0);
  const showRankingsHint = useRankingsHint();
  const pass = useProgress();
  const initials = (pass?.handle || user?.user_metadata?.display_name || user?.email || '?').slice(0, 1).toUpperCase();

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

  useEffect(() => {
    if (!isAuthenticated) { setUnread(0); unreadChecked.current = 0; return; }
    if (Date.now() - unreadChecked.current < 120000) return;
    unreadChecked.current = Date.now();
    unreadReplies().then(setUnread).catch(() => {});
  }, [isAuthenticated, location.pathname]);
  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener('repliesSeen', clear);
    return () => window.removeEventListener('repliesSeen', clear);
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
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
                        <div className="relative w-8 h-8 bg-neutral-900 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {initials}
                          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand ring-2 ring-white" aria-label={`${unread} new replies`} />}
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
                          to="/pass"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 w-full transition-colors"
                        >
                          <Gift className="w-4 h-4 text-neutral-400" />
                          ShinyPass
                        </Link>
                        <Link
                          to="/replies"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 w-full transition-colors"
                        >
                          <MessageCircle className="w-4 h-4 text-neutral-400" />
                          <span className="flex-1">Replies</span>
                          {unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">{unread}</span>}
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

          {/* Mobile row (no bottom tab bar since 2026-09-28): the two most
              used destinations one tap away, your ShinyPass level, and the
              menu for everything else. */}
          <div className="md:hidden flex items-center gap-1">
            <Link
              to="/rankings"
              aria-label="Rankings"
              className={`relative max-[359px]:hidden w-10 h-10 grid place-items-center rounded-full transition-colors ${isActive('/rankings') ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-neutral-100'}`}
            >
              <ChartNoAxesColumnIncreasing className="w-5 h-5" strokeWidth={2.25} />
              {showRankingsHint && !isActive('/rankings') && <span aria-hidden="true" className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-brand" />}
            </Link>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openCommandPalette'))}
              aria-label="Search"
              className="w-10 h-10 grid place-items-center rounded-full text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              <Search className="w-5 h-5" strokeWidth={2.25} />
            </button>
            {isAuthenticated ? (
              pass ? (
                <Link to="/pass" aria-label={`ShinyPass level ${pass.progress.level}`} className="relative ml-0.5 h-8 pl-1 pr-2.5 rounded-full bg-neutral-900 text-white flex items-center gap-1.5 overflow-hidden">
                  <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-black bg-white text-neutral-900">{initials}</span>
                  <span className="text-[12px] font-black tabular-nums tracking-tight">LV {pass.progress.level}</span>
                  <span aria-hidden="true" className="absolute left-0 bottom-0 h-[2px]" style={{ width: `${Math.round((pass.progress.level >= 99 ? 1 : pass.progress.pct || 0) * 100)}%`, background: 'linear-gradient(90deg,#7DF9FF,#B69CFF,#FF7AD9)' }} />
                </Link>
              ) : <span aria-hidden="true" className="ml-0.5 w-[62px] h-8 rounded-full bg-neutral-200" />
            ) : (
              <button onClick={openAuth} className="ml-0.5 h-8 px-3 rounded-full bg-neutral-900 text-white text-[13px] font-bold">Sign in</button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="relative w-10 h-10 grid place-items-center rounded-full text-neutral-900 hover:bg-neutral-100 transition-colors"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              {!mobileMenuOpen && unread > 0 && <span aria-hidden="true" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand ring-2 ring-white" />}
            </button>
          </div>
        </div>

        {/* Mobile menu: a dark full-screen sheet under the header with search,
            the main destinations, your ShinyPass, rankings by platform, more
            links and the account. Portaled to <body>: the header's
            backdrop-blur makes it the containing block for fixed children,
            which squashed this sheet into the 64px header. Clicks inside
            still count as "inside the menu" via mobileSheetRef. */}
        {mobileMenuOpen && createPortal(
          <nav ref={mobileSheetRef} className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto overscroll-contain bg-[#0a0a0f] text-white px-4 pt-5 pb-[calc(40px+env(safe-area-inset-bottom))]" aria-label="Menu">
            {/* Search */}
            <button
              onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new CustomEvent('openCommandPalette')); }}
              className="w-full h-12 rounded-xl bg-white/[0.06] border border-white/10 px-4 flex items-center gap-3 text-white/70 text-[15px]"
            >
              <Search className="w-4 h-4" /> Search creators
            </button>

            {/* Main destinations */}
            <div className="mt-4 divide-y divide-white/[0.06]">
              {[['/rankings', 'Rankings', ChartNoAxesColumnIncreasing], ['/compare', 'Compare', Scale], ['/dashboard', 'Dashboard', LayoutDashboard], ['/blog', 'Blog', BookOpen]].map(([to, label, Icon]) => {
                const active = isActive(to);
                return (
                  <Link key={to} to={to} onClick={() => setMobileMenuOpen(false)}
                    className={`h-14 px-4 rounded-xl flex items-center gap-3.5 text-[17px] font-bold transition-colors ${active ? 'bg-white text-neutral-950' : 'hover:bg-white/[0.06]'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className={`w-4 h-4 ${active ? 'text-neutral-500' : 'text-white/40'}`} />
                  </Link>
                );
              })}
            </div>

            {/* ShinyPass */}
            <Link to="/pass" onClick={() => setMobileMenuOpen(false)} className="mt-5 block rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              {isAuthenticated && pass ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black tabular-nums">LV {pass.progress.level}</span>
                    <span className="text-white/60 font-semibold">ShinyPass</span>
                    <ChevronRight className="w-4 h-4 text-white/40 ml-auto" />
                  </div>
                  <div className="mt-2.5 grid grid-cols-10 gap-[3px] h-2" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, i) => {
                      const fill = Math.max(0, Math.min(1, (pass.progress.level >= 99 ? 1 : pass.progress.pct || 0) * 10 - i));
                      return <span key={i} className="rounded-sm bg-white/[0.12] overflow-hidden"><span className="block h-full" style={{ width: `${fill * 100}%`, background: 'linear-gradient(90deg,#7DF9FF,#B69CFF,#FF7AD9)' }} /></span>;
                    })}
                  </div>
                  <p className="mt-2 text-[13px] text-white/65">{pass.progress.level >= 99 ? 'Max level this season' : `${Math.max(0, (pass.progress.need || 0) - (pass.progress.into || 0))} XP to level ${pass.progress.level + 1}`}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    <span className="font-bold text-[17px]">ShinyPass</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-white/10 text-white/80">Season 1 · Free</span>
                    <ChevronRight className="w-4 h-4 text-white/40 ml-auto" />
                  </div>
                  <p className="mt-1.5 text-[14px] text-white/70">99 levels, a pack every 10. Level up your own card.</p>
                </>
              )}
            </Link>

            {/* Rankings by platform */}
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mt-7 mb-3">Rankings by platform</p>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORM_CHIPS.map(([pl, label, Icon]) => (
                <Link key={pl} to={`/rankings/${pl}`} onClick={() => setMobileMenuOpen(false)}
                  className={`h-16 rounded-xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${location.pathname === `/rankings/${pl}` ? 'bg-white text-neutral-950 border-white' : 'border-white/10 hover:border-white/40'}`}>
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
            </div>

            {/* More */}
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mt-7 mb-1">More</p>
            <div className="grid grid-cols-2 gap-x-4">
              {moreLinks.filter((l) => l.path !== '/pass' && l.path !== '/blog').sort((a, b) => (a.path === '/promote') - (b.path === '/promote')).map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.path} to={link.path} onClick={() => setMobileMenuOpen(false)}
                    className={`h-11 flex items-center gap-2.5 text-[14px] font-semibold ${isActive(link.path) ? 'text-white' : 'text-white/85 hover:text-white'}`}>
                    <Icon className={`w-4 h-4 ${link.path === '/promote' ? 'text-amber-400' : 'text-white/60'}`} />
                    {link.label}
                  </Link>
                );
              })}
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
                  <Link
                    to="/replies"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 h-12 px-4 mt-4 rounded-xl bg-white/10 text-white text-sm font-bold"
                  >
                    <MessageCircle className="w-4 h-4" /> <span className="flex-1">Replies</span>
                    {unread > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">{unread}</span>}
                  </Link>
                  <div className="grid grid-cols-2 gap-2 mt-2">
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
                <button
                  onClick={() => { setMobileMenuOpen(false); openAuth(); }}
                  className="w-full flex items-center justify-center h-12 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold"
                >
                  Sign in or create account
                </button>
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
