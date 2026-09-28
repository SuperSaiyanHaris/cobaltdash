import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * BackToTop - Floating button that appears when scrolling down.
 * Scrolls smoothly to the top of the page when clicked.
 */
export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => setIsVisible(window.scrollY > 300);
    window.addEventListener('scroll', toggleVisibility, { passive: true });
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  if (!isVisible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] md:bottom-8 md:right-8 z-50 p-2.5 md:p-3.5 bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-200 rounded-full shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
      aria-label="Back to top"
    >
      <ArrowUp className="w-5 h-5 md:w-6 md:h-6" />
    </button>
  );
}
