import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { Home, Search, Trophy, TrendingUp } from 'lucide-react';

const QUICK_LINKS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/search', icon: Search, label: 'Search creators' },
  { to: '/rankings', icon: Trophy, label: 'Rankings' },
  { to: '/trending', icon: TrendingUp, label: 'Trending' },
];

export default function NotFound() {
  return (
    <>
      <SEO
        title="Page Not Found"
        description="The page you're looking for doesn't exist. Search for a creator or browse our rankings."
      />

      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
        <div className="text-center max-w-lg mx-auto">
          <p className="text-8xl font-black text-gray-800 select-none leading-none mb-6">404</p>

          <h1 className="text-2xl font-extrabold text-neutral-900 mb-3">Page not found</h1>
          <p className="text-neutral-500 mb-10">
            This page doesn't exist. Try searching for a creator or head back to a page that does.
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto mb-10">
            {QUICK_LINKS.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-700 hover:text-white hover:border-indigo-500/50 hover:bg-neutral-100 transition-all text-sm font-medium"
              >
                <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl transition-colors"
          >
            <Search className="w-4 h-4" />
            Search for a creator
          </Link>
        </div>
      </div>
    </>
  );
}
