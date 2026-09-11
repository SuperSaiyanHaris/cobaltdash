import { createContext, useContext, useState } from 'react';

// Shared collapsed/expanded state for the floating mobile bottom nav
// (MobileBottomNav.jsx). Needs to live above both consumers — BackToTop
// reads it to reposition itself relative to the pill vs. the collapsed
// orb, since those have very different footprints and BackToTop can't
// know which one is on screen from a static height constant anymore.
//
// The size constants live here too, not in MobileBottomNav.jsx, so both
// components read the exact same numbers instead of BackToTop guessing at
// a second copy that can silently drift out of sync with the real pill.
export const PILL_HEIGHT = 68;
export const PILL_MARGIN_BOTTOM = 10; // floating gap above the safe area
export const ORB_SIZE = 48;
// The little collapse-trigger notch sits 12px above the pill's own top
// edge (see the -top-3 button in MobileBottomNav) — anything stacking
// "above the pill" needs to clear this too, not just PILL_HEIGHT.
export const PILL_NOTCH_PROTRUSION = 12;

const MobileNavContext = createContext(null);

export function MobileNavProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <MobileNavContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  // Falls back to a harmless local default outside the provider (e.g. the
  // share route, which never mounts MobileBottomNav) so nothing throws.
  return ctx ?? { collapsed: false, setCollapsed: () => {} };
}
