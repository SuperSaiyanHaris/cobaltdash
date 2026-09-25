import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  User, Eye, EyeOff, ArrowLeft, Megaphone,
  X, Search, Loader, LogOut, Shield, ChevronRight, Plus,
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
import SubstackIcon from '../components/SubstackIcon';
import { isActivePlatform } from '../lib/constants';

const TABS = [
  { id: 'listings', label: 'Listings', icon: Megaphone },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

const LISTING_PLATFORMS = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'substack'];
const TIER_PRICE = { basic: 49, premium: 149 };
const PLATFORM_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music', mastodon: 'Mastodon', substack: 'Substack' };
const PLATFORM_ICONS = {
  youtube: YouTubeIcon, tiktok: TikTokIcon, twitch: TwitchIcon, kick: KickIcon, bluesky: BlueskyIcon,
  music: MusicIcon, mastodon: MastodonIcon, substack: SubstackIcon,
};

// Typographic backbone shared with the dashboard
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-600';
const INPUT = 'bg-white border border-neutral-300 rounded-xl text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-neutral-900 text-[15px] transition-colors';

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

  // Arriving from /promote with a creator already picked
  // (?feature=platform/username): open the listing dialog with that creator
  // selected, so the buyer doesn't have to search again.
  const featureParam = searchParams.get('feature');
  useEffect(() => {
    if (!user || !featureParam) return;
    const [p, ...rest] = featureParam.split('/');
    const uname = rest.join('/');
    if (!isActivePlatform(p) || !uname) return;
    let cancelled = false;
    supabase.from('creators')
      .select('id, username, display_name, profile_image, platform')
      .eq('platform', p)
      .ilike('username', uname.replace(/[\\%_]/g, (m) => `\\${m}`))
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        window.history.replaceState({}, '', '/account?tab=listings');
        setActiveTab('listings');
        setListingPlatform(p);
        setShowListingDialog(true);
        handleSelectCreator(data);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, featureParam]);

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
      window.location.assign(data.url);
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
      window.location.assign(data.url);
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
      window.location.assign(data.url);
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
        <section className="relative isolate overflow-hidden bg-[#0a0a0f] text-white min-h-[70vh] flex items-center">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />
          <div className="relative max-w-xl mx-auto px-4 py-20 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Your account</p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">Sign in to continue.</h1>
            <p className="mt-4 text-base sm:text-lg text-white/70">
              Manage featured listings, your profile and your password. Takes 10 seconds.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openAuthPanel', {
                detail: {
                  message: 'Sign in or create a free account to manage featured listings.',
                  returnTo: '/account?tab=listings',
                },
              }))}
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-950 text-sm font-bold transition-colors"
            >
              Sign in / Sign up <ChevronRight className="w-4 h-4" />
            </button>
            <Link to="/promote" className="block mt-5 text-sm font-semibold text-white/70 hover:text-white transition-colors">
              How featured listings work
            </Link>
          </div>
        </section>
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

  // Billing summary from the listings themselves (promotional ones don't bill).
  const billed = featuredListings.filter(l => !l.is_mod_free && l.status === 'active');
  const monthlyTotal = billed.reduce((sum, l) => sum + (TIER_PRICE[l.placement_tier] || TIER_PRICE.basic), 0);
  const nextCharge = billed
    .filter(l => !l.cancel_at_period_end && l.active_until)
    .map(l => new Date(l.active_until))
    .sort((a, b) => a - b)[0];
  const activeListingCount = featuredListings.filter(l => l.status === 'active').length;

  const pill = (active) => `flex-shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
    active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-800 border border-neutral-300 hover:border-neutral-900'
  }`;

  const statusOf = (listing) => {
    const isActive = listing.status === 'active';
    if (isActive && listing.cancel_at_period_end) return { label: 'Canceling', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
    if (isActive) return { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (listing.status === 'pending') return { label: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
    return { label: listing.status ? listing.status.charAt(0).toUpperCase() + listing.status.slice(1) : 'Ended', cls: 'bg-neutral-100 text-neutral-700 border-neutral-300' };
  };

  return (
    <>
      <SEO
        title="Account Settings"
        description="Manage your ShinyPull account, display name, and password."
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* ── Dark band: who you are, at a glance ── */}
        <section className="relative isolate overflow-hidden bg-[#0a0a0f] text-white">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none hero-dot-grid" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:pb-12">
            <div className="flex items-center justify-between gap-3">
              <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Dashboard
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/25 hover:border-white/60 text-sm font-semibold text-white transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white text-neutral-950 flex items-center justify-center text-xl sm:text-2xl font-black flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Account</p>
                <h1 className="mt-1 text-3xl sm:text-5xl font-extrabold tracking-tight truncate">{nameForDisplay}</h1>
                <p className="mt-1 text-[15px] text-white/75 truncate">{user.email}</p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Following', value: followCount ?? '–' },
                { label: 'Active listings', value: activeListingCount },
                { label: 'Monthly', value: monthlyTotal ? `$${monthlyTotal}` : '$0' },
                { label: 'Member since', value: new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) },
              ].map(s => (
                <div key={s.label} className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3.5">
                  <p className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-none">{s.value}</p>
                  <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={pill(activeTab === tab.id)}>
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Listings tab ── */}
          {activeTab === 'listings' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">Featured listings</h2>
                  <p className="mt-1 text-[15px] text-neutral-700">
                    {billed.length > 0
                      ? <>{billed.length} running · <span className="font-bold text-neutral-900">${monthlyTotal}/month</span>{nextCharge && <> · next charge {nextCharge.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}</>
                      : 'Put any creator in the live rankings. Cancel anytime.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button onClick={openListingDialog} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold transition-colors">
                    <Plus className="w-4 h-4" /> Add a listing
                  </button>
                  {featuredListings.length > 0 && (
                    <button
                      onClick={handleOpenBillingPortal}
                      disabled={openingBillingPortal}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-neutral-300 hover:border-neutral-900 disabled:opacity-60 text-neutral-900 text-sm font-bold transition-colors"
                    >
                      {openingBillingPortal ? 'Opening...' : 'Manage billing'}
                    </button>
                  )}
                </div>
              </div>

              {featuredListings.length === 0 ? (
                <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-10">
                  <div className="max-w-xl mx-auto text-center">
                    <p className="text-xl font-extrabold text-neutral-900">No listings yet.</p>
                    <p className="mt-2 text-[15px] text-neutral-700">This is the row your creator gets, right inside the rankings.</p>
                    <div className="mt-6 sponsor-foil rounded-2xl p-[1.5px] text-left">
                      <div className="relative flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-amber-50 via-white to-amber-50 px-4 py-3 overflow-hidden">
                        <span aria-hidden="true" className="sponsor-shine" />
                        <span className="relative inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-[0.1em] bg-amber-100 border border-amber-300 text-amber-800">Ad</span>
                        <span className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 flex items-center justify-center text-neutral-900 font-black">★</span>
                        <span className="relative flex-1 min-w-0">
                          <span className="block font-bold text-[15px] text-neutral-900">Your channel here</span>
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">Featured · Premium</span>
                        </span>
                        <span className="relative text-sm font-bold text-amber-700">$149/mo</span>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <button onClick={openListingDialog} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold transition-colors">
                        <Plus className="w-4 h-4" /> Add your first listing
                      </button>
                      <Link to="/promote" className="inline-flex items-center gap-1 text-sm font-bold text-neutral-900 hover:underline">
                        How it works <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {featuredListings.map(listing => {
                    const c = listing.creators;
                    const isActive = listing.status === 'active';
                    const isCanceling = isActive && listing.cancel_at_period_end;
                    const canCancel = isActive && !isCanceling && !listing.is_mod_free;
                    const isPremiumTier = listing.placement_tier === 'premium';
                    const PlatformIcon = PLATFORM_ICONS[listing.platform];
                    const until = listing.active_until
                      ? new Date(listing.active_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : null;
                    const st = statusOf(listing);
                    const confirming = openListingActionsId === listing.id;
                    return (
                      <div key={listing.id} className="rounded-2xl bg-white border border-neutral-200 p-3 sm:p-4">
                        {/* The row as it appears in the rankings */}
                        <div className={`rounded-2xl p-[1.5px] ${isPremiumTier ? 'sponsor-foil' : 'bg-gradient-to-r from-amber-200 via-amber-300 to-amber-200'}`}>
                          <button
                            onClick={() => goToRankingsListing(listing)}
                            className="relative w-full flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-amber-50 via-white to-amber-50 px-3 sm:px-4 py-3 overflow-hidden text-left"
                          >
                            {isPremiumTier && <span aria-hidden="true" className="sponsor-shine" />}
                            <span className="relative hidden sm:inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px] font-bold uppercase tracking-[0.1em] bg-amber-100 border border-amber-300 text-amber-800 flex-shrink-0">Ad</span>
                            <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="lg" rounded="rounded-xl" className="relative !w-10 !h-10" />
                            <span className="relative min-w-0 flex-1">
                              <span className="block font-bold text-[15px] text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</span>
                              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 truncate">
                                {PlatformIcon && <PlatformIcon className="w-3 h-3 flex-shrink-0" />}
                                {PLATFORM_LABELS[listing.platform] || listing.platform} · {isPremiumTier ? 'Premium' : 'Basic'}
                              </span>
                            </span>
                            <span className="relative text-sm font-bold text-amber-700 tabular-nums whitespace-nowrap">
                              {listing.is_mod_free ? 'Promo' : `$${TIER_PRICE[listing.placement_tier] || TIER_PRICE.basic}/mo`}
                            </span>
                          </button>
                        </div>

                        {/* Status + actions */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${st.cls}`}>{st.label}</span>
                          <span className="text-sm font-medium text-neutral-700">
                            {listing.is_mod_free ? 'Promotional, no charge' : until && isActive ? (isCanceling ? `Ends ${until}` : `Renews ${until}`) : ''}
                          </span>
                          <div className="flex-1" />
                          {confirming ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span className="font-semibold text-neutral-900">Cancel at the end of this period?</span>
                              <button
                                onClick={() => { setOpenListingActionsId(null); handleCancelListing(listing.id); }}
                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-colors"
                              >
                                Yes, cancel
                              </button>
                              <button onClick={() => setOpenListingActionsId(null)} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:border-neutral-900 text-neutral-900 font-bold transition-colors">
                                Keep it
                              </button>
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => goToRankingsListing(listing)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 hover:border-neutral-900 text-sm font-bold text-neutral-900 transition-colors"
                              >
                                <Eye className="w-4 h-4" /> View in rankings
                              </button>
                              {canCancel && (
                                <button
                                  onClick={() => setOpenListingActionsId(listing.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-red-700 hover:bg-red-50 transition-colors"
                                >
                                  <X className="w-4 h-4" /> Cancel
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

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
                            className="text-neutral-600 hover:text-neutral-900 transition-colors"
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
                                    : 'bg-white border-neutral-200 text-neutral-700 hover:text-neutral-900 hover:border-neutral-300'
                                }`}
                              >
                                {PLATFORM_LABELS[p]}
                              </button>
                            ))}
                          </div>

                          {/* Search input */}
                          <div className={`flex items-center gap-2.5 px-3.5 py-2.5 ${INPUT} focus-within:border-neutral-400`}>
                            {listingSearching
                              ? <Loader className="w-3.5 h-3.5 text-neutral-600 animate-spin flex-shrink-0" />
                              : <Search className="w-3.5 h-3.5 text-neutral-600 flex-shrink-0" />
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
                              className="flex-1 bg-transparent text-neutral-900 placeholder-neutral-500 text-[16px] sm:text-sm focus:outline-none"
                              autoFocus
                            />
                            {listingQuery && (
                              <button
                                onClick={() => { setListingQuery(''); setSelectedCreator(null); setListingResults([]); setAlreadyListed(false); setTikTokAddError(''); setNextBasicRank(null); setNextPremiumRank(null); setPendingTier(null); }}
                                className="text-neutral-600 hover:text-neutral-900"
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
                                    <p className="text-xs text-neutral-600">@{c.username}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* TikTok: not in DB — offer instant lookup */}
                          {listingPlatform === 'tiktok' && listingQuery.trim().length >= 2 && !listingSearching && listingResults.length === 0 && !selectedCreator && (
                            <div className="flex items-center gap-3 px-1">
                              <p className="text-xs text-neutral-600 flex-1 min-w-0">
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
                                  <p className="text-xs text-neutral-600 mt-0.5">@{selectedCreator.username} · {selectedCreator.platform}</p>
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
                                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-700">Basic</span>
                                        <span className="text-[10px] text-neutral-600">Cancel anytime</span>
                                      </div>
                                      <p className="text-2xl font-semibold text-neutral-900 tabular-nums">$49<span className="text-sm font-normal text-neutral-600">/mo</span></p>
                                      <p className="text-xs text-neutral-700 mt-2 leading-relaxed">
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
                                        <span className={`text-[10px] tabular-nums ${premiumSlotsLeft > 0 ? 'text-amber-600' : 'text-neutral-600'}`}>
                                          {premiumSlotsLeft > 0 ? `${premiumSlotsLeft} of 2 left` : 'Sold out'}
                                        </span>
                                      </div>
                                      <p className={`text-2xl font-semibold tabular-nums ${premiumSlotsLeft > 0 ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                        $149<span className="text-sm font-normal text-neutral-600">/mo</span>
                                      </p>
                                      <p className="text-xs text-neutral-700 mt-2 leading-relaxed">
                                        {premiumSlotsLeft > 0
                                          ? <>Next open slot: <span className="font-medium text-neutral-700 tabular-nums">rank #{nextPremiumRank}</span> on {PLATFORM_LABELS[listingPlatform]}.</>
                                          : 'Top-10 placement between rank 4-5 and 9-10. Maximum visibility.'}
                                      </p>
                                      <span className={`inline-flex items-center gap-1 mt-3.5 text-xs font-medium transition-colors ${
                                        premiumSlotsLeft > 0 ? 'text-amber-600 group-hover:text-amber-700' : 'text-neutral-600'
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
                                      <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${pendingTier === 'premium' ? 'text-amber-600' : 'text-neutral-700'}`}>
                                        {pendingTier === 'premium' ? 'Premium' : 'Basic'}
                                      </span>
                                      <span className="text-sm font-semibold tabular-nums text-neutral-900">{pendingTier === 'premium' ? '$149/mo' : '$49/mo'}</span>
                                    </div>
                                    <p className="text-sm text-neutral-700 mt-3 leading-relaxed">
                                      <span className="font-medium text-neutral-900">{selectedCreator.display_name}</span> will appear at{' '}
                                      <span className="font-semibold text-neutral-900 tabular-nums">rank #{pendingTier === 'premium' ? nextPremiumRank : nextBasicRank}</span>{' '}
                                      on the {PLATFORM_LABELS[listingPlatform]} rankings.
                                    </p>
                                    <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
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
            <div className="grid lg:grid-cols-[1fr,1fr] gap-5">
              <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-7">
                <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">Display name</h2>
                <p className="mt-1 text-[15px] text-neutral-700">How your name shows on your dashboard.</p>
                <form onSubmit={handleSaveName} className="mt-5 flex gap-2.5">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    maxLength={50}
                    className={`flex-1 min-w-0 h-12 px-4 ${INPUT}`}
                  />
                  <button
                    type="submit"
                    disabled={savingName || !displayName.trim()}
                    className="h-12 px-5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
                  >
                    {savingName ? 'Saving...' : 'Save'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-7">
                <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">Account details</h2>
                <dl className="mt-4 divide-y divide-neutral-200">
                  {[
                    { k: 'Email', v: user.email },
                    { k: 'Member since', v: memberSince },
                    { k: 'Following', v: followCount === null ? '...' : `${followCount} creator${followCount !== 1 ? 's' : ''}` },
                  ].map(row => (
                    <div key={row.k} className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-sm font-semibold text-neutral-700">{row.k}</dt>
                      <dd className="text-[15px] font-bold text-neutral-900 truncate">{row.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {/* ── Security tab ── */}
          {activeTab === 'security' && (
            <div className="grid lg:grid-cols-[1fr,1fr] gap-5">
              <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-7">
                <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">Change password</h2>
                <p className="mt-1 text-[15px] text-neutral-700">At least 8 characters.</p>
                <form onSubmit={handleChangePassword} className="mt-5 space-y-3">
                  {[
                    { value: newPassword, set: setNewPassword, show: showNew, toggle: () => setShowNew(v => !v), ph: 'New password' },
                    { value: confirmPassword, set: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v), ph: 'Confirm new password' },
                  ].map((f) => (
                    <div key={f.ph} className="relative">
                      <input
                        type={f.show ? 'text' : 'password'}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        placeholder={f.ph}
                        aria-label={f.ph}
                        className={`w-full h-12 px-4 pr-11 ${INPUT}`}
                      />
                      <button
                        type="button"
                        onClick={f.toggle}
                        aria-label={f.show ? 'Hide password' : 'Show password'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-700 hover:text-neutral-950"
                      >
                        {f.show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                  <button
                    type="submit"
                    disabled={savingPassword || !newPassword || !confirmPassword}
                    className="w-full h-12 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
                  >
                    {savingPassword ? 'Updating...' : 'Update password'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl bg-white border border-neutral-200 p-6 sm:p-7 flex flex-col">
                <h2 className="text-xl font-extrabold tracking-tight text-neutral-900">Sign out</h2>
                <p className="mt-1 text-[15px] text-neutral-700">Sign out of ShinyPull on this device.</p>
                <button
                  onClick={signOut}
                  className="mt-5 self-start inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-red-300 hover:bg-red-50 text-red-700 font-bold transition-colors text-sm"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
