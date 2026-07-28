import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  User, Mail, Lock, Calendar, Star,
  Eye, EyeOff, ArrowLeft, ExternalLink, Megaphone,
  X, Search, Loader, LogOut, Shield, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getFollowedCreators } from '../services/followService';
import SEO from '../components/SEO';
import CreatorAvatar from '../components/CreatorAvatar';

const TABS = [
  { id: 'listings', label: 'Listings', icon: Megaphone },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

const LISTING_PLATFORMS = ['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack'];
const PLATFORM_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', twitch: 'Twitch', kick: 'Kick', bluesky: 'Bluesky', music: 'Music', mastodon: 'Mastodon', rumble: 'Rumble', substack: 'Substack' };

// Typographic backbone shared with the dashboard
const MICRO = 'text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400';
const CARD = 'bg-white border border-neutral-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const INPUT = 'bg-white border border-neutral-200 rounded-lg text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 text-sm transition-colors';

export default function Account() {
  const { user, signOut } = useAuth();
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
  const [listingPlatform, setListingPlatform] = useState('youtube');
  const [listingQuery, setListingQuery] = useState('');
  const [listingResults, setListingResults] = useState([]);
  const [listingSearching, setListingSearching] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [alreadyListed, setAlreadyListed] = useState(false);
  const [purchasingListing, setPurchasingListing] = useState(false);
  const [purchasingPremiumListing, setPurchasingPremiumListing] = useState(false);
  const [premiumSlotsLeft, setPremiumSlotsLeft] = useState(2);
  const [tikTokAdding, setTikTokAdding] = useState(false);
  const [tikTokAddError, setTikTokAddError] = useState('');

  const loadFeaturedListings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('featured_listings')
      .select('id, platform, status, active_from, active_until, is_mod_free, created_at, creators(display_name, username, profile_image, platform)')
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

  const handleSelectCreator = async (creator) => {
    setSelectedCreator(creator);
    setListingQuery(creator.display_name || creator.username);
    setListingResults([]);
    setAlreadyListed(false);
    setPremiumSlotsLeft(2);
    const now = new Date().toISOString();
    const [{ data: existing }, { count: premiumCount }] = await Promise.all([
      supabase.from('featured_listings').select('id')
        .eq('creator_id', creator.id).eq('status', 'active').gt('active_until', now).limit(1),
      supabase.from('featured_listings').select('id', { count: 'exact', head: true })
        .eq('platform', creator.platform).eq('placement_tier', 'premium')
        .eq('status', 'active').gt('active_until', now),
    ]);
    setAlreadyListed(!!(existing && existing.length > 0));
    setPremiumSlotsLeft(Math.max(0, 2 - (premiumCount || 0)));
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
      toast.success('Listing canceled', { description: 'Your placement will remain active until the end of the current billing period.' });
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
                        <div className="border border-neutral-200/80 rounded-lg divide-y divide-neutral-100 overflow-hidden">
                          {featuredListings.map(listing => {
                            const c = listing.creators;
                            const isActive = listing.status === 'active';
                            const isPending = listing.status === 'pending';
                            const until = listing.active_until
                              ? new Date(listing.active_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : null;
                            return (
                              <div key={listing.id} className="flex items-center gap-3 px-3.5 py-3">
                                <CreatorAvatar src={c?.profile_image} name={c?.display_name} size="md" rounded="rounded-lg" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-neutral-900 truncate">{c?.display_name || 'Unknown creator'}</p>
                                  <p className="text-xs text-neutral-400 mt-0.5">
                                    {listing.platform}
                                    {until && isActive ? ` · until ${until}` : ''}
                                    {listing.is_mod_free ? ' · promotional' : ''}
                                  </p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    isActive ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : 'bg-neutral-300'
                                  }`} />
                                  <span className={`text-[10px] font-medium uppercase tracking-[0.1em] ${
                                    isActive ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-neutral-400'
                                  }`}>
                                    {listing.status}
                                  </span>
                                </span>
                                {isActive && !isPending && (
                                  <button
                                    onClick={() => handleCancelListing(listing.id)}
                                    className="p-1.5 text-neutral-300 hover:text-red-600 transition-colors flex-shrink-0"
                                    title="Cancel listing"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Add new listing */}
                    <div className="space-y-3">
                      <p className={MICRO}>Add a listing</p>

                      {/* Platform selector */}
                      <div className="flex flex-wrap gap-1.5">
                        {LISTING_PLATFORMS.map(p => (
                          <button
                            key={p}
                            onClick={() => {
                              setListingPlatform(p);
                              setSelectedCreator(null);
                              setListingQuery('');
                              setListingResults([]);
                              setAlreadyListed(false);
                              setTikTokAddError('');
                            }}
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

                      {/* Search input with dropdown */}
                      <div className="relative">
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
                          />
                          {listingQuery && (
                            <button
                              onClick={() => { setListingQuery(''); setSelectedCreator(null); setListingResults([]); setAlreadyListed(false); setTikTokAddError(''); }}
                              className="text-neutral-400 hover:text-neutral-900"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown results */}
                        {listingResults.length > 0 && !selectedCreator && (
                          <div className="absolute top-full mt-1.5 left-0 right-0 z-10 bg-white border border-neutral-200 rounded-lg shadow-xl overflow-hidden">
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
                      </div>

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
                          {!alreadyListed && (
                            <div className="space-y-2.5">
                              <p className={`${MICRO} pt-1`}>Choose your slot</p>
                              <div className="grid sm:grid-cols-2 gap-2.5">
                                {/* Basic */}
                                <button
                                  onClick={handlePurchaseListing}
                                  disabled={purchasingListing}
                                  className="group text-left bg-white border border-neutral-200 hover:border-neutral-400 disabled:opacity-50 rounded-xl p-4 transition-colors"
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Basic</span>
                                    <span className="text-[10px] text-neutral-400">Cancel anytime</span>
                                  </div>
                                  <p className="text-2xl font-semibold text-neutral-900 tabular-nums">$49<span className="text-sm font-normal text-neutral-400">/mo</span></p>
                                  <p className="text-xs text-neutral-500 mt-2 leading-relaxed">Placed at rank 15, 20, 25... on the {PLATFORM_LABELS[listingPlatform]} rankings.</p>
                                  <span className="inline-flex items-center gap-1 mt-3.5 text-xs font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">
                                    {purchasingListing ? 'Redirecting...' : <>Get this slot <ChevronRight className="w-3 h-3" /></>}
                                  </span>
                                </button>

                                {/* Premium — one thin amber rule is the entire differentiation */}
                                <button
                                  onClick={premiumSlotsLeft > 0 ? handlePurchasePremiumListing : undefined}
                                  disabled={premiumSlotsLeft === 0 || purchasingPremiumListing}
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
                                  <p className="text-xs text-neutral-500 mt-2 leading-relaxed">Top-10 placement between rank 4-5 and 9-10. Maximum visibility.</p>
                                  <span className={`inline-flex items-center gap-1 mt-3.5 text-xs font-medium transition-colors ${
                                    premiumSlotsLeft > 0 ? 'text-amber-600 group-hover:text-amber-700' : 'text-neutral-400'
                                  }`}>
                                    {purchasingPremiumListing ? 'Redirecting...' : premiumSlotsLeft > 0
                                      ? <>Get this slot <ChevronRight className="w-3 h-3" /></>
                                      : 'Waitlist coming soon'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                    <form onSubmit={handleChangePassword} className="space-y-2.5">
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
