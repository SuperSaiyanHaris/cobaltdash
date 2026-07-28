import { supabase } from '../lib/supabase';
import { withErrorHandling } from '../lib/errorHandler';

/**
 * Get the current session token for authenticated API calls
 */
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

/**
 * Make an authenticated request to the blog admin API
 */
async function blogAdminRequest(action, id = null, data = null) {
  const token = await getAuthToken();
  const response = await fetch('/api/blog-admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, id, data }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Blog admin request failed');
  }

  return response.json();
}

/**
 * Get all blog posts (including unpublished) for admin
 * Reads still go directly to Supabase (SELECT is always allowed)
 */
export const getAllPostsAdmin = withErrorHandling(
  async () => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },
  'blogAdminService.getAllPostsAdmin'
);

/**
 * Get a single post by ID for editing
 */
export const getPostById = withErrorHandling(
  async (id) => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },
  'blogAdminService.getPostById'
);

/**
 * Create a new blog post (via authenticated API)
 */
export const createPost = withErrorHandling(
  async (post) => {
    const result = await blogAdminRequest('create', null, post);
    return result.data;
  },
  'blogAdminService.createPost'
);

/**
 * Update an existing blog post (via authenticated API)
 */
export const updatePost = withErrorHandling(
  async (id, updates) => {
    const result = await blogAdminRequest('update', id, updates);
    return result.data;
  },
  'blogAdminService.updatePost'
);

/**
 * Delete a blog post (via authenticated API)
 */
export const deletePost = withErrorHandling(
  async (id) => {
    await blogAdminRequest('delete', id);
    return true;
  },
  'blogAdminService.deletePost'
);

/**
 * Toggle publish status (via authenticated API)
 */
export const togglePublish = withErrorHandling(
  async (id, isPublished) => {
    const result = await blogAdminRequest('togglePublish', id, { is_published: isPublished });
    return result.data;
  },
  'blogAdminService.togglePublish'
);

/**
 * Send the launch newsletter for a published post to all active subscribers.
 * Calls the newsletter-send Supabase Edge Function directly (not the Vercel
 * /api/blog-admin route -- see CLAUDE.md's Vercel function cap note, new
 * endpoints go to Edge Functions).
 */
export const sendNewsletter = withErrorHandling(
  async (postId) => {
    const token = await getAuthToken();
    const { data, error } = await supabase.functions.invoke('newsletter-send', {
      body: { postId },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      // supabase-js surfaces non-2xx responses as a generic FunctionsHttpError
      // without the JSON body attached in a stable way across versions, so
      // pull our own error message back out of the response when present.
      const context = error.context;
      let message = error.message;
      try {
        const body = await context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // ignore -- fall back to the generic message
      }
      throw new Error(message);
    }
    return data;
  },
  'blogAdminService.sendNewsletter'
);

/**
 * Generate slug from title
 */
export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
