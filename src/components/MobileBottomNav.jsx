import { Link, useLocation } from 'react-router-dom';
import { Trophy, Scale, LayoutDashboard, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Global mobile tab bar — the 3 primary destinations plus account, always
// reachable with one tap instead of two (menu, then item). Desktop keeps its
// own center pill nav (Header.jsx's CENTER_NAV); this is the mobile-only
// equivalent, so keep the two lists in sync if a primary destination changes.
const NAV_ITEMS = [
  { path: '/rankings', label: 'Rankings', icon: Trophy, isActive: (p) => p.startsWith('/rankings') },
  { path: '/compare', label: 'Compare', icon: Scale, isActive: (p) => p === '/compare' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, isActive: (p) => p === '/dashboard' },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const youItem = {
    path: isAuthenticated ? '/account' : '/auth/sign-in',
    label: 'You',
    icon: User,
    isActive: (p) => p === '/account' || p.startsWith('/auth/'),
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="grid grid-cols-4 h-14">
        {[...NAV_ITEMS, youItem].map(({ path, label, icon: Icon, isActive }) => {
          const active = isActive(location.pathname);
          return (
            <Link
              key={label}
              to={path}
              className="flex flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-neutral-900' : 'text-neutral-400'}`} />
              <span className={`text-[10px] leading-none ${active ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-400'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
