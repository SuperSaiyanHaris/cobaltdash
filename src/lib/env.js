/**
 * Environment variable validation
 * Validates required environment variables on app startup
 */

/**
 * Validates that the required PUBLIC environment variables are set.
 *
 * SECURITY: every access below is STATIC (`import.meta.env.VITE_FOO`), never
 * dynamic (`import.meta.env[someVar]`). Dynamic/object access makes Vite inline
 * the ENTIRE set of VITE_-prefixed vars into the public bundle — which is how a
 * server key once leaked. With static access only the two public Supabase
 * values are inlined, so a stray VITE_-prefixed secret can never reach the
 * browser. Keep it that way: only the Supabase URL + anon key are public.
 *
 * @returns {boolean} True if all required vars are set
 */
export function validateEnv() {
  const missing = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    if (import.meta.env.DEV) {
      console.error(
        `[ENV] Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`
      );
    }
    return false;
  }

  if (import.meta.env.DEV) {
    console.log('[ENV] All required environment variables are configured.');
  }
  return true;
}

/**
 * Check if we're in development mode
 * @returns {boolean}
 */
export function isDev() {
  return import.meta.env.DEV === true;
}

/**
 * Check if we're in production mode
 * @returns {boolean}
 */
export function isProd() {
  return import.meta.env.PROD === true;
}

// Export environment variable names for type safety. Only PUBLIC values belong
// here — the Supabase URL and anon key are safe to ship to the browser (the
// anon key is protected by RLS). Platform API keys are server-only and are NOT
// listed here, so they never get inlined into the client bundle.
export const ENV_KEYS = {
  SUPABASE_URL: 'VITE_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'VITE_SUPABASE_ANON_KEY',
};
