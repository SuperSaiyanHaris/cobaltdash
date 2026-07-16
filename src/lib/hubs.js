/**
 * Hub pages — curated "best X" category landing pages at /best/:slug.
 *
 * Why this file exists: `creators.category` is raw platform data and is not
 * safe to turn into URLs directly. It holds 350 distinct values with
 * inconsistent casing, near-synonyms ("Hip-Hop" vs "rap"), and a long tail of
 * genres with 1-2 creators that would make embarrassingly thin pages. This
 * module is the curation layer: a hand-checked list of hubs, each mapping one
 * or more raw category values to a stable slug and title.
 *
 * IMPORTANT: this file is imported by the edge middleware and by the sitemap
 * build script as well as the React app. Keep it dependency-free and free of
 * browser or node globals.
 *
 * Adding a hub: only add one when the category clears MIN_HUB_CREATORS in the
 * database. A hub with six creators ranks for nothing and reads as filler.
 * `npm run audit:hubs` re-checks every hub's population against the DB.
 */

// Below this, a hub is too thin to be worth a page.
export const MIN_HUB_CREATORS = 15;

/**
 * Each hub:
 *   slug       URL segment. Includes the noun ("ambient-artists") because the
 *              target query is "best ambient artists", not "best ambient".
 *   title      Display name of the category itself ("Ambient").
 *   noun       Plural noun for the members, used in headings and meta.
 *   platform   Which platform's creators populate this hub.
 *   categories Raw `creators.category` values that map here. Matched
 *              case-insensitively. Multiple values merge true synonyms into
 *              one strong page instead of two thin competing ones.
 */
export const HUBS = [
  // --- Music genres -------------------------------------------------------
  // Populated from Last.fm genre tags, which are clean and stable.
  { slug: 'pop-artists',              title: 'Pop',              noun: 'artists', platform: 'music', categories: ['pop'] },
  // "best rap artists" and "best hip hop artists" are effectively the same
  // query; merged so one page owns it rather than two splitting the signal.
  { slug: 'hip-hop-artists',          title: 'Hip-Hop',          noun: 'artists', platform: 'music', categories: ['Hip-Hop', 'rap'] },
  { slug: 'electronic-artists',       title: 'Electronic',       noun: 'artists', platform: 'music', categories: ['electronic'] },
  { slug: 'k-pop-artists',            title: 'K-Pop',            noun: 'artists', platform: 'music', categories: ['k-pop'] },
  { slug: 'country-artists',          title: 'Country',          noun: 'artists', platform: 'music', categories: ['country'] },
  { slug: 'classical-artists',        title: 'Classical',        noun: 'artists', platform: 'music', categories: ['Classical'] },
  { slug: 'jazz-artists',             title: 'Jazz',             noun: 'artists', platform: 'music', categories: ['jazz'] },
  { slug: 'rnb-artists',              title: 'R&B',              noun: 'artists', platform: 'music', categories: ['rnb'] },
  { slug: 'indie-artists',            title: 'Indie',            noun: 'artists', platform: 'music', categories: ['indie'] },
  { slug: 'house-artists',            title: 'House',            noun: 'artists', platform: 'music', categories: ['House'] },
  { slug: 'reggae-artists',           title: 'Reggae',           noun: 'artists', platform: 'music', categories: ['reggae'] },
  { slug: 'ambient-artists',          title: 'Ambient',          noun: 'artists', platform: 'music', categories: ['ambient'] },
  { slug: 'folk-artists',             title: 'Folk',             noun: 'artists', platform: 'music', categories: ['folk'] },
  { slug: 'soul-artists',             title: 'Soul',             noun: 'artists', platform: 'music', categories: ['soul'] },
  { slug: 'rock-artists',             title: 'Rock',             noun: 'artists', platform: 'music', categories: ['rock'] },
  { slug: 'techno-artists',           title: 'Techno',           noun: 'artists', platform: 'music', categories: ['techno'] },
  { slug: 'lo-fi-artists',            title: 'Lo-Fi',            noun: 'artists', platform: 'music', categories: ['Lo-Fi'] },
  { slug: 'indie-rock-artists',       title: 'Indie Rock',       noun: 'artists', platform: 'music', categories: ['indie rock'] },
  { slug: 'classic-rock-artists',     title: 'Classic Rock',     noun: 'artists', platform: 'music', categories: ['classic rock'] },
  { slug: 'indie-pop-artists',        title: 'Indie Pop',        noun: 'artists', platform: 'music', categories: ['indie pop'] },
  { slug: 'alternative-rock-artists', title: 'Alternative Rock', noun: 'artists', platform: 'music', categories: ['alternative rock'] },
  { slug: 'dance-artists',            title: 'Dance',            noun: 'artists', platform: 'music', categories: ['dance'] },
  { slug: 'trap-artists',             title: 'Trap',             noun: 'artists', platform: 'music', categories: ['trap'] },
  { slug: 'punk-artists',             title: 'Punk',             noun: 'artists', platform: 'music', categories: ['punk'] },
  { slug: 'latin-artists',            title: 'Latin',            noun: 'artists', platform: 'music', categories: ['latin'] },
  { slug: 'dream-pop-artists',        title: 'Dream Pop',        noun: 'artists', platform: 'music', categories: ['dream pop'] },
  { slug: 'reggaeton-artists',        title: 'Reggaeton',        noun: 'artists', platform: 'music', categories: ['Reggaeton'] },
  { slug: 'experimental-artists',     title: 'Experimental',     noun: 'artists', platform: 'music', categories: ['experimental'] },
];

/** Hub for a slug, or null. */
export function getHub(slug) {
  if (!slug) return null;
  return HUBS.find((h) => h.slug === slug) || null;
}

/** Hubs belonging to a platform, in declared order (roughly by size). */
export function getHubsByPlatform(platform) {
  return HUBS.filter((h) => h.platform === platform);
}

/** Distinct platforms that have at least one hub. */
export function getHubPlatforms() {
  return [...new Set(HUBS.map((h) => h.platform))];
}

/**
 * Lowercased category values for a hub. Callers match against
 * `category.toLowerCase()` so DB casing drift ("House" vs "house") can't
 * silently empty a page.
 */
export function hubCategoryMatchers(hub) {
  return hub.categories.map((c) => c.toLowerCase());
}
