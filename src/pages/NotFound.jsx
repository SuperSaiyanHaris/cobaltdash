import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { Home, Search, ChartNoAxesColumnIncreasing, TrendingUp } from 'lucide-react';

const QUICK_LINKS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/search', icon: Search, label: 'Search creators' },
  { to: '/rankings', icon: ChartNoAxesColumnIncreasing, label: 'Rankings' },
  { to: '/trending', icon: TrendingUp, label: 'Trending' },
];

export default function NotFound() {
  return (
    <>
      <SEO
        title="Page Not Found"
        description="The page you're looking for doesn't exist. Search for a creator or browse our rankings."
      />

      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
        <div className="text-center max-w-lg mx-auto">
          <p className="text-7xl sm:text-8xl font-semibold text-neutral-200 tabular-nums select-none leading-none mb-6">404</p>

          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 mb-3">Page not found</h1>
          <p className="text-sm text-neutral-500 mb-10">
            This page doesn't exist. Try searching for a creator or head back to a page that does.
          </p>

          <div className="grid grid-cols-2 gap-2.5 max-w-xs mx-auto mb-10">
            {QUICK_LINKS.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-3 bg-white border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] rounded-lg text-neutral-600 hover:text-neutral-900 hover:border-neutral-300 transition-colors text-sm font-medium"
              >
                <Icon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" />
            Search for a creator
          </Link>
        </div>
      </div>
    </>
  );
}
