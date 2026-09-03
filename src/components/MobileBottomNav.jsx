import { Link, useLocation } from 'react-router-dom';
import { ChartNoAxesColumnIncreasing, Scale, LayoutDashboard, User, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Global mobile tab bar — the 3 primary destinations plus account and search,
// always reachable with one tap. Desktop keeps its own center pill nav
// (Header.jsx's CENTER_NAV); this is the mobile-only equivalent.
//
// Curve + glow shape modeled on the PlayStation app's bottom bar (2026-09-02
// design pass, see the mobile-nav-redesign artifact this was iterated from).
// Both curves and every icon position below are computed from the same
// quadratic bezier (edge y=0, control y=-40, so the visible peak sits at
// y=-20 at the horizontal center) — the bottom curve is the identical shape
// offset +46 on y, and each icon's vertical position is the midpoint between
// the two curves at that icon's x, so the row visually arcs to fit the
// channel instead of a flat row the curves cut across. Don't hand-tune any
// of POSITIONS without recomputing from that same curve, they'll drift out
// of alignment with the two <path> shapes below. Edge y is 0 — not some
// small-but-nonzero value — so the white fill touches the very top-left/
// top-right corners of the bar with zero gap; the svg needs overflow-visible
// (below) since the peak goes negative, above the nominal viewBox.
const POSITIONS = [
  { xPercent: 10, top: 5, gapBefore: 12 },
  { xPercent: 30, top: -5, gapBefore: 90 },
  { xPercent: 50, top: -8, gapBefore: 168 },
  { xPercent: 70, top: -5, gapBefore: 246 },
  { xPercent: 90, top: 5, gapBefore: 324 },
];
const BAR_HEIGHT = 92;
const TOP_CURVE = 'M0,0 Q195,-40 390,0';
const BOTTOM_CURVE = 'M0,46 Q195,6 390,46';

const NAV_ITEMS = [
  { path: '/rankings', label: 'Rankings', icon: ChartNoAxesColumnIncreasing, isActive: (p) => p.startsWith('/rankings') },
  { path: '/compare', label: 'Compare', icon: Scale, isActive: (p) => p === '/compare' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: (p) => p === '/dashboard' },
];

// Broader than NAV_ITEMS: this drives the floating page-name label only, not
// which icon lights up. Every route in App.jsx gets a short name here so the
// label always shows something, not just on the 5 tab pages. Order matters —
// first match wins, so specific paths must come before the generic 2-segment
// creator-profile fallback at the end.
const PAGE_LABELS = [
  { label: 'Home', isActive: (p) => p === '/' },
  { label: 'Rankings', isActive: (p) => p.startsWith('/rankings') },
  { label: 'Best Of', isActive: (p) => p.startsWith('/best') },
  { label: 'Compare', isActive: (p) => p === '/compare' },
  { label: 'Earnings Calc', isActive: (p) => p === '/youtube/money-calculator' },
  { label: 'Trending', isActive: (p) => p === '/trending' },
  { label: 'Milestones', isActive: (p) => p === '/milestones' },
  { label: 'Live', isActive: (p) => p.startsWith('/live/') },
  { label: 'Shared Profile', isActive: (p) => p.startsWith('/s/') },
  { label: 'Dashboard', isActive: (p) => p === '/dashboard' },
  { label: 'Account', isActive: (p) => p === '/account' },
  { label: 'About', isActive: (p) => p === '/about' },
  { label: 'Contact', isActive: (p) => p === '/contact' },
  { label: 'Privacy', isActive: (p) => p === '/privacy' },
  { label: 'Terms', isActive: (p) => p === '/terms' },
  { label: 'Refunds', isActive: (p) => p === '/refunds' },
  { label: 'Support', isActive: (p) => p === '/support' },
  { label: 'Get Featured', isActive: (p) => p === '/promote' },
  { label: 'Blog', isActive: (p) => p.startsWith('/blog') },
  { label: 'FAQ', isActive: (p) => p === '/faq' },
  { label: 'Methodology', isActive: (p) => p === '/methodology' },
  { label: 'Admin', isActive: (p) => p.startsWith('/admin') },
  { label: 'Sign In', isActive: (p) => p.startsWith('/auth/') },
  { label: 'Search', isActive: (p) => p === '/search' },
  { label: 'Unsubscribe', isActive: (p) => p === '/newsletter/unsubscribe' },
  { label: 'Profile', isActive: (p) => /^\/[^/]+\/[^/]+$/.test(p) },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const youItem = {
    path: isAuthenticated ? '/account' : '/auth/sign-in',
    label: 'You',
    icon: User,
    isActive: (p) => p === '/account' || p.startsWith('/auth/'),
  };
  const searchItem = { path: '/search', label: 'Search', icon: Search, isActive: (p) => p === '/search' };

  const items = [...NAV_ITEMS, youItem, searchItem];
  const activeIndex = items.findIndex((item) => item.isActive(location.pathname));
  const activePos = activeIndex >= 0 ? POSITIONS[activeIndex] : null;
  const pageLabel = PAGE_LABELS.find((entry) => entry.isActive(location.pathname))?.label ?? null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="relative" style={{ height: BAR_HEIGHT }}>
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          viewBox={`0 0 390 ${BAR_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ filter: 'drop-shadow(0 -3px 7px rgba(0,0,0,.08))' }}
        >
          <defs>
            <linearGradient id="mbnGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" stopOpacity=".9" />
              <stop offset="30%" stopColor="#818cf8" stopOpacity="1" />
              <stop offset="55%" stopColor="#a855f7" stopOpacity="1" />
              <stop offset="80%" stopColor="#d946ef" stopOpacity="1" />
              <stop offset="100%" stopColor="#e879f9" stopOpacity=".9" />
            </linearGradient>
            <filter id="mbnBlur" x="-20%" y="-200%" width="140%" height="500%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>

          {/* bar shape + top rim glow, bright edge to edge */}
          <path d={`${TOP_CURVE} L390,${BAR_HEIGHT} L0,${BAR_HEIGHT} Z`} fill="#ffffff" />
          <path d={TOP_CURVE} fill="none" stroke="url(#mbnGlow)" strokeWidth="5" strokeLinecap="round" filter="url(#mbnBlur)" opacity=".5" />
          <path d={TOP_CURVE} fill="none" stroke="url(#mbnGlow)" strokeWidth="1.5" strokeLinecap="round" />

          {/* echo curve under the icons: faint always, bright segment slides to the active tab */}
          <path d={BOTTOM_CURVE} fill="none" stroke="#d4d4d4" strokeWidth="1.2" strokeLinecap="round" opacity=".3" />
          {activePos && (
            <path
              pathLength="390"
              d={BOTTOM_CURVE}
              fill="none"
              stroke="url(#mbnGlow)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeDasharray={`0 ${activePos.gapBefore} 54 9999`}
            />
          )}
        </svg>

        {items.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          const pos = POSITIONS[i];
          return (
            <Link
              key={item.label}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className="absolute w-[22px] h-[22px] -translate-x-1/2"
              style={{ left: `${pos.xPercent}%`, top: pos.top, color: active ? '#a855f7' : '#171717' }}
            >
              <Icon className="w-full h-full" />
            </Link>
          );
        })}

        {pageLabel && (
          <span
            className="absolute -translate-x-1/2 text-[10px] font-bold text-neutral-900 whitespace-nowrap"
            style={{ left: '50%', top: 54 }}
          >
            {pageLabel}
          </span>
        )}
      </div>
    </nav>
  );
}
