// Matching tracked creators to the users Twitch returns (pure functions; the
// API calls themselves live in collectDailyStats.js).
//
// Creators are matched by the stable numeric Twitch ID (platform_id), not the
// login: a streamer who renames their channel keeps their ID, but a login
// lookup never finds them again. 970 tracked channels had gone stale that way
// by 2026-10-01. A creator without a numeric ID falls back to the login.

/** True for a numeric Twitch user ID. */
export const hasTwitchId = (creator) => /^[0-9]+$/.test(String(creator.platform_id || ''));

/** Split a batch into creators we can look up by ID and ones we can only look up by login. */
export function splitByTwitchId(creators) {
  return {
    byId: creators.filter(hasTwitchId),
    byLogin: creators.filter((c) => !hasTwitchId(c)),
  };
}

/** Match users returned for an `id=` query back to creators. Map(creator.id -> { id, login }). */
export function matchById(creators, users) {
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const found = new Map();
  for (const c of creators) {
    const u = byId.get(String(c.platform_id));
    if (u) found.set(c.id, { id: u.id, login: u.login });
  }
  return found;
}

/** Match users returned for a `login=` query back to creators. Map(creator.id -> { id, login }). */
export function matchByLogin(creators, users) {
  const byLogin = new Map(users.map((u) => [u.login.toLowerCase(), u]));
  const found = new Map();
  for (const c of creators) {
    const u = byLogin.get(String(c.username).toLowerCase());
    if (u) found.set(c.id, { id: u.id, login: u.login });
  }
  return found;
}
