import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * BackToTop - Floating button that appears when scrolling down
 * Scrolls smoothly to top of page when clicked
 */
export default function BackToTop({ hasBottomNav = false }) {
  const [isVisible, setIsVisible] = useState(false);

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

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          className={`fixed right-4 md:bottom-8 md:right-8 z-50 p-2.5 md:p-3.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full shadow-lg shadow-black/10 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
            hasBottomNav ? 'bottom-[calc(92px+env(safe-area-inset-bottom)+1rem)]' : 'bottom-4'
          }`}
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      )}
    </>
  );
}
