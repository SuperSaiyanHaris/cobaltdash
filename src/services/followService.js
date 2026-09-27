import { supabase } from '../lib/supabase';
import logger from '../lib/logger';
import { withErrorHandling, AuthenticationError } from '../lib/errorHandler';
import { reportAction } from './progressService';

/**
 * Ensure user exists in users table
 * @param {string} userId - The user's ID
 */
async function ensureUserExists(userId) {
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existingUser) return;

  // Get user data from auth
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return;

  // Create user record
  await supabase
    .from('users')
    .insert({
      id: userId,
      email: user.email,
      display_name: user.user_metadata?.display_name || user.email,
      avatar_url: user.user_metadata?.avatar_url,
    })
    .select()
    .single();
}

/**
 * Follow a creator
 * @param {string} userId - The user's ID
 * @param {string} creatorId - The creator's ID
 */
export const followCreator = withErrorHandling(
  async (userId, creatorId) => {
    if (!userId) {
      throw new AuthenticationError('User must be logged in to follow creators');
    }

    // Ensure user exists in users table
    await ensureUserExists(userId);

    const { error } = await supabase
      .from('user_saved_creators')
      .insert({ user_id: userId, creator_id: creatorId });

    if (error) {
      // Ignore duplicate errors (already following)
      if (error.code === '23505') return true;
      throw error;
    }

    // ShinyPass XP (once per creator, verified server-side).
    reportAction('follow', creatorId);
    return true;
  },
  'followService.followCreator'
);

/**
 * Unfollow a creator
 * @param {string} userId - The user's ID
 * @param {string} creatorId - The creator's ID
 */
export const unfollowCreator = withErrorHandling(
  async (userId, creatorId) => {
    if (!userId) {
      throw new AuthenticationError('User must be logged in to unfollow creators');
    }

    const { error } = await supabase
      .from('user_saved_creators')
      .delete()
      .eq('user_id', userId)
      .eq('creator_id', creatorId);

    if (error) {
      throw error;
    }

    return true;
  },
  'followService.unfollowCreator'
);

/**
 * Check if user is following a creator
 * @param {string} userId - The user's ID
 * @param {string} creatorId - The creator's ID
 * @returns {Promise<boolean>}
 */
export const isFollowing = withErrorHandling(
  async (userId, creatorId) => {
    if (!userId) return false;

    const { data, error } = await supabase
      .from('user_saved_creators')
      .select('id')
      .eq('user_id', userId)
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (error) throw error;

    return !!data;
  },
  'followService.isFollowing'
);

/**
 * Get all creators a user is following with their latest stats
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>}
 */
export const getFollowedCreators = withErrorHandling(
  async (userId) => {
    if (!userId) {
      throw new AuthenticationError('User must be logged in to view followed creators');
    }

    const { data, error } = await supabase
      .from('user_saved_creators')
      .select(`
        creator_id,
        created_at,
        creators (
          id,
          platform,
          platform_id,
          username,
          display_name,
          profile_image,
          description,
          category
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Flatten the result
    return (data || []).map(item => ({
      ...item.creators,
      followedAt: item.created_at,
    }));
  },
  'followService.getFollowedCreators'
);

/**
 * Get the count of followers for a creator
 * @param {string} creatorId - The creator's ID
 * @returns {Promise<number>}
 */
export const getFollowerCount = withErrorHandling(
  async (creatorId) => {
    const { count, error } = await supabase
      .from('user_saved_creators')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', creatorId);

    if (error) {
      throw error;
    }

    return count || 0;
  },
  'followService.getFollowerCount'
);
