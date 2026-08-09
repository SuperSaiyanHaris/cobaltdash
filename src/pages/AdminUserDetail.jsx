import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, ShieldAlert, ShieldCheck, ShieldOff, Mail, CheckCircle2, Circle,
  Megaphone, Heart, FileSpreadsheet, Scale, UserPlus2, LogIn, X, Eye,
} from 'lucide-react';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { getUserDetail, suspendUser, unsuspendUser, adminCancelListing } from '../services/adminUsersService';
import { formatRelativeTime } from '../lib/utils';
import YouTubeIcon from '../components/YouTubeIcon';
import TikTokIcon from '../components/TikTokIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MusicIcon from '../components/MusicIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';

const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';

const PLATFORM_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack' };
const PLATFORM_ICONS = {
  youtube: YouTubeIcon, tiktok: TikTokIcon, twitch: TwitchIcon, kick: KickIcon, bluesky: BlueskyIcon,
  music: MusicIcon, mastodon: MastodonIcon, rumble: RumbleIcon, substack: SubstackIcon,
};

function Section({ title, subtitle, count, children }) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-base font-medium text-neutral-900">{title}{typeof count === 'number' ? ` (${count})` : ''}</h2>
      </div>
      {subtitle && <p className="text-sm text-neutral-500 mb-5">{subtitle}</p>}
      {children}
    </div>
  );
}

function EmptyNote({ children }) {
  return <p className="text-sm text-neutral-400 py-4">{children}</p>;
}

