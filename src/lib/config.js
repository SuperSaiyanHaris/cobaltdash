/**
 * Application configuration
 * Centralized location for URLs and environment-based settings
 */

// Base site URL - used for SEO, sharing, and structured data
export const SITE_URL = 'https://shinypull.com';

// Default OG image for social sharing. SEO.jsx applies this client-side to any
// page that doesn't pass its own `image`, so it needs to match what
// middleware.js serves to crawlers in the server HTML for the same routes.
// It previously pointed at a stale standalone public/og-image.png from an
// earlier design, which is now unreferenced (left in place so old cached
// social cards don't 404). Cards are built by scripts/generateOgImages.mjs.
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og/home.jpg`;

// Logo URL
export const LOGO_URL = `${SITE_URL}/logo.png`;

// Social sharing URLs
export const SOCIAL_SHARE_URLS = {
  twitter: (url, text) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  facebook: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  linkedin: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
};

// ShinyPull social media profiles
export const SOCIAL_PROFILES = {
  twitter: 'https://twitter.com/shinypull',
  facebook: 'https://facebook.com/shinypull',
};

// Platform profile URL generators
export const PLATFORM_URLS = {
  youtube: {
    channel: (username) => `https://youtube.com/@${username}`,
    channelById: (id) => `https://www.youtube.com/channel/${id}`,
    about: (id) => `https://www.youtube.com/channel/${id}/about`,
    videos: (id) => `https://www.youtube.com/channel/${id}/videos`,
    community: (id) => `https://www.youtube.com/channel/${id}/community`,
  },
  twitch: {
    channel: (username) => `https://twitch.tv/${username}`,
    videos: (username) => `https://twitch.tv/${username}/videos`,
    schedule: (username) => `https://twitch.tv/${username}/schedule`,
    about: (username) => `https://twitch.tv/${username}/about`,
  },
  tiktok: {
    profile: (username) => `https://tiktok.com/@${username}`,
  },
};

// External API base URLs
export const API_URLS = {
  youtube: 'https://www.googleapis.com/youtube/v3',
  twitch: 'https://api.twitch.tv/helix',
};

// Schema.org context
export const SCHEMA_CONTEXT = 'https://schema.org';

// Helper to build full site URLs
export function getSiteUrl(path = '') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
