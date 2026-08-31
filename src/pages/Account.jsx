import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  User, Mail, Lock, Calendar, Star,
  Eye, EyeOff, ArrowLeft, ExternalLink, Megaphone,
  X, Search, Loader, LogOut, Shield, ChevronRight, Plus, MoreVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getFollowedCreators } from '../services/followService';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';
import YouTubeIcon from '../components/YouTubeIcon';
import TikTokIcon from '../components/TikTokIcon';
import TwitchIcon from '../components/TwitchIcon';
import KickIcon from '../components/KickIcon';
import BlueskyIcon from '../components/BlueskyIcon';
import MusicIcon from '../components/MusicIcon';
import MastodonIcon from '../components/MastodonIcon';
import RumbleIcon from '../components/RumbleIcon';
import SubstackIcon from '../components/SubstackIcon';

const TABS = [
  { id: 'listings', label: 'Listings', icon: Megaphone },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

const LISTING_PLATFORMS = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];
const TIER_PRICE = { basic: 49, premium: 149 };
const PLATFORM_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack' };
const PLATFORM_ICONS = {
  youtube: YouTubeIcon, tiktok: TikTokIcon, twitch: TwitchIcon, kick: KickIcon, bluesky: BlueskyIcon,
  music: MusicIcon, mastodon: MastodonIcon, rumble: RumbleIcon, substack: SubstackIcon,
};

// Typographic backbone shared with the dashboard
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const INPUT = 'bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 text-sm transition-colors';

