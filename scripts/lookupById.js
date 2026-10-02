// Matching tracked Kick and Bluesky creators to what the platform returns
// (pure functions; the API calls live in collectDailyStats.js).
//
// Both platforms let people change their name (a Kick slug, a Bluesky handle)
// but keep a permanent ID, and we store that ID in creators.platform_id. A
// name lookup never finds a renamed account again: by 2026-10-01, 150 of 151
// stale Kick channels and 21 of 24 stale Bluesky accounts were just renames.
// So look up by the permanent ID, and fall back to the name only when a
// creator has no usable ID.

/** True for a numeric ID (Kick's broadcaster_user_id). */
export const hasNumericId = (creator) => /^[0-9]+$/.test(String(creator.platform_id || ''));

/** True for a Bluesky DID. */
export const hasDid = (creator) => String(creator.platform_id || '').startsWith('did:');

/** Split creators into those we can look up by ID and those only by name. */
export function splitBy(creators, hasId) {
  return { byId: creators.filter(hasId), byName: creators.filter((c) => !hasId(c)) };
}

/**
 * Kick: match channels back to creators, by broadcaster_user_id first and by
 * slug otherwise. Map(creator.id -> { subscribers }). A channel Kick returned
 * with 0 paid subs is a real reading and is kept.
 */
export function matchKickChannels(creators, channels) {
  const byId = new Map(channels.map((c) => [String(c.broadcaster_user_id), c]));
  const bySlug = new Map(channels.map((c) => [String(c.slug).toLowerCase(), c]));
  const found = new Map();
  for (const creator of creators) {
    const ch = (hasNumericId(creator) && byId.get(String(creator.platform_id)))
      || bySlug.get(String(creator.username).toLowerCase());
    if (ch) found.set(creator.id, { subscribers: ch.active_subscribers_count || 0, slug: ch.slug });
  }
  return found;
}

/**
 * Bluesky: match profiles back to creators, by DID first and by handle
 * otherwise. Map(creator.id -> { followers, totalPosts, handle }).
 */
export function matchBlueskyProfiles(creators, profiles) {
  const byDid = new Map(profiles.map((p) => [p.did, p]));
  const byHandle = new Map(profiles.map((p) => [String(p.handle).toLowerCase(), p]));
  const found = new Map();
  for (const creator of creators) {
    const p = (hasDid(creator) && byDid.get(creator.platform_id))
      || byHandle.get(String(creator.username).toLowerCase());
    if (p) found.set(creator.id, { followers: p.followersCount ?? 0, totalPosts: p.postsCount ?? 0, handle: p.handle });
  }
  return found;
}

/** What to ask Bluesky for: the DID when we have it, else the handle. */
export const blueskyActor = (creator) => (hasDid(creator) ? creator.platform_id : String(creator.username).toLowerCase());
