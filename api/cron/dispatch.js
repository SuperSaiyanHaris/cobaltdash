// Vercel Cron -> GitHub Actions: starts a workflow on time.
//
// GitHub's own `schedule:` triggers are best effort, and on this repo they
// ran 2.5 to 5.5 hours late (2026-09-25) or not at all. Vercel Cron fires on
// the minute, so it starts the workflows instead via workflow_dispatch; the
// heavy work itself still runs on GitHub Actions (the Twitch collection takes
// ~40 minutes, far past a function's time limit).
//
// Needs GITHUB_DISPATCH_TOKEN: a fine-grained token for this repo with
// "Actions: Read and write". Only Vercel's scheduler may call it (CRON_SECRET,
// same as stream-monitor.js).

const REPO = process.env.GITHUB_REPO || 'SuperSaiyanHaris/cobaltdash';
export const WORKFLOWS = {
  'daily-stats': 'daily-stats-collection.yml',
  'live-checks': 'live-checks.yml',
};

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('dispatch: CRON_SECRET is not set; refusing to run');
    return res.status(503).json({ error: 'CRON_SECRET not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = WORKFLOWS[req.query?.workflow];
  if (!file) return res.status(400).json({ error: 'Unknown workflow' });

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    console.error(`dispatch: GITHUB_DISPATCH_TOKEN is not set; ${file} was not started`);
    return res.status(503).json({ error: 'GITHUB_DISPATCH_TOKEN not configured' });
  }

  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${file}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      'user-agent': 'shinypull-cron',
    },
    body: JSON.stringify({ ref: 'main' }),
    signal: AbortSignal.timeout(10000),
  });
  // 204 No Content means GitHub accepted the run.
  if (r.status !== 204) {
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    console.error(`dispatch: GitHub refused ${file}: ${r.status} ${detail}`);
    return res.status(502).json({ error: `GitHub returned ${r.status}`, workflow: file });
  }
  return res.status(200).json({ dispatched: file });
}
