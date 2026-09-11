import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { useMobileNav, PILL_HEIGHT, PILL_MARGIN_BOTTOM, ORB_SIZE, PILL_NOTCH_PROTRUSION } from '../contexts/MobileNavContext';

/**
 * BackToTop - Floating button that appears when scrolling down
 * Scrolls smoothly to top of page when clicked
 *
 * When the mobile bottom nav is present, this has to react to its
 * collapsed/expanded state, not just a fixed height — the floating pill
 * and the collapsed orb have very different footprints (2026-09-11). Sits
 * clear above the pill's own top edge (notch included) while expanded,
 * and drops back down near the actual bottom-right corner once the orb
 * takes over, since a tiny centered circle doesn't need anything cleared
 * on the right side at all.
 */
export default function BackToTop({ hasBottomNav = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const { collapsed } = useMobileNav();

  useEffect(() => {
    const toggleVisibility = () => {
      // Show button when page is scrolled down 300px
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);

    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const expandedBottom = PILL_MARGIN_BOTTOM + PILL_HEIGHT + PILL_NOTCH_PROTRUSION + 14; // 14px clearance above the notch
  const collapsedBottom = PILL_MARGIN_BOTTOM + ORB_SIZE / 2; // orb is small + centered, no need to clear the right side

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className={`fixed right-4 md:bottom-8 md:right-8 z-50 p-2.5 md:p-3.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full shadow-lg shadow-black/10 transition-[bottom] duration-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${!hasBottomNav ? 'bottom-4' : ''}`}
          style={
            hasBottomNav
              ? { bottom: `calc(env(safe-area-inset-bottom) + ${collapsed ? collapsedBottom : expandedBottom}px)` }
              : undefined
          }
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      )}
    </>
  );
}
