import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, AlertCircle, Users as UsersIcon, ShieldAlert, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { getUsers } from '../../services/adminUsersService';
import { formatRelativeTime } from '../../lib/utils';
import CreatorAvatar from '../CreatorAvatar';

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';

function GrowthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-lg p-3">
      <p className="text-sm font-medium text-neutral-900 mb-1">{point.dateLabel}</p>
      <p className="text-sm text-indigo-600">{point.total} total user{point.total === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function UsersPanel() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('joined');

  useEffect(() => {
    getUsers()
      .then(data => setUsers(data.users || []))
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      total: users.length,
      newThisWeek: users.filter(u => new Date(u.createdAt).getTime() >= weekAgo).length,
      suspended: users.filter(u => u.isSuspended).length,
      activeListings: users.reduce((sum, u) => sum + u.activeListingsCount, 0),
    };
  }, [users]);

  // Cumulative signups over time — reads clearly even with a handful of
  // users, where a "new signups per day" bar chart would be mostly empty.
  const growthData = useMemo(() => {
    if (users.length === 0) return [];
    const sorted = [...users].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return sorted.map((u, i) => ({
      total: i + 1,
      dateLabel: new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }));
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (q) {
      list = list.filter(u =>
        u.email?.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'joined') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'active') return new Date(b.lastSignInAt || 0) - new Date(a.lastSignInAt || 0);
      if (sortBy === 'listings') return b.activeListingsCount - a.activeListingsCount;
      return 0;
    });
  }, [users, search, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-neutral-100 border border-neutral-200/80 rounded-xl overflow-hidden bg-white">
        <div className="px-4 py-3.5">
          <p className={MICRO}>Total users</p>
          <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{stats.total}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className={MICRO}>New this week</p>
          <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{stats.newThisWeek}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className={MICRO}>Active listings</p>
          <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{stats.activeListings}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className={MICRO}>Suspended</p>
          <p className={`text-lg font-semibold tabular-nums mt-0.5 ${stats.suspended > 0 ? 'text-red-600' : 'text-neutral-900'}`}>{stats.suspended}</p>
        </div>
      </div>

      {/* Growth chart */}
      {growthData.length >= 2 && (
        <div className={`${CARD} p-5`}>
          <p className={`${MICRO} mb-3`}>Total users over time</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="userGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fill: '#737373', fontSize: 11 }} interval="preserveStartEnd" minTickGap={60} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#737373', fontSize: 11 }} width={28} allowDecimals={false} />
                <Tooltip content={<GrowthTooltip />} />
                <Area
                  type="stepAfter"
                  dataKey="total"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fill="url(#userGrowthGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[{ id: 'joined', label: 'Joined' }, { id: 'active', label: 'Last active' }, { id: 'listings', label: 'Listings' }].map(opt => (
            <button
              key={opt.id}
              onClick={() => setSortBy(opt.id)}
              className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors border ${
                sortBy === opt.id
                  ? 'bg-neutral-900 border-neutral-900 text-white'
                  : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className={`${CARD} p-12 text-center`}>
          <UsersIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            {users.length === 0 ? 'No users yet' : 'No matches'}
          </h3>
          <p className="text-neutral-500">
            {users.length === 0 ? 'Accounts will show up here as people sign up.' : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-neutral-100 overflow-hidden`}>
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => navigate(`/admin/users/${u.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-50 transition-colors text-left"
            >
              <CreatorAvatar src={u.avatarUrl} name={u.displayName || u.email} size="md" rounded="rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 truncate">{u.displayName || 'No name set'}</p>
                <p className="text-xs text-neutral-400 truncate mt-0.5">{u.email}</p>
              </div>
              <div className="hidden sm:block text-right flex-shrink-0">
                <p className="text-xs text-neutral-500">Joined {formatRelativeTime(u.createdAt)}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {u.lastSignInAt ? `Active ${formatRelativeTime(u.lastSignInAt)}` : 'Never signed in'}
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end flex-shrink-0 w-20">
                <p className="text-sm font-medium text-neutral-900 tabular-nums">{u.activeListingsCount}</p>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wide">listings</p>
              </div>
              {u.isSuspended ? (
                <span className="inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">
                  <ShieldAlert className="w-3 h-3" />
                  Suspended
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
