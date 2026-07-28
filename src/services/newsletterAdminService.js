import { supabase } from '../lib/supabase';
import { withErrorHandling } from '../lib/errorHandler';

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function invoke(action, extra) {
  const token = await getAuthToken();
  const { data, error } = await supabase.functions.invoke('newsletter-admin', {
    body: { action, ...extra },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // ignore -- fall back to the generic message
    }
    throw new Error(message);
  }
  return data;
}

export const getSubscribers = withErrorHandling(
  async () => invoke('list'),
  'newsletterAdminService.getSubscribers'
);

export const unsubscribeSubscriber = withErrorHandling(
  async (id) => (await invoke('unsubscribe', { id })).subscriber,
  'newsletterAdminService.unsubscribeSubscriber'
);

export const resubscribeSubscriber = withErrorHandling(
  async (id) => (await invoke('resubscribe', { id })).subscriber,
  'newsletterAdminService.resubscribeSubscriber'
);
