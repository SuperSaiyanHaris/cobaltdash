/**
 * Create a Stripe Checkout session for Featured Listings, or cancel an active listing.
 *
 * POST /api/stripe-checkout
 * Headers: Authorization: Bearer <supabase-jwt>
 *
 * Featured listing — Basic ($49/mo, rank 15 and beyond):
 *   Body: { priceKey: 'featured', creatorId: string, platform: string, returnUrl: string }
 *
 * Featured listing — Premium ($149/mo, top-10 placement, 2 slots/platform):
 *   Body: { priceKey: 'featured-premium', creatorId: string, platform: string, returnUrl: string }
 *
 * Cancel a listing (owner) — schedules cancellation for the end of the
 * current billing period (Stripe cancel_at_period_end: true), so an already-
 * paid-for placement stays live/active until then instead of vanishing
 * immediately. `status` only flips to 'canceled' once Stripe actually ends
 * the subscription and fires customer.subscription.deleted (stripe-webhook.js):
 *   Body: { priceKey: 'cancel-listing', listingId: string }
 *
 * Cancel a listing (admin, on behalf of any user — see the /admin/users/:id page):
 *   Body: { priceKey: 'cancel-listing', listingId: string, adminOverride: true }
 *   Caller's own JWT must belong to an address in ADMIN_EMAILS; the ownership
 *   check against purchased_by_user_id is skipped in this case. Same
 *   period-end scheduling as the owner path above.
 *
 * Featured Listings is the only paid product — subscription tiers (Lurker/Sub/Mod) are deprecated.
 * The webhook creates the listing row only after payment succeeds; no orphan rows from abandoned checkouts.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIdentifier } from './_ratelimit.js';

const PRICE_IDS = {
  featured: process.env.STRIPE_FEATURED_BASIC_PRICE_ID,
  'featured-premium': process.env.STRIPE_FEATURED_PREMIUM_PRICE_ID,
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const VALID_PLATFORMS = new Set(['youtube', 'tiktok', 'twitch', 'kick', 'bluesky', 'music', 'mastodon', 'rumble', 'substack']);
const SAFE_ORIGINS = new Set(['https://shinypull.com', 'http://localhost:3000']);

function isSafeReturnUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return SAFE_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

function getSiteOrigin(req) {
  const reqOrigin = req.headers.origin || '';
  return reqOrigin === 'http://localhost:3000' ? 'http://localhost:3000' : 'https://shinypull.com';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 10 checkout attempts per IP per minute
  const clientId = getClientIdentifier(req);
  const rateCheck = checkRateLimit(`checkout:${clientId}`, 10, 60000);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Authenticate user from Bearer token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const supabaseAuth = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { priceKey, returnUrl, creatorId, platform, listingId, adminOverride } = req.body;

    // Cancel a featured listing
    if (priceKey === 'cancel-listing') {
      if (!listingId) return res.status(400).json({ error: 'Missing listingId' });

      const isAdmin = !!adminOverride && ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
      if (adminOverride && !isAdmin) return res.status(403).json({ error: 'Forbidden: admin access required' });

      let listingQuery = supabase
        .from('featured_listings')
        .select('id, stripe_subscription_id, status, cancel_at_period_end, purchased_by_user_id')
        .eq('id', listingId);
      if (!isAdmin) listingQuery = listingQuery.eq('purchased_by_user_id', user.id);
      const { data: listing } = await listingQuery.maybeSingle();

      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      if (listing.status !== 'active') return res.status(400).json({ error: 'Listing is not active' });
      if (listing.cancel_at_period_end) return res.status(400).json({ error: 'Listing is already set to cancel at period end' });

      if (listing.stripe_subscription_id) {
        // Stripe-backed listing — schedule cancellation for the end of the
        // current billing period rather than cancelling immediately, so the
        // placement (which was already paid for) stays live until then, per
        // the UI's own promise. Status stays 'active' in the meantime; Stripe
        // auto-cancels the subscription at period end and fires
        // customer.subscription.deleted, which is what actually flips status
        // to 'canceled' (see stripe-webhook.js). customer.subscription.updated
        // (fired synchronously by this same update call) is the authoritative
        // reconciliation of the cancel_at_period_end flag below — this direct
        // write is just so the UI reflects it immediately instead of waiting
        // on webhook delivery.
        await stripe.subscriptions.update(listing.stripe_subscription_id, { cancel_at_period_end: true });
        const { error: updateError } = await supabase
          .from('featured_listings')
          .update({ cancel_at_period_end: true })
          .eq('id', listingId);
        if (updateError) throw updateError;
      } else {
        // Promotional / legacy listing — no subscription to schedule against, cancel now
        const { error: updateError } = await supabase
          .from('featured_listings')
          .update({ status: 'canceled' })
          .eq('id', listingId);
        if (updateError) throw updateError;
      }

      return res.status(200).json({ success: true });
    }

    // Open Stripe's hosted Customer Portal — gives the user real invoice/
    // billing history and payment-method management for free, no custom UI
    // or stored card data on our side. Added instead of a new api/ file: the
    // project is already at the Vercel Hobby 12-Node-function cap (see
    // CLAUDE.md), so this reuses stripe-checkout.js the same way
    // 'cancel-listing' already does above rather than adding a 13th function.
    //
    // Requires a Customer Portal configuration to exist for this Stripe
    // account (Dashboard → Settings → Billing → Customer portal, or
    // stripe.billingPortal.configurations.create() once) — Stripe auto-
    // provisions a default one in test mode but NOT in live mode. Without it
    // this call fails with a clean Stripe error, not a crash.
    if (priceKey === 'billing-portal') {
      const { data: userData } = await supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!userData?.stripe_customer_id) {
        return res.status(400).json({ error: 'No billing history yet — this appears after your first purchase.' });
      }

      const portalOrigin = getSiteOrigin(req);
      const portalReturnUrl = returnUrl && isSafeReturnUrl(returnUrl) ? returnUrl : `${portalOrigin}/account`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: userData.stripe_customer_id,
        return_url: portalReturnUrl,
      });
      return res.status(200).json({ url: portalSession.url });
    }

    if (!priceKey || !PRICE_IDS[priceKey]) {
      return res.status(400).json({ error: 'Invalid price key' });
    }

    // Validate returnUrl to prevent open redirects
    const origin = getSiteOrigin(req);
    if (returnUrl && !isSafeReturnUrl(returnUrl)) {
      return res.status(400).json({ error: 'Invalid return URL' });
    }

    // Validate platform
    if (!platform || !VALID_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    if (!creatorId) {
      return res.status(400).json({ error: 'Missing creatorId for featured listing' });
    }

    const placementTier = priceKey === 'featured-premium' ? 'premium' : 'basic';

    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .eq('id', creatorId)
      .eq('platform', platform)
      .maybeSingle();
    if (!creator) return res.status(400).json({ error: 'Creator not found' });

    // Prevent duplicate: block if this creator already has any active listing
    const { count: dupCount } = await supabase
      .from('featured_listings')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .gt('active_until', new Date().toISOString());
    if (dupCount > 0) {
      return res.status(409).json({ error: 'This creator already has an active featured listing' });
    }

    // Premium: enforce maximum 2 slots per platform
    if (placementTier === 'premium') {
      const { count: premiumCount } = await supabase
        .from('featured_listings')
        .select('id', { count: 'exact', head: true })
        .eq('platform', platform)
        .eq('placement_tier', 'premium')
        .eq('status', 'active')
        .gt('active_until', new Date().toISOString());
      if (premiumCount >= 2) {
        return res.status(409).json({ error: 'All premium spots for this platform are taken. Try again later.' });
      }
    }

    // Get or create Stripe customer
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id, email, display_name')
      .eq('id', user.id)
      .maybeSingle();

    let customerId = userData?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email || user.email,
        name: userData?.display_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const sessionMetadata = {
      supabase_user_id: user.id,
      featuredCreatorId: creatorId,
      featuredPlatform: platform,
      featuredPlacementTier: placementTier,
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[priceKey], quantity: 1 }],
      success_url: (returnUrl || `${origin}/account`) + '?featured=success',
      cancel_url: `${origin}/account`,
      allow_promotion_codes: true,
      metadata: sessionMetadata,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Payment system error. Please try again.' });
  }
}
