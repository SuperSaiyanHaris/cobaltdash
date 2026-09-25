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

      <section className="relative isolate bg-[#0a0a0f] text-white min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />
        <div className="relative text-center max-w-lg mx-auto">
          <img
            src="/card-back.svg"
            alt=""
            width="250"
            height="350"
            className="mx-auto w-[130px] sm:w-[160px] h-auto rounded-[6.4%/4.571%] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] -rotate-6 opacity-90"
          />
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Error 404</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">This card doesn&apos;t exist.</h1>
          <p className="mt-4 text-base text-white/75">
            The page you&apos;re after isn&apos;t here. Search for a creator or jump to one of these.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-2.5 max-w-sm mx-auto">
            {QUICK_LINKS.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/15 bg-white/[0.06] hover:border-white/50 text-sm font-semibold text-white transition-colors"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <Link
            to="/search"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold rounded-xl transition-colors"
          >
            <Search className="w-4 h-4" />
            Search for a creator
          </Link>
        </div>
      </section>
    </>
  );
}