export default function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return TABS.some(t => t.id === tab) ? tab : 'listings';
  });

  // Display name
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);


  // Stats
  const [followCount, setFollowCount] = useState(null);

  // Featured listings
  const [featuredListings, setFeaturedListings] = useState([]);
  const [openListingActionsId, setOpenListingActionsId] = useState(null);
  const [showListingDialog, setShowListingDialog] = useState(false);
  const [listingPlatform, setListingPlatform] = useState('youtube');
  const [listingQuery, setListingQuery] = useState('');
  const [listingResults, setListingResults] = useState([]);
  const [listingSearching, setListingSearching] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [alreadyListed, setAlreadyListed] = useState(false);
  const [purchasingListing, setPurchasingListing] = useState(false);
  const [purchasingPremiumListing, setPurchasingPremiumListing] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const [premiumSlotsLeft, setPremiumSlotsLeft] = useState(2);
  // Exact next-open-slot rank for this platform, computed when a creator is
  // selected — shown in the confirm step below so a buyer knows their real
  // placement (e.g. rank #485) before paying, not just the generic "15, 20,
  // 25..." pattern. null while the count is still loading.
  const [nextBasicRank, setNextBasicRank] = useState(null);
  const [nextPremiumRank, setNextPremiumRank] = useState(null);
  const [pendingTier, setPendingTier] = useState(null); // 'basic' | 'premium' | null — confirm-step gate before Stripe
  const [tikTokAdding, setTikTokAdding] = useState(false);
  const [tikTokAddError, setTikTokAddError] = useState('');

  const loadFeaturedListings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('featured_listings')
      .select('id, platform, placement_tier, status, cancel_at_period_end, active_from, active_until, is_mod_free, created_at, creators(display_name, username, profile_image, platform)')
      .eq('purchased_by_user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    setFeaturedListings(data || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.user_metadata?.display_name || '');
    getFollowedCreators(user.id).then(list => setFollowCount(list.length)).catch(() => {});
    loadFeaturedListings();
  }, [user, loadFeaturedListings]);

  // Post-payment: refresh listings after Stripe redirects back from featured listing checkout
  useEffect(() => {
    const isFeatured = searchParams.get('featured') === 'success';
    if (!isFeatured) return;

    window.history.replaceState({}, '', '/account');
    setTimeout(() => {
      loadFeaturedListings();
      setActiveTab('listings');
      toast.success('Featured listing activated', { description: 'Your creator will appear in rankings shortly.' });
    }, 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced creator search for listings
  useEffect(() => {
    if (!listingQuery.trim() || listingQuery.length < 2 || selectedCreator) {
      if (!selectedCreator) setListingResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setListingSearching(true);
      try {
        const q = listingQuery.trim();
        const { data } = await supabase
          .from('creators')
          .select('id, username, display_name, profile_image, platform')
          .eq('platform', listingPlatform)
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(6);
        setListingResults(data || []);
      } catch {
        setListingResults([]);
      } finally {
        setListingSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [listingQuery, listingPlatform, selectedCreator]);

  // Close the "Add a listing" dialog on Escape, and lock page scroll while it's open
  useEffect(() => {
    if (!showListingDialog) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowListingDialog(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [showListingDialog]);

  const resetListingSearch = () => {
    setSelectedCreator(null);
    setListingQuery('');
    setListingResults([]);
    setAlreadyListed(false);
    setTikTokAddError('');
    setNextBasicRank(null);
    setNextPremiumRank(null);
    setPendingTier(null);
  };

  const openListingDialog = () => {
    resetListingSearch();
    setShowListingDialog(true);
  };

  const selectListingPlatform = (p) => {
    setListingPlatform(p);
    resetListingSearch();
  };

  const handleSelectCreator = async (creator) => {
    setSelectedCreator(creator);
    setListingQuery(creator.display_name || creator.username);
    setListingResults([]);
    setAlreadyListed(false);
    setPremiumSlotsLeft(2);
    setNextBasicRank(null);
    setNextPremiumRank(null);
    setPendingTier(null);
    const now = new Date().toISOString();
    // Pull every active listing for this platform in one query and bucket it
    // the same way Rankings.jsx does (placement_tier !== 'premium' counts as
    // basic) so the estimate here matches what actually renders on /rankings.
    const [{ data: existing }, { data: platformListings }] = await Promise.all([
      supabase.from('featured_listings').select('id')
        .eq('creator_id', creator.id).eq('status', 'active').gt('active_until', now).limit(1),
      supabase.from('featured_listings').select('id, placement_tier')
        .eq('platform', creator.platform).eq('status', 'active').gt('active_until', now),
    ]);
    setAlreadyListed(!!(existing && existing.length > 0));
    const listings = platformListings || [];
    const premiumCount = listings.filter(l => l.placement_tier === 'premium').length;
    const basicCount = listings.length - premiumCount;
    setPremiumSlotsLeft(Math.max(0, 2 - premiumCount));
    // Basic slots land at organic rank 15, 20, 25... (Rankings.jsx); premium
    // lands at rank 5 for the first active listing, rank 10 for the second.
    setNextBasicRank(15 + basicCount * 5);
    setNextPremiumRank(premiumCount === 0 ? 5 : premiumCount === 1 ? 10 : null);
  };

  const handleTikTokInstantAdd = async () => {
    if (!listingQuery.trim()) return;
    setTikTokAdding(true);
    setTikTokAddError('');
    try {
      const res = await fetch('/api/request-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'tiktok', username: listingQuery.trim(), instant: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not find that TikTok account.');
      if (data.creator) await handleSelectCreator(data.creator);
    } catch (err) {
      setTikTokAddError(err.message || 'Could not find that TikTok account.');
    } finally {
      setTikTokAdding(false);
    }
  };

  const handlePurchaseListing = async () => {
    if (!selectedCreator) return;
    setPurchasingListing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          priceKey: 'featured',
          creatorId: selectedCreator.id,
          platform: selectedCreator.platform,
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message || 'Could not start checkout.', 'error');
      setPurchasingListing(false);
    }
  };

  const handlePurchasePremiumListing = async () => {
    if (!selectedCreator) return;
    setPurchasingPremiumListing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          priceKey: 'featured-premium',
          creatorId: selectedCreator.id,
          platform: selectedCreator.platform,
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message || 'Could not start checkout.', 'error');
      setPurchasingPremiumListing(false);
    }
  };

  // Opens Stripe's hosted Customer Portal — real invoice history + payment
  // method management, no custom billing UI to build or card data to store.
  const handleOpenBillingPortal = async () => {
    setOpeningBillingPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ priceKey: 'billing-portal', returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open billing portal');
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message || 'Could not open billing portal.', 'error');
      setOpeningBillingPortal(false);
    }
  };

  // Jumps to the exact row on the rankings page. Featured slots aren't at a
  // fixed rank (Basic lands at 15/20/25... depending on how many other Basic
  // buyers there are; Premium can land in either the 4-5 or 9-10 band), so a
  // plain link to the rankings page wouldn't reliably show the user their own
  // listing. Rankings.jsx reads this hash and scrolls/highlights the match.
  const goToRankingsListing = (listing) => {
    navigate(`/rankings/${listing.platform}#listing-${listing.id}`);
  };

  const handleCancelListing = async (listingId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ priceKey: 'cancel-listing', listingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not cancel listing');
      toast.success('Cancellation scheduled', { description: 'Your placement will remain active until the end of the current billing period, then it will stop automatically.' });
      loadFeaturedListings();
    } catch (err) {
      showToast(err.message || 'Could not cancel listing.', 'error');
    }
  };

  // Auth gate: signed-out visitors get a sign-in prompt instead of a blank page.
  // The "Get featured" CTA on /promote lands here when signed out, so we MUST render something.
  if (!user) {
    return (
      <>
        <SEO title="Sign in to manage your account" description="Sign in to ShinyPull to manage featured listings and your account." />
        <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center px-4">
          <div className={`max-w-md w-full ${CARD} p-8 text-center`}>
            <div className="w-10 h-10 mx-auto mb-5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-amber-500" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">Sign in to continue</h1>
            <p className="text-sm text-neutral-500 mb-6">
              You need an account to manage featured listings, follow creators, and access your dashboard. Takes 10 seconds.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', {
                detail: {
                  message: 'Sign in or create a free account to manage featured listings.',
                  returnTo: '/account?tab=listings',
                },
              }))}
              className="inline-flex items-center gap-2 w-full justify-center px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Sign in / Sign up
            </button>
            <Link to="/promote" className="block mt-4 text-sm text-neutral-400 hover:text-neutral-700 transition-colors">
              Back to Featured Listings overview
            </Link>
          </div>
        </div>
      </>
    );
  }

  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // Toast helper — delegates to Sonner (replaces the old local Toast state)
  const showToast = (message, type = 'success') => {
    if (type === 'error') toast.error(message);
    else toast.success(message);
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
      if (error) throw error;
      showToast('Display name updated.');
    } catch (err) {
      showToast(err.message || 'Failed to update display name.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match.', 'error'); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully.');
    } catch (err) {
      showToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // Profile initials
  const nameForDisplay = user?.user_metadata?.display_name || user?.email?.split('@')[0] || '?';
  const initials = nameForDisplay.slice(0, 2).toUpperCase();

  return (
    <>
      <SEO
        title="Account Settings"
        description="Manage your ShinyPull account, display name, and password."
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Page header — big bold title, "Back" pill */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-6 rounded-full border border-neutral-200 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Account Settings</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Manage your featured listings, profile, and security settings.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Identity card — one unified card, avatar + name + email + at-a-glance stats */}
          <div className={`${CARD} p-5 sm:p-6 mb-6 flex items-center flex-wrap gap-4`}>
            <div className="w-14 h-14 rounded-full bg-neutral-900 flex items-center justify-center text-base font-semibold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-900 truncate text-base">{nameForDisplay}</p>
              <p className="text-sm text-neutral-400 truncate mt-0.5">{user.email}</p>
            </div>
            <div className="flex items-center gap-6 pl-2 sm:pl-5 sm:border-l sm:border-neutral-200/80 flex-shrink-0">
              <div>
                <p className={MICRO}>Following</p>
                <p className="text-lg font-semibold text-neutral-900 tabular-nums mt-0.5">{followCount ?? '–'}</p>
              </div>
              <div className="hidden sm:block">
                <p className={MICRO}>Member since</p>
                <p className="text-sm font-medium text-neutral-700 mt-1">{memberSince}</p>
              </div>
            </div>
          </div>

          {/* Pill tab nav — one responsive row, no separate mobile/desktop treatment */}
          <div className="flex items-center gap-1.5 mb-6">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                      isActive
                        ? 'bg-neutral-900 border-neutral-900 text-white'
                        : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" />
            <button
              onClick={signOut}
              className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-full text-sm text-neutral-400 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>

          {/* Content */}
          <div>

              {/* ── Listings tab ── */}
              {activeTab === 'listings' && (
                <>
                <div className="space-y-4">
                  <div className={`${CARD} p-6`}>
                    <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
                      <h2 className="text-base font-medium text-neutral-900">Featured Listings</h2>
                      <Link to="/promote" className="text-xs text-neutral-400 hover:text-neutral-900 transition-colors inline-flex items-center gap-1">
                        Learn more <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                    <p className="text-sm text-neutral-500 mb-6">Promote any creator across our rankings. Cancel anytime.</p>

                    {/* Existing listings */}
                    {featuredListings.length > 0 && (
                      <div className="mb-7">
                        <p className={`${MICRO} mb-2.5`}>Active listings</p>

                        {/* Desktop: real table with column headers — same pattern as the
                            Daily Readings table on creator profiles. Comparing platform/
                            tier/runs/status across several listings is exactly the kind
                            of tabular data that pattern exists for. */}
                        <div className="hidden md:block border border-neutral-200/80 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                                <th className="px-4 py-2.5 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Creator</th>
                                <th className="px-4 py-2.5 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Platform</th>
                                <th className="px-4 py-2.5 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Tier</th>
                                <th className="px-4 py-2.5 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Runs</th>
                                <th className="px-4 py-2.5 font-semibold text-neutral-600 text-[10px] uppercase tracking-wider">Status</th>
                                <th className="px-4 py-2.5 w-10" />
                              </tr>
                            </thead>
                            <tbody>
                              {featuredListings.map(listing => {
                                const c = listing.creators;
                                const isActive = listing.status === 'active';
                                const isPending = listing.status === 'pending';
                                const isCanceling = isActive && listing.cancel_at_period_end;
                                const until = listing.active_until
                                  ? new Date(listing.active_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : null;
                                const isMenuOpen = openListingActionsId === listing.id;
                                const isPremiumTier = listing.placement_tier === 'premium';
                                const PlatformIcon = PLATFORM_ICONS[listing.platform];
                                return (
                                  <tr
                                    key={listing.id}
                                    onClick={() => goToRankingsListing(listing)}
                                    className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                                  >
                                    <td className="px-4 py-2.5">
                                      <button onClick={() => goToRankingsListing(listing)} className="flex items-center gap-2.5 min-w-0 text-left">
                                        <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="sm" rounded="rounded-lg" />
                                        <span className="text-sm font-medium text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</span>
                                      </button>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
                                        {PlatformIcon && <PlatformIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                                        {PLATFORM_LABELS[listing.platform] || listing.platform}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium uppercase tracking-[0.1em] ${
                                        isPremiumTier ? 'bg-amber-100 border border-amber-200 text-amber-700' : 'bg-neutral-100 border border-neutral-200 text-neutral-500'
                                      }`}>
                                        {isPremiumTier ? 'Premium' : 'Basic'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-500">
                                      {listing.is_mod_free ? 'promotional' : until && isActive ? (isCanceling ? `cancels ${until}` : `until ${until}`) : '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          isCanceling ? 'bg-amber-500' : isActive ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : 'bg-neutral-300'
                                        }`} />
                                        <span className={`text-[10px] font-medium uppercase tracking-[0.1em] ${
                                          isCanceling ? 'text-amber-600' : isActive ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-neutral-400'
                                        }`}>
                                          {isCanceling ? 'canceling' : listing.status}
                                        </span>
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                      <div className="relative inline-block">
                                        {isMenuOpen && (
                                          <div className="fixed inset-0 z-30" onClick={() => setOpenListingActionsId(null)} />
                                        )}
                                        <button
                                          onClick={() => setOpenListingActionsId(isMenuOpen ? null : listing.id)}
                                          className="p-1.5 text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                                          title="Listing actions"
                                        >
                                          <MoreVertical className="w-3.5 h-3.5" />
                                        </button>
                                        {isMenuOpen && (
                                          <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-neutral-200 rounded-lg shadow-xl py-1 z-40 text-left">
                                            <button
                                              onClick={() => { setOpenListingActionsId(null); goToRankingsListing(listing); }}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                              View in rankings
                                            </button>
                                            {isActive && !isPending && !isCanceling && (
                                              <button
                                                onClick={() => { setOpenListingActionsId(null); handleCancelListing(listing.id); }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                                Cancel listing
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile: stacked list — a table doesn't survive narrow width,
                            same pattern as the Daily Readings mobile fallback. */}
                        <div className="md:hidden border border-neutral-200/80 rounded-lg divide-y divide-neutral-100 overflow-hidden">
                          {featuredListings.map(listing => {
                            const c = listing.creators;
                            const isActive = listing.status === 'active';
                            const isPending = listing.status === 'pending';
                            const isCanceling = isActive && listing.cancel_at_period_end;
                            const until = listing.active_until
                              ? new Date(listing.active_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : null;
                            const isMenuOpen = openListingActionsId === listing.id;
                            const isPremiumTier = listing.placement_tier === 'premium';
                            const PlatformIcon = PLATFORM_ICONS[listing.platform];
                            return (
                              <div
                                key={listing.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => goToRankingsListing(listing)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToRankingsListing(listing); }
                                }}
                                className="group flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
                              >
                                <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="md" rounded="rounded-lg" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</p>
                                    <span className={`inline-flex items-center px-1.5 h-4 rounded text-[9px] font-medium uppercase tracking-[0.1em] flex-shrink-0 ${
                                      isPremiumTier ? 'bg-amber-100 border border-amber-200 text-amber-700' : 'bg-neutral-100 border border-neutral-200 text-neutral-500'
                                    }`}>
                                      {isPremiumTier ? 'Premium' : 'Basic'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-400 mt-0.5 inline-flex items-center gap-1">
                                    {PlatformIcon && <PlatformIcon className="w-3 h-3 flex-shrink-0" />}
                                    {PLATFORM_LABELS[listing.platform] || listing.platform}
                                    {until && isActive ? ` · ${isCanceling ? 'cancels' : 'until'} ${until}` : ''}
                                    {listing.is_mod_free ? ' · promotional' : ''}
                                  </p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    isCanceling ? 'bg-amber-500' : isActive ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : 'bg-neutral-300'
                                  }`} />
                                  <span className={`text-[10px] font-medium uppercase tracking-[0.1em] ${
                                    isCanceling ? 'text-amber-600' : isActive ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-neutral-400'
                                  }`}>
                                    {isCanceling ? 'canceling' : listing.status}
                                  </span>
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />

                                {/* Actions menu — same two actions as clicking the row / the old
                                    inline cancel button, just also reachable for anyone who doesn't
                                    notice the row itself is clickable. */}
                                <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {isMenuOpen && (
                                    <div className="fixed inset-0 z-30" onClick={() => setOpenListingActionsId(null)} />
                                  )}
                                  <button
                                    onClick={() => setOpenListingActionsId(isMenuOpen ? null : listing.id)}
                                    className="p-1.5 text-neutral-300 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                                    title="Listing actions"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-neutral-200 rounded-lg shadow-xl py-1 z-40">
                                      <button
                                        onClick={() => { setOpenListingActionsId(null); goToRankingsListing(listing); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        View in rankings
                                      </button>
                                      {isActive && !isPending && !isCanceling && (
                                        <button
                                          onClick={() => { setOpenListingActionsId(null); handleCancelListing(listing.id); }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          Cancel listing
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary strip — real monthly total + next charge date,
                            computed from the same rows above (paid tiers only,
                            promotional listings don't bill). */}
                        {(() => {
                          const billed = featuredListings.filter(l => !l.is_mod_free);
                          if (billed.length === 0) return null;
                          const monthlyTotal = billed.reduce((sum, l) => sum + (TIER_PRICE[l.placement_tier] || TIER_PRICE.basic), 0);
                          const nextCharge = billed
                            .filter(l => !l.cancel_at_period_end && l.active_until)
                            .map(l => new Date(l.active_until))
                            .sort((a, b) => a - b)[0];
                          return (
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-2.5 px-1 text-xs text-neutral-400">
                              <span>{billed.length} active</span>
                              <span>&middot;</span>
                              <span>${monthlyTotal}/month</span>
                              {nextCharge && (
                                <>
                                  <span>&middot;</span>
                                  <span>next charge {nextCharge.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Add new listing / manage billing */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={openListingDialog}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add a listing
                      </button>
                      <button
                        onClick={handleOpenBillingPortal}
                        disabled={openingBillingPortal}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-neutral-200 hover:border-neutral-300 disabled:opacity-50 text-neutral-600 hover:text-neutral-900 text-sm font-medium transition-colors"
                      >
                        {openingBillingPortal ? 'Opening...' : 'Manage billing'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Add-a-listing dialog: platform nav rail on the left, search/tiers on the right */}
                {showListingDialog && (
                  <div
                    className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/40 backdrop-blur-[2px] sm:p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowListingDialog(false); }}
                  >
                    <div className="w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex">
                      {/* Platform nav rail */}
                      <div className="hidden sm:block w-48 flex-shrink-0 border-r border-neutral-200/80 p-3 overflow-y-auto">
                        <p className={`${MICRO} px-2.5 mb-2`}>Platform</p>
                        <div className="space-y-1">
                          {LISTING_PLATFORMS.map(p => {
                            const Icon = PLATFORM_ICONS[p];
                            const isActive = listingPlatform === p;
                            return (
                              <button
                                key={p}
                                onClick={() => selectListingPlatform(p)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                              >
                                <Icon className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{PLATFORM_LABELS[p]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Main pane */}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/80 flex-shrink-0">
                          <h3 className="text-sm font-semibold text-neutral-900">Add a listing</h3>
                          <button
                            onClick={() => setShowListingDialog(false)}
                            className="text-neutral-400 hover:text-neutral-900 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-5 overflow-y-auto flex-1 space-y-3">
                          {/* Platform selector — mobile only, nav rail covers desktop */}
                          <div className="flex flex-wrap gap-1.5 sm:hidden">
                            {LISTING_PLATFORMS.map(p => (
                              <button
                                key={p}
                                onClick={() => selectListingPlatform(p)}
                                className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors border ${
                                  listingPlatform === p
                                    ? 'bg-neutral-900 border-neutral-900 text-white'
                                    : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
                                }`}
                              >
                                {PLATFORM_LABELS[p]}
                              </button>
                            ))}
                          </div>

                          {/* Search input */}
                          <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${INPUT} focus-within:border-neutral-400`}>
                            {listingSearching
                              ? <Loader className="w-3.5 h-3.5 text-neutral-400 animate-spin flex-shrink-0" />
                              : <Search className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                            }
                            <input
                              type="text"
                              value={listingQuery}
                              onChange={e => {
                                setListingQuery(e.target.value);
                                setSelectedCreator(null);
                                setAlreadyListed(false);
                              }}
                              placeholder={`Search ${PLATFORM_LABELS[listingPlatform]} creators...`}
                              className="flex-1 bg-transparent text-neutral-900 placeholder-neutral-400 text-[16px] sm:text-sm focus:outline-none"
                              autoFocus
                            />
                            {listingQuery && (
                              <button
                                onClick={() => { setListingQuery(''); setSelectedCreator(null); setListingResults([]); setAlreadyListed(false); setTikTokAddError(''); setNextBasicRank(null); setNextPremiumRank(null); setPendingTier(null); }}
                                className="text-neutral-400 hover:text-neutral-900"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Results — flow inline (not an absolute overlay) so they're always visibly
                              part of the same scroll area instead of getting clipped off-screen once
                              the on-screen keyboard shrinks the viewport on mobile. */}
                          {listingResults.length > 0 && !selectedCreator && (
                            <div className="border border-neutral-200 rounded-lg overflow-hidden divide-y divide-neutral-100">
                              {listingResults.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => handleSelectCreator(c)}
                                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-neutral-50 transition-colors text-left"
                                >
                                  <CreatorAvatar src={c.profile_image} name={c.display_name} size="sm" rounded="rounded-md" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-neutral-900 truncate">{c.display_name}</p>
                                    <p className="text-xs text-neutral-400">@{c.username}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* TikTok: not in DB — offer instant lookup */}
                          {listingPlatform === 'tiktok' && listingQuery.trim().length >= 2 && !listingSearching && listingResults.length === 0 && !selectedCreator && (
                            <div className="flex items-center gap-3 px-1">
                              <p className="text-xs text-neutral-400 flex-1 min-w-0">
                                We don't have this creator yet. Add <span className="text-neutral-700 font-medium">@{listingQuery.trim()}</span> directly.
                              </p>
                              <button
                                onClick={handleTikTokInstantAdd}
                                disabled={tikTokAdding}
                                className="flex-shrink-0 flex items-center gap-1.5 px-3 h-7 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
                              >
                                {tikTokAdding && <Loader className="w-3 h-3 animate-spin" />}
                                {tikTokAdding ? 'Looking up...' : 'Add'}
                              </button>
                            </div>
                          )}
                          {tikTokAddError && <p className="text-xs text-red-600 px-1">{tikTokAddError}</p>}

                          {/* Selected creator + purchase options */}
                          {selectedCreator && (
                            <div className="space-y-3">
                              {/* Creator info */}
                              <div className="flex items-center gap-3 px-3.5 py-3 border border-neutral-200/80 rounded-lg">
                                <CreatorAvatar src={selectedCreator.profile_image} name={selectedCreator.display_name} size="md" rounded="rounded-lg" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-neutral-900 truncate">{selectedCreator.display_name}</p>
                                  <p className="text-xs text-neutral-400 mt-0.5">@{selectedCreator.username} · {selectedCreator.platform}</p>
                                </div>
                                {alreadyListed && (
                                  <span className={`${MICRO} flex-shrink-0`}>Already listed</span>
                                )}
                              </div>

                              {/* Tier selection */}
                              {!alreadyListed && !pendingTier && (
                                <div className="space-y-2.5">
                                  <p className={`${MICRO} pt-1`}>Choose your slot</p>
                                  <div className="grid sm:grid-cols-2 gap-2.5">
                                    {/* Basic */}
                                    <button
                                      onClick={() => setPendingTier('basic')}
                                      disabled={nextBasicRank === null}
                                      className="group text-left bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-50 rounded-xl p-4 transition-colors"
                                    >
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Basic</span>
                                        <span className="text-[10px] text-neutral-400">Cancel anytime</span>
                                      </div>
                                      <p className="text-2xl font-semibold text-neutral-900 tabular-nums">$49<span className="text-sm font-normal text-neutral-400">/mo</span></p>
                                      <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                                        {nextBasicRank === null
                                          ? 'Checking the next open slot...'
                                          : <>Next open slot: <span className="font-medium text-neutral-700 tabular-nums">rank #{nextBasicRank}</span> on {PLATFORM_LABELS[listingPlatform]}.</>}
                                      </p>
                                      <span className="inline-flex items-center gap-1 mt-3.5 text-xs font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">
                                        Get this slot <ChevronRight className="w-3 h-3" />
                                      </span>
                                    </button>

                                    {/* Premium — one thin amber rule is the entire differentiation */}
                                    <button
                                      onClick={premiumSlotsLeft > 0 ? () => setPendingTier('premium') : undefined}
                                      disabled={premiumSlotsLeft === 0 || nextPremiumRank === null}
                                      className={`group text-left rounded-xl p-4 border transition-colors ${
                                        premiumSlotsLeft > 0
                                          ? 'bg-white border-neutral-200 border-t-2 border-t-amber-400 hover:border-neutral-400 hover:border-t-amber-500'
                                          : 'bg-neutral-50 border-neutral-200 opacity-50 cursor-not-allowed'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-600">Premium</span>
                                        <span className={`text-[10px] tabular-nums ${premiumSlotsLeft > 0 ? 'text-amber-600' : 'text-neutral-400'}`}>
                                          {premiumSlotsLeft > 0 ? `${premiumSlotsLeft} of 2 left` : 'Sold out'}
                                        </span>
                                      </div>
                                      <p className={`text-2xl font-semibold tabular-nums ${premiumSlotsLeft > 0 ? 'text-neutral-900' : 'text-neutral-400'}`}>
                                        $149<span className="text-sm font-normal text-neutral-400">/mo</span>
                                      </p>
                                      <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                                        {premiumSlotsLeft > 0
                                          ? <>Next open slot: <span className="font-medium text-neutral-700 tabular-nums">rank #{nextPremiumRank}</span> on {PLATFORM_LABELS[listingPlatform]}.</>
                                          : 'Top-10 placement between rank 4-5 and 9-10. Maximum visibility.'}
                                      </p>
                                      <span className={`inline-flex items-center gap-1 mt-3.5 text-xs font-medium transition-colors ${
                                        premiumSlotsLeft > 0 ? 'text-amber-600 group-hover:text-amber-700' : 'text-neutral-400'
                                      }`}>
                                        {premiumSlotsLeft > 0
                                          ? <>Get this slot <ChevronRight className="w-3 h-3" /></>
                                          : 'Waitlist coming soon'}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Confirm step — shown after picking a tier, before redirecting to Stripe.
                                  Answers "what am I actually buying and where does it land" before payment. */}
                              {!alreadyListed && pendingTier && (
                                <div className="space-y-2.5">
                                  <p className={`${MICRO} pt-1`}>Confirm your placement</p>
                                  <div className={`rounded-xl p-4 border bg-white ${pendingTier === 'premium' ? 'border-neutral-200 border-t-2 border-t-amber-400' : 'border-neutral-200'}`}>
                                    <div className="flex items-center justify-between">
                                      <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${pendingTier === 'premium' ? 'text-amber-600' : 'text-neutral-500'}`}>
                                        {pendingTier === 'premium' ? 'Premium' : 'Basic'}
                                      </span>
                                      <span className="text-sm font-semibold tabular-nums text-neutral-900">{pendingTier === 'premium' ? '$149/mo' : '$49/mo'}</span>
                                    </div>
                                    <p className="text-sm text-neutral-700 mt-3 leading-relaxed">
                                      <span className="font-medium text-neutral-900">{selectedCreator.display_name}</span> will appear at{' '}
                                      <span className="font-semibold text-neutral-900 tabular-nums">rank #{pendingTier === 'premium' ? nextPremiumRank : nextBasicRank}</span>{' '}
                                      on the {PLATFORM_LABELS[listingPlatform]} rankings.
                                    </p>
                                    <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                                      This is the next open slot right now. It could shift by one slot if another purchase completes at the same moment.
                                    </p>
                                  </div>
                                  <div className="flex gap-2.5">
                                    <button
                                      onClick={() => setPendingTier(null)}
                                      disabled={purchasingListing || purchasingPremiumListing}
                                      className="flex-1 h-10 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                                    >
                                      Back
                                    </button>
                                    <button
                                      onClick={pendingTier === 'premium' ? handlePurchasePremiumListing : handlePurchaseListing}
                                      disabled={purchasingListing || purchasingPremiumListing}
                                      className="flex-1 h-10 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                                    >
                                      {(purchasingListing || purchasingPremiumListing) ? 'Redirecting...' : 'Proceed to payment'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
              )}

              {/* ── Profile tab ── */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  {/* Account info — hairline-divided strip */}
                  <div className={`${CARD} p-6`}>
                    <p className={`${MICRO} mb-4`}>Account info</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 border border-neutral-200/80 rounded-lg overflow-hidden">
                      <div className="px-4 py-3.5">
                        <p className="text-xs text-neutral-400 mb-1">Member since</p>
                        <p className="text-sm font-medium text-neutral-900 truncate">{memberSince}</p>
                      </div>
                      <div className="px-4 py-3.5">
                        <p className="text-xs text-neutral-400 mb-1">Following</p>
                        <p className="text-sm font-medium text-neutral-900 tabular-nums">
                          {followCount === null ? '...' : `${followCount} creator${followCount !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="px-4 py-3.5">
                        <p className="text-xs text-neutral-400 mb-1">Email</p>
                        <p className="text-sm font-medium text-neutral-900 truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Display name */}
                  <div className={`${CARD} p-6`}>
                    <h2 className="text-base font-medium text-neutral-900 mb-1">Display Name</h2>
                    <p className="text-sm text-neutral-500 mb-5">This is how your name appears on your dashboard.</p>
                    <form onSubmit={handleSaveName} className="flex gap-2.5">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        maxLength={50}
                        className={`flex-1 px-3.5 py-2.5 ${INPUT}`}
                      />
                      <button
                        type="submit"
                        disabled={savingName || !displayName.trim()}
                        className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        {savingName ? 'Saving...' : 'Save'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* ── Security tab ── */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  {/* Change password */}
                  <div className={`${CARD} p-6`}>
                    <h2 className="text-base font-medium text-neutral-900 mb-1">Change Password</h2>
                    <p className="text-sm text-neutral-500 mb-5">Pick a strong password, at least 8 characters.</p>
                    <form onSubmit={handleChangePassword} className="space-y-2.5 max-w-sm">
                      <div className="relative">
                        <input
                          type={showNew ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className={`w-full px-3.5 py-2.5 pr-10 ${INPUT}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900"
                        >
                          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className={`w-full px-3.5 py-2.5 pr-10 ${INPUT}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900"
                        >
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={savingPassword || !newPassword || !confirmPassword}
                        className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                      >
                        {savingPassword ? 'Updating...' : 'Update Password'}
                      </button>
                    </form>
                  </div>

                  {/* Sign out */}
                  <div className={`${CARD} p-6`}>
                    <h2 className="text-base font-medium text-neutral-900 mb-1">Sign Out</h2>
                    <p className="text-sm text-neutral-500 mb-4">Sign out of your account on this device.</p>
                    <button
                      onClick={signOut}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 hover:border-red-300 text-neutral-600 hover:text-red-600 font-medium rounded-lg transition-colors text-sm"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}

          </div>
        </div>
      </div>
    </>
  );
}
