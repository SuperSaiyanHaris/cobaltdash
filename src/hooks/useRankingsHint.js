import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Whether to show the "try Rankings" attention pulse on the nav icon.
// True only until the visitor has ever actually landed on /rankings (by any
// route — clicking the hinted link, a card elsewhere, a direct URL), then
// permanently false. Read by both Header.jsx's desktop pill and
// MobileBottomNav.jsx's icon; each call is independent but they converge on
// the same localStorage flag, so visiting Rankings from either clears both.
const STORAGE_KEY = 'sp_rankings_seen';

export default function useRankingsHint() {
  const location = useLocation();
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return false; // storage inaccessible (private mode etc.) — fail quiet, not noisy
    }
  });

  useEffect(() => {
    if (visible && location.pathname.startsWith('/rankings')) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore — worst case the hint reappears next session
      }
      setVisible(false);
    }
  }, [location.pathname, visible]);

  return visible;
}
