import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Scale, ChartNoAxesColumnIncreasing, BookOpen, Search, ChevronUp, ChevronDown } from 'lucide-react';
import useRankingsHint from '../hooks/useRankingsHint';

// Global mobile tab bar — floating pill, redesigned 2026-09-11.
//
// The previous version was a full-width bar with a decorative SVG wave cut
// into its top-center. From a distance the "curve" read fine, but the fill
// shape was still a solid rectangle everywhere except that one dip — near
// the edge icons (Dashboard, Search) it was full height, full opacity,
// with real page content hidden behind it the whole time. Two rounds of
// user feedback ("white background on the sides", "how did you not fix
// this") both trace back to that same structural fact: there was no page
// content to reveal at the sides because the bar was never actually
// trimmed there, just decorated on top.
//
// Fix: stop trying to carve transparency out of a rectangle and use a
// shape that's opaque by construction only where it needs to be. This bar
// doesn't reach the screen edges at all — PILL_MARGIN_X of real page is
// visible on both sides and PILL_MARGIN_BOTTOM below, by construction, not
// by curve math. Nothing to "trim precisely" because there's nothing
// there to begin with.
const ICON_SIZE = 22;
const PILL_HEIGHT = 68;
const PILL_MARGIN_X = 14; // gap from each screen edge — page shows through here
const PILL_MARGIN_BOTTOM = 10; // floating gap above the safe area
const ORB_SIZE = 48;
const GRADIENT = 'linear-gradient(135deg,#6366f1,#a855f7,#e879f9)';
// One spring used for every layout/shape morph in this file (pill<->orb,
// the sliding active-tab pill) so every motion in the bar feels like part
// of the same physical object, not a grab-bag of separately-tuned easings.
const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 };

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: (p) => p === '/dashboard' },
  { path: '/compare', label: 'Compare', icon: Scale, isActive: (p) => p === '/compare' },
  { path: '/rankings', label: 'Rankings', icon: ChartNoAxesColumnIncreasing, isActive: (p) => p.startsWith('/rankings') },
  { path: '/blog', label: 'Blog', icon: BookOpen, isActive: (p) => p.startsWith('/blog') },
  { path: '/search', label: 'Search', icon: Search, isActive: (p) => p === '/search' },
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
  const showRankingsHint = useRankingsHint();
  const [collapsed, setCollapsed] = useState(false);

  const items = NAV_ITEMS;
  const activeIndex = items.findIndex((item) => item.isActive(location.pathname));
  const pageLabel = PAGE_LABELS.find((entry) => entry.isActive(location.pathname))?.label ?? null;

  return (
    // pointer-events-none on the full-width wrapper + pointer-events-auto on
    // the pill itself: the wrapper still spans the viewport (so flex can
    // center the pill/orb), but its transparent margins must let taps and
    // scrolls on the page underneath through, not swallow them.
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none"
      style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${PILL_MARGIN_BOTTOM}px)` }}
      aria-label="Primary"
    >
      <motion.div
        layout
        layoutId="mobileNavShape"
        transition={SPRING}
        className="relative bg-white pointer-events-auto"
        style={{
          width: collapsed ? ORB_SIZE : `calc(100% - ${PILL_MARGIN_X * 2}px)`,
          height: collapsed ? ORB_SIZE : PILL_HEIGHT,
        }}
        animate={{
          borderRadius: collapsed ? ORB_SIZE / 2 : 26,
          boxShadow: collapsed
            ? '0 10px 24px -6px rgba(99,102,241,.45), 0 2px 8px rgba(0,0,0,.12)'
            : '0 8px 24px -8px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.06)',
        }}
      >
        {/* Gradient fill, opacity-toggled — lives on its own layer so the
            pill's own background can stay a plain white that never needs to
            interpolate between a solid color and a gradient (browsers/Motion
            can't tween between those value shapes, it would just snap). */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: GRADIENT, borderRadius: 'inherit' }}
          initial={false}
          animate={{ opacity: collapsed ? 1 : 0 }}
          transition={{ duration: 0.18 }}
        />

        <AnimatePresence initial={false}>
          {collapsed ? (
            <motion.button
              key="orb"
              type="button"
              aria-label="Show navigation"
              onClick={() => setCollapsed(false)}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <ChevronUp className="w-5 h-5 text-white" strokeWidth={2.5} />
            </motion.button>
          ) : (
            <motion.div
              key="pill-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.07 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            >
              <div className="flex items-center gap-5">
                {items.map((item, i) => {
                  const active = i === activeIndex;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      aria-current={active ? 'page' : undefined}
                      aria-label={item.label}
                      className="relative flex items-center justify-center"
                      style={{ width: 38, height: 38 }}
                    >
                      {active && (
                        <motion.span
                          layoutId="activeTabPill"
                          transition={SPRING}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-full bg-neutral-900"
                        />
                      )}
                      <Icon
                        className="relative"
                        style={{ width: ICON_SIZE, height: ICON_SIZE, color: active ? '#ffffff' : '#171717' }}
                      />
                      {/* First-visit attention ping — Rankings only, gone for
                          good once the visitor has ever landed on /rankings. */}
                      {item.path === '/rankings' && showRankingsHint && (
                        <span aria-hidden="true" className="absolute top-0 right-0 flex h-2 w-2">
                          <span
                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-80"
                            style={{ background: GRADIENT }}
                          />
                          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#a855f7' }} />
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {pageLabel && (
                <span className="text-[10.5px] font-bold text-neutral-400 uppercase tracking-wide">
                  {pageLabel}
                </span>
              )}

              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Hide navigation"
                className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center bg-white rounded-full"
                style={{ width: 26, height: 26, boxShadow: '0 2px 6px rgba(0,0,0,.1)' }}
              >
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </nav>
  );
}
