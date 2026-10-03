// True at the desktop breakpoint (lg). Phones show one ShinyPass section at a
// time, so the others are not mounted at all there.
import { useEffect, useState } from 'react';

const Q = '(min-width: 1024px)';

export default function useDesktop() {
  const [on, setOn] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(Q).matches));
  useEffect(() => {
    const m = window.matchMedia(Q);
    const fn = () => setOn(m.matches);
    m.addEventListener?.('change', fn);
    return () => m.removeEventListener?.('change', fn);
  }, []);
  return on;
}
