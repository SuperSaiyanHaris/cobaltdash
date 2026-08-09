import { supabase } from '../lib/supabase';
import { withErrorHandling } from '../lib/errorHandler';

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function invoke(action, extra) {
  const token = await getAuthToken();
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, ...extra },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // ignore — fall back to the generic message
    }
    throw new Error(message);
  }
  return data;
}

export const getUsers = withErrorHandling(
  async () => invoke('list'),
  'adminUsersService.getUsers'
);

export const getUserDetail = withErrorHandling(
  async (userId) => invoke('detail', { userId }),
  'adminUsersService.getUserDetail'
);

export const suspendUser = withErrorHandling(
  async (userId) => invoke('suspend', { userId }),
  'adminUsersService.suspendUser'
);

export const unsuspendUser = withErrorHandling(
  async (userId) => invoke('unsuspend', { userId }),
  'adminUsersService.unsuspendUser'
);

// Cancels any user's listing on their behalf. Stays on /api/stripe-checkout
// (not the admin-users edge function) because that's where the Stripe SDK
// is already wired up for the Node runtime — see api/stripe-checkout.js's
// adminOverride branch.
export const adminCancelListing = withErrorHandling(
  async (listingId) => {
    const token = await getAuthToken();
    const res = await fetch('/api/stripe-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ priceKey: 'cancel-listing', listingId, adminOverride: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel listing');
    return data;
  },
  'adminUsersService.adminCancelListing'
);
