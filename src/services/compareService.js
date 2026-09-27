import { supabase } from '../lib/supabase';
import { reportAction } from './progressService';

/**
 * Get all saved comparisons for a user
 */
export async function getSavedCompares(userId) {
  const { data, error } = await supabase
    .from('saved_compares')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Save a comparison
 * @param {string} userId
 * @param {string} name - e.g. "MrBeast vs Ninja"
 * @param {string} creatorsParam - e.g. "youtube:mrbeast,twitch:ninja"
 */
export async function saveCompare(userId, name, creatorsParam) {
  const { data, error } = await supabase
    .from('saved_compares')
    .insert({ user_id: userId, name: name.trim(), creators_param: creatorsParam })
    .select()
    .single();

  if (error) throw error;
  // ShinyPass XP (once per matchup, verified server-side).
  reportAction('compare', data?.id);
  return data;
}

/**
 * Find a saved comparison by creators_param for a user
 * Normalizes the param (sorts entries) so order doesn't matter
 */
export async function findSavedCompare(userId, creatorsParam) {
  const normalized = creatorsParam.split(',').sort().join(',');
  const { data, error } = await supabase
    .from('saved_compares')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  // Normalize each saved entry's param and compare
  return (data || []).find(row => row.creators_param.split(',').sort().join(',') === normalized) || null;
}

/**
 * Delete a saved comparison
 */
export async function deleteSavedCompare(id) {
  const { error } = await supabase
    .from('saved_compares')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