// Merges every real, timestamped thing we know about this account into one
// chronological feed. This is NOT a security audit trail — there's no login
// history or IP logging infrastructure in this app, only the fields below,
// all sourced straight from existing tables.
function buildActivity(detail) {
  if (!detail) return [];
  const events = [];

  events.push({
    key: 'account-created',
    at: detail.user.createdAt,
    icon: UserPlus2,
    color: 'text-indigo-600 bg-indigo-50',
    label: 'Account created',
  });

  if (detail.user.lastSignInAt) {
    events.push({
      key: 'last-sign-in',
      at: detail.user.lastSignInAt,
      icon: LogIn,
      color: 'text-neutral-600 bg-neutral-100',
      label: 'Last signed in',
    });
  }

  for (const l of detail.listings) {
    const name = l.creators?.display_name || l.creators?.username || 'a creator';
    events.push({
      key: `listing-${l.id}`,
      at: l.created_at,
      icon: Megaphone,
      color: 'text-amber-600 bg-amber-50',
      label: `Bought a ${l.placement_tier === 'premium' ? 'Premium' : 'Basic'} listing for ${name} on ${PLATFORM_LABELS[l.platform] || l.platform}`,
    });
  }

  for (const f of detail.follows) {
    const name = f.creators?.display_name || f.creators?.username || 'a creator';
    events.push({
      key: `follow-${f.id}`,
      at: f.created_at,
      icon: Heart,
      color: 'text-rose-600 bg-rose-50',
      label: `Followed ${name} on ${PLATFORM_LABELS[f.creators?.platform] || f.creators?.platform || ''}`,
    });
  }

  for (const r of detail.savedReports) {
    events.push({
      key: `report-${r.id}`,
      at: r.created_at,
      icon: FileSpreadsheet,
      color: 'text-sky-600 bg-sky-50',
      label: `Saved a report: "${r.name}"`,
    });
  }

  for (const c of detail.savedCompares) {
    events.push({
      key: `compare-${c.id}`,
      at: c.created_at,
      icon: Scale,
      color: 'text-violet-600 bg-violet-50',
      label: `Saved a comparison: "${c.name}"`,
    });
  }

  for (const req of detail.creatorRequests) {
    events.push({
      key: `request-${req.id}`,
      at: req.created_at,
      icon: UserPlus2,
      color: 'text-emerald-600 bg-emerald-50',
      label: `Requested TikTok creator @${req.username}`,
    });
    if (req.processed_at) {
      events.push({
        key: `request-processed-${req.id}`,
        at: req.processed_at,
        icon: CheckCircle2,
        color: 'text-neutral-600 bg-neutral-100',
        label: `Request for @${req.username} ${req.status === 'failed' ? 'failed' : 'was processed'}`,
      });
    }
  }

  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const { user, authLoading, isAdmin, adminChecked } = useAdminAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [suspending, setSuspending] = useState(false);
  const [cancelingId, setCancelingId] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    getUserDetail(id)
      .then(setDetail)
      .catch(() => setError('Failed to load this user.'))
      .finally(() => setLoading(false));
  }, [id, isAdmin]);

  const activity = useMemo(() => buildActivity(detail), [detail]);

  async function handleToggleSuspend() {
    if (!detail) return;
    setSuspending(true);
    try {
      const result = detail.user.isSuspended ? await unsuspendUser(id) : await suspendUser(id);
      setDetail(prev => ({ ...prev, user: { ...prev.user, isSuspended: result.isSuspended, bannedUntil: result.bannedUntil } }));
      toast.success(result.isSuspended ? 'User suspended' : 'User unsuspended');
    } catch (err) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSuspending(false);
    }
  }

  async function handleCancelListing(listingId) {
    setCancelingId(listingId);
    try {
      await adminCancelListing(listingId);
      setDetail(prev => ({
        ...prev,
        listings: prev.listings.map(l => l.id === listingId ? { ...l, status: 'canceled' } : l),
      }));
      toast.success('Listing canceled');
    } catch (err) {
      toast.error(err.message || 'Failed to cancel listing');
    } finally {
      setCancelingId(null);
    }
  }

  if (authLoading || (!user && !adminChecked) || !adminChecked) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Admin" noindex />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
        <SEO title="Admin" noindex />
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
          <p className="text-neutral-500 mb-6">You don't have permission to access this page.</p>
          <Link to="/" className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-lg hover:bg-neutral-800 transition-colors">Go Home</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <SEO title="Admin" noindex />
        <Loader2 className="w-6 h-6 text-neutral-300 animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
        <SEO title="User not found" noindex />
        <div className="text-center">
          <ShieldAlert className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">{error || 'User not found'}</h1>
          <Link to="/admin?tab=users" className="text-indigo-600 hover:text-indigo-700 text-sm">Back to Users</Link>
        </div>
      </div>
    );
  }

  const u = detail.user;
  const activeListings = detail.listings.filter(l => l.status === 'active');

  return (
    <>
      <SEO title={u.displayName || u.email} noindex />

      <div className="min-h-screen bg-[#fafaf9]">
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Link to="/admin?tab=users" className="inline-flex items-center gap-1.5 px-3 py-1 -ml-3 mb-3 rounded-full text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Users
            </Link>
            <p className={`${MICRO} mb-2`}>Admin &middot; User</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">{u.displayName || 'No name set'}</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">

          {/* Identity card */}
          <div className={`${CARD} p-5 sm:p-6 flex items-center flex-wrap gap-4`}>
            <CreatorAvatar src={u.avatarUrl} name={u.displayName || u.email} size="lg" rounded="rounded-full" className="!w-14 !h-14" />
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-neutral-900 text-base truncate">{u.displayName || 'No name set'}</p>
                {u.isSuspended && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-red-50 text-red-600 flex-shrink-0">
                    <ShieldAlert className="w-3 h-3" />
                    Suspended
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-400 mt-0.5 flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate min-w-0 flex-1">{u.email}</span>
                {u.emailConfirmedAt ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" title="Email verified" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" title="Email not verified" />
                )}
              </p>
            </div>
            <div className="flex items-center gap-6 pl-2 sm:pl-5 sm:border-l sm:border-neutral-200/80 flex-shrink-0">
              <div>
                <p className={MICRO}>Joined</p>
                <p className="text-sm font-medium text-neutral-700 mt-1">{formatRelativeTime(u.createdAt)}</p>
              </div>
              <div>
                <p className={MICRO}>Last active</p>
                <p className="text-sm font-medium text-neutral-700 mt-1">{u.lastSignInAt ? formatRelativeTime(u.lastSignInAt) : 'Never'}</p>
              </div>
            </div>
            <button
              onClick={handleToggleSuspend}
              disabled={suspending}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                u.isSuspended
                  ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  : 'bg-white border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              {suspending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : u.isSuspended ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
              {u.isSuspended ? 'Unsuspend' : 'Suspend'}
            </button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-neutral-100 border border-neutral-200/80 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3.5">
              <p className={MICRO}>Active listings</p>
              <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{activeListings.length}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className={MICRO}>Following</p>
              <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{detail.follows.length}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className={MICRO}>Saved reports</p>
              <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{detail.savedReports.length}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className={MICRO}>Saved compares</p>
              <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{detail.savedCompares.length}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className={MICRO}>Creator requests</p>
              <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{detail.creatorRequests.length}</p>
            </div>
          </div>

          {/* Featured listings */}
          <Section title="Featured Listings" count={detail.listings.length}>
            {detail.listings.length === 0 ? (
              <EmptyNote>No featured listings purchased.</EmptyNote>
            ) : (
              <div className="border border-neutral-200/80 rounded-lg divide-y divide-neutral-100 overflow-hidden">
                {detail.listings.map(l => {
                  const c = l.creators;
                  const isActive = l.status === 'active';
                  const until = l.active_until ? new Date(l.active_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
                  return (
                    <div key={l.id} className="flex items-center gap-3 px-3.5 py-3">
                      <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="md" rounded="rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {PLATFORM_LABELS[l.platform] || l.platform} &middot; {l.placement_tier === 'premium' ? 'Premium' : 'Basic'}
                          {until && isActive ? ` · until ${until}` : ''}
                          {l.is_mod_free ? ' · promotional' : ''}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                        <span className={`text-[10px] font-medium uppercase tracking-[0.1em] ${isActive ? 'text-emerald-600' : 'text-neutral-400'}`}>{l.status}</span>
                      </span>
                      {isActive && (
                        <>
                          <Link
                            to={`/rankings/${l.platform}#listing-${l.id}`}
                            className="p-1.5 text-neutral-300 hover:text-neutral-700 transition-colors flex-shrink-0"
                            title="View in rankings"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleCancelListing(l.id)}
                            disabled={cancelingId === l.id}
                            className="p-1.5 text-neutral-300 hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-50"
                            title="Cancel listing"
                          >
                            {cancelingId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Followed creators */}
          <Section title="Following" count={detail.follows.length}>
            {detail.follows.length === 0 ? (
              <EmptyNote>Not following any creators.</EmptyNote>
            ) : (
              <div className="max-h-80 overflow-y-auto border border-neutral-200/80 rounded-lg divide-y divide-neutral-100">
                {detail.follows.map(f => {
                  const c = f.creators;
                  const Icon = c?.platform ? PLATFORM_ICONS[c.platform] : null;
                  return (
                    <Link
                      key={f.id}
                      to={c ? `/${c.platform}/${c.username}` : '#'}
                      className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-neutral-50 transition-colors"
                    >
                      <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="sm" rounded="rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</p>
                      </div>
                      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                      <p className="text-xs text-neutral-400 flex-shrink-0">{formatRelativeTime(f.created_at)}</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Saved reports + compares, side by side */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Section title="Saved Reports" count={detail.savedReports.length}>
              {detail.savedReports.length === 0 ? (
                <EmptyNote>No saved reports.</EmptyNote>
              ) : (
                <div className="space-y-2.5">
                  {detail.savedReports.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="text-neutral-900 truncate min-w-0 flex-1">{r.name}</span>
                      <span className="text-xs text-neutral-400 flex-shrink-0">{formatRelativeTime(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title="Saved Comparisons" count={detail.savedCompares.length}>
              {detail.savedCompares.length === 0 ? (
                <EmptyNote>No saved comparisons.</EmptyNote>
              ) : (
                <div className="space-y-2.5">
                  {detail.savedCompares.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="text-neutral-900 truncate min-w-0 flex-1">{c.name}</span>
                      <span className="text-xs text-neutral-400 flex-shrink-0">{formatRelativeTime(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Creator requests */}
          <Section title="Creator Requests" count={detail.creatorRequests.length}>
            {detail.creatorRequests.length === 0 ? (
              <EmptyNote>No creator requests submitted.</EmptyNote>
            ) : (
              <div className="border border-neutral-200/80 rounded-lg divide-y divide-neutral-100 overflow-hidden">
                {detail.creatorRequests.map(req => (
                  <div key={req.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-900 truncate">@{req.username} <span className="text-neutral-400">&middot; {PLATFORM_LABELS[req.platform] || req.platform}</span></p>
                    </div>
                    <span className={`text-[10px] font-medium uppercase tracking-[0.1em] flex-shrink-0 ${
                      req.status === 'completed' ? 'text-emerald-600' : req.status === 'failed' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {req.status}
                    </span>
                    <span className="text-xs text-neutral-400 flex-shrink-0 w-20 text-right">{formatRelativeTime(req.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Activity timeline — real events only, not a security/login audit trail */}
          <Section title="Activity" subtitle="Real account activity across the site, most recent first.">
            {activity.length === 0 ? (
              <EmptyNote>No activity yet.</EmptyNote>
            ) : (
              <div className="space-y-0.5">
                {activity.map(ev => {
                  const Icon = ev.icon;
                  return (
                    <div key={ev.key} className="flex items-center gap-3 py-2">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${ev.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <p className="text-sm text-neutral-700 flex-1 min-w-0">{ev.label}</p>
                      <p className="text-xs text-neutral-400 flex-shrink-0">{formatRelativeTime(ev.at)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

        </div>
      </div>
    </>
  );
}
