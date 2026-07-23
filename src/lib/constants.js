/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// Number formatting thresholds
export const NUMBER_THRESHOLDS = {
  THOUSAND: 1000,
  MILLION: 1000000,
  BILLION: 1000000000,
  TRILLION: 1000000000000,
};

// Timeout durations (in milliseconds)
export const TIMEOUTS = {
  COPY_FEEDBACK: 2000,      // Time to show "copied" feedback
  SUCCESS_MESSAGE: 3000,    // Time to show success notifications
  ERROR_MESSAGE: 5000,      // Time to show error notifications
  LIVE_COUNT_REFRESH: 30000, // Live count refresh interval
};

// YouTube CPM rates for earnings estimation ($ per 1000 views)
export const YOUTUBE_CPM = {
  LOW: 2,   // Low estimate
  HIGH: 7,  // High estimate
};

// Subscriber/follower milestones for progress tracking
export const SUBSCRIBER_MILESTONES = [
  100000,     // 100K
  250000,     // 250K
  500000,     // 500K
  750000,     // 750K
  1000000,    // 1M
  2000000,    // 2M
  5000000,    // 5M
  10000000,   // 10M
  25000000,   // 25M
  50000000,   // 50M
  75000000,   // 75M
  100000000,  // 100M
  150000000,  // 150M
  200000000,  // 200M
  250000000,  // 250M
  300000000,  // 300M
];

// View count milestones
export const VIEW_MILESTONES = [
  1000000,        // 1M
  5000000,        // 5M
  10000000,       // 10M
  25000000,       // 25M
  50000000,       // 50M
  100000000,      // 100M
  250000000,      // 250M
  500000000,      // 500M
  1000000000,     // 1B
  2500000000,     // 2.5B
  5000000000,     // 5B
  10000000000,    // 10B
  25000000000,    // 25B
  50000000000,    // 50B
  100000000000,   // 100B
  250000000000,   // 250B
  500000000000,   // 500B
  1000000000000,  // 1T
];

// Live count random offset thresholds (for realistic subscriber animation)
export const LIVE_COUNT_OFFSETS = {
  HUGE: { threshold: 100000000, offset: 50000 },    // 100M+: ±50k
  VERY_LARGE: { threshold: 50000000, offset: 25000 }, // 50M-100M: ±25k
  LARGE: { threshold: 10000000, offset: 10000 },    // 10M-50M: ±10k
  MEDIUM: { threshold: 1000000, offset: 5000 },     // 1M-10M: ±5k
  SMALL: { threshold: 100000, offset: 1000 },       // 100k-1M: ±1k
  TINY: { threshold: 10000, offset: 500 },          // 10k-100k: ±500
  DEFAULT: { offset: 100 },                          // <10k: ±100
};

// Growth rate multipliers based on channel size
export const GROWTH_MULTIPLIERS = {
  HUGE: { threshold: 100000000, multiplier: 3 },
  VERY_LARGE: { threshold: 50000000, multiplier: 2.5 },
  LARGE: { threshold: 10000000, multiplier: 2 },
  MEDIUM: { threshold: 1000000, multiplier: 1.5 },
  SMALL: { threshold: 100000, multiplier: 1 },
  DEFAULT: { multiplier: 0.5 },
};

// Chart configuration
export const CHART_CONFIG = {
  MIN_PADDING_PERCENT: 0.01,  // Minimum 1% padding for chart axis
  DEFAULT_MIN_RANGE: 1000,    // Default minimum range for chart values
};

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  SEARCH_RESULTS_LIMIT: 10,
};

// Blog categories
export const BLOG_CATEGORIES = [
  'Creator Economy',
  'Industry News',
  'Platform Updates',
  'Analytics',
  'Tips & Strategy',
  'Growth Tips',
  'Industry Insights',
  'Tutorials',
  'YouTube News',
  'Twitch Trends',
  'Creator Spotlight',
  'Rankings',
];

// Platform identifiers — single source of truth.
//
// When adding a new platform, append its id here. Anywhere in the codebase
// that displays a platform count should import PLATFORM_COUNT instead of
// hardcoding 6/7/8/etc. Stale counts have shipped to production three times
// because the number was hardcoded in two separate places.
export const PLATFORM_IDS = [
  'youtube',
  'tiktok',
  'twitch',
  'kick',
  'bluesky',
  'music',
  'mastodon',
  'rumble',
  'substack',
];

export const PLATFORM_COUNT = PLATFORM_IDS.length;

// Correctly-cased brand names — single source of truth. Never derive a
// platform's display name by capitalizing the id string (`platform.charAt(0)
// .toUpperCase() + platform.slice(1)`); that mangles YouTube -> "Youtube" and
// TikTok -> "Tiktok". Always look it up here instead.
export const PLATFORM_DISPLAY_NAMES = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  kick: 'Kick',
  bluesky: 'Bluesky',
  music: 'Music',
  mastodon: 'Mastodon',
  rumble: 'Rumble',
  substack: 'Substack',
};

// Legacy enum (kept for backward compat — prefer PLATFORM_IDS for iteration)
export const PLATFORMS = {
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  TWITCH: 'twitch',
  KICK: 'kick',
  BLUESKY: 'bluesky',
  MUSIC: 'music',
  MASTODON: 'mastodon',
  RUMBLE: 'rumble',
  SUBSTACK: 'substack',
};
