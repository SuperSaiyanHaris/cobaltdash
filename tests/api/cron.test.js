import { describe, it, expect, vi } from 'vitest';

const twitch = vi.fn(async () => ({ sessionsStarted: 1 }));
const kick = vi.fn(async () => ({ sessionsStarted: 2 }));
vi.mock('../../scripts/monitorTwitchStreams.js', () => ({ monitorStreams: () => twitch() }));
vi.mock('../../scripts/monitorKickStreams.js', () => ({ monitorStreams: () => kick() }));
const { default: handler } = await import('../../api/cron/stream-monitor.js');

async function call(headers) {
  const out = {};
  await handler({ headers }, { status(s) { out.status = s; return this; }, json(j) { out.body = j; return this; } });
  return out;
}

describe('/api/cron/stream-monitor', () => {
  it('refuses to run with no CRON_SECRET configured', async () => {
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: 'Bearer anything' })).status).toBe(503);
    expect(twitch).not.toHaveBeenCalled();
  });
  it('rejects missing or wrong secrets', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: 'Bearer nope' })).status).toBe(401);
    expect(twitch).not.toHaveBeenCalled();
  });
  it('runs both sweeps for Vercel Cron, and one failing does not stop the other', async () => {
    process.env.CRON_SECRET = 's3cret';
    twitch.mockRejectedValueOnce(new Error('twitch down'));
    const r = await call({ authorization: 'Bearer s3cret' });
    expect(r.status).toBe(500);
    expect(kick).toHaveBeenCalled();
    expect(r.body.kick).toEqual({ sessionsStarted: 2 });
    expect(r.body.twitch.error).toBe('twitch down');
  });
});
