/**
 * TikTok Profile Scraper
 *
 * Uses a simple HTTP fetch with a browser user agent to get profile data
 * from TikTok's __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON embedded in the page.
 * TikTok embeds all profile data (followers, likes, videos, etc.) in a
 * script tag as structured JSON, making it easy to extract without a browser.
 *
 * No Puppeteer/Chrome needed — just a lightweight HTTP request.
 */

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape TikTok profile data using HTTP fetch + embedded JSON
 */
export async function scrapeTikTokProfile(username) {
  const url = `https://www.tiktok.com/@${username}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} for ${url}`);
    err.status = response.status;
    throw err;
  }

  const html = await response.text();

  // Extract __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON from script tag
  const scriptMatch = html.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);

  if (!scriptMatch) {
    throw new Error(`No rehydration data found for ${username}`);
  }

  let data;
  try {
    data = JSON.parse(scriptMatch[1]);
  } catch (e) {
    throw new Error(`Failed to parse rehydration JSON for ${username}`);
  }

  const userInfo = data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.['userInfo'];

  if (!userInfo) {
    throw new Error(`No user info found for ${username}`);
  }

  const user = userInfo.user;
  const stats = userInfo.stats;

  if (!user || !stats) {
    throw new Error(`Incomplete user data for ${username}`);
  }

  const displayName = user.nickname || username;

  return {
    platform: 'tiktok',
    platformId: user.id || username,
    username: user.uniqueId || username,
    displayName: displayName,
    profileImage: user.avatarLarger || user.avatarMedium || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=200&bold=true&background=000000&color=fff`,
    description: user.signature || '',
    followers: stats.followerCount || 0,
    following: stats.followingCount || 0,
    totalLikes: stats.heart || stats.heartCount || 0,
    totalPosts: stats.videoCount || 0,
    isVerified: user.verified || false,
    isPrivate: user.privateAccount || false,
    category: 'Creator',
  };
}

/**
 * No-op for backwards compatibility (no browser to close)
 */
export async function closeBrowser() {
  // No browser to close — using fetch, not Puppeteer
}

/**
 * Scrape multiple profiles with delays
 */
export async function scrapeTikTokProfilesBatch(usernames, delayMs = 2000) {
  const profiles = [];

  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    try {
      console.log(`[${i + 1}/${usernames.length}] Scraping ${username}...`);
      const profile = await scrapeTikTokProfile(username);
      profiles.push(profile);
      console.log(`  ✓ ${profile.displayName}: ${(profile.followers / 1000000).toFixed(1)}M followers, ${(profile.totalLikes / 1000000).toFixed(1)}M likes`);

      if (i < usernames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`  ✗ Failed to scrape ${username}:`, error.message);
    }
  }

  return profiles;
}

export default {
  scrapeTikTokProfile,
  scrapeTikTokProfilesBatch,
  closeBrowser,
};
