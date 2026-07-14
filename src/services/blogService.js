import { supabase } from '../lib/supabase';
import { withErrorHandling } from '../lib/errorHandler';

/**
 * Get all published blog posts, sorted by date (newest first)
 */
export const getAllPosts = withErrorHandling(
  async () => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, title, description, category, author, image, read_time, published_at')
      .eq('is_published', true)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
  'blogService.getAllPosts'
);

/**
 * Get a single post by its slug (includes full content).
 * Pass { includeDrafts: true } for the ?preview=1 review flow — drafts render
 * before publishing. Blog rows are world-readable by design (public content).
 */
export const getPostBySlug = withErrorHandling(
  async (slug, { includeDrafts = false } = {}) => {
    let query = supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug);
    if (!includeDrafts) query = query.eq('is_published', true);
    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
  'blogService.getPostBySlug'
);

/**
 * Get posts by category
 */
export const getPostsByCategory = withErrorHandling(
  async (category) => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, title, description, category, author, image, read_time, published_at')
      .eq('is_published', true)
      .eq('category', category)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
  'blogService.getPostsByCategory'
);

/**
 * Get all unique categories from published posts
 */
export const getAllCategories = withErrorHandling(
  async () => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('category')
      .eq('is_published', true);

    if (error) throw error;

    // Extract unique categories
    const categories = [...new Set((data || []).map(post => post.category).filter(Boolean))];
    return categories;
  },
  'blogService.getAllCategories'
);

/**
 * Get related posts (same category, excluding current post)
 */
export const getRelatedPosts = withErrorHandling(
  async (category, excludeSlug, limit = 2) => {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, title, description, category, image, read_time, published_at')
      .eq('is_published', true)
      .eq('category', category)
      .neq('slug', excludeSlug)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },
  'blogService.getRelatedPosts'
);
