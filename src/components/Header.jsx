import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Search, ChartNoAxesColumnIncreasing, Menu, X, Scale, BookOpen, User, LogOut, LayoutDashboard, Calculator, Heart, Settings, ChevronDown, LayoutGrid, TrendingUp, Megaphone, Milestone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMac } from '../lib/platform';

// Feature launcher entries. `tint` is the only color each gets — a muted icon
// tint for wayfinding, no gradient boxes (precision system).
// Compare and Dashboard live in the header's center pill nav instead of here.
// Keep `description` to ~25 characters (match the existing entries). The card
// grid is a fixed 400px, 2-column layout with a `line-clamp-2` description —
// anything much longer wraps into a mid-word ellipsis cutoff instead of a
// clean 2-line wrap. This has broken before; don't reintroduce it.
const moreLinks = [
  { path: '/trending', label: 'Trending', description: 'Fastest growing creators', icon: TrendingUp, tint: 'text-emerald-500' },
  { path: '/milestones', label: 'Milestones', description: 'Real threshold crossings', icon: Milestone, tint: 'text-indigo-500' },
  { path: '/youtube/money-calculator', label: 'Earnings Calc', description: 'Estimate YouTube revenue', icon: Calculator, tint: 'text-teal-500' },
  { path: '/promote', label: 'Get Featured', description: 'Promote your creator on ShinyPull', icon: Megaphone, tint: 'text-amber-500' },
  { path: '/blog', label: 'Blog', description: 'Creator economy insights', icon: BookOpen, tint: 'text-cyan-500' },
  { path: '/support', label: 'Support', description: 'Get help from our team', icon: Heart, tint: 'text-rose-500' },
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

  // AuthPanel is rendered at the App level (see App.jsx) — Header's backdrop-blur
  // creates a containing block which would collapse the panel's position:fixed h-full.
  // Header just dispatches openAuthPanel events; App owns the panel state.
  const openAuth = () => window.dispatchEvent(new CustomEvent('openAuthPanel'));
  const mobileMenuRef = useRef(null);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClick(e) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
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
    <header ref={mobileMenuRef} className="bg-white/85 backdrop-blur-md border-b border-neutral-200 sticky top-0 z-50">
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
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 p-1 bg-white border border-neutral-200 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {CENTER_NAV.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive(path)
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
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
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors group"
              aria-label="Open command palette"
            >
              <Search className="w-4 h-4" />
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-neutral-200 rounded text-neutral-500">
                {isMac ? <span className="text-xs leading-none">⌘</span> : 'Ctrl+'}K
              </kbd>
            </button>

            {/* More launcher */}
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  moreMenuOpen || isMoreActive
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
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
            <div className="ml-3 pl-3 border-l border-neutral-200">
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

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-neutral-200 bg-white">
            <div className="flex flex-col gap-1">

              {/* Quick access — same boxed-icon treatment as Features below,
                  so these two don't read as plain leftover rows the eye skips
                  past on the way to the grid. */}
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-1 mb-2">Quick access</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      window.dispatchEvent(new CustomEvent('openCommandPalette'));
                    }}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-neutral-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Search className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm leading-tight">Search</p>
                      <p className="text-xs text-neutral-500 leading-tight mt-0.5">Find any creator</p>
                    </div>
                  </button>
                  <Link
                    to="/rankings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-colors ${
                      isActive('/rankings') ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                      <ChartNoAxesColumnIncreasing className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm leading-tight">Rankings</p>
                      <p className="text-xs text-neutral-500 leading-tight mt-0.5">Top creators live</p>
                    </div>
                  </Link>
                  <Link
                    to="/compare"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-colors ${
                      isActive('/compare') ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
                      <Scale className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm leading-tight">Compare</p>
                      <p className="text-xs text-neutral-500 leading-tight mt-0.5">Side-by-side stats</p>
                    </div>
                  </Link>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-colors ${
                      isActive('/dashboard') ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                      <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 text-sm leading-tight">Dashboard</p>
                      <p className="text-xs text-neutral-500 leading-tight mt-0.5">Your followed creators</p>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Features grid */}
              <div className="mt-3 pt-3 border-t border-neutral-200">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest px-1 mb-2">Features</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {moreLinks.map(link => {
                    const Icon = link.icon;
                    const active = isActive(link.path);
                    return (
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-colors ${
                          active ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-neutral-50 border border-neutral-200/80 flex items-center justify-center flex-shrink-0">
                          <Icon className={`w-4 h-4 ${link.tint}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900 text-sm leading-tight truncate">{link.label}</p>
                          {link.badge && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 leading-none">
                              {link.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Auth */}
              <div className="mt-4 pt-4 border-t border-neutral-200">
                {isAuthenticated ? (
                  <>
                    <div className="px-4 py-2">
                      <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
                    </div>
                    <Link
                      to="/account"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                      Account Settings
                    </Link>
                    <button
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-neutral-700 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
                    >
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/auth/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 py-3 px-6 bg-neutral-900 text-white rounded-xl font-semibold hover:bg-neutral-800 transition-colors w-full"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
