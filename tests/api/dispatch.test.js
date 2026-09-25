import { describe, it, expect, vi, beforeEach } from 'vitest';

const { default: handler } = await import('../../api/cron/dispatch.js');

async function call(headers, query = {}) {
  const out = {};
  await handler({ headers, query }, { status(s) { out.status = s; return this; }, json(j) { out.body = j; return this; } });
  return out;
}

describe('/api/cron/dispatch', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cret';
    process.env.GITHUB_DISPATCH_TOKEN = 'ghp_test';
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
  });

  it('rejects callers without the cron secret', async () => {
    expect((await call({}, { workflow: 'daily-stats' })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses unknown workflows', async () => {
    expect((await call({ authorization: 'Bearer s3cret' }, { workflow: 'rm-rf' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a missing token instead of silently doing nothing', async () => {
    delete process.env.GITHUB_DISPATCH_TOKEN;
    expect((await call({ authorization: 'Bearer s3cret' }, { workflow: 'daily-stats' })).status).toBe(503);
  });

  it('dispatches the workflow on main', async () => {
    const r = await call({ authorization: 'Bearer s3cret' }, { workflow: 'daily-stats' });
    expect(r.status).toBe(200);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/SuperSaiyanHaris/cobaltdash/actions/workflows/daily-stats-collection.yml/dispatches');
    expect(init.headers.authorization).toBe('Bearer ghp_test');
    expect(JSON.parse(init.body)).toEqual({ ref: 'main' });
  });

  it('surfaces a GitHub refusal as a failure', async () => {
    fetch.mockResolvedValueOnce(new Response('{"message":"Resource not accessible"}', { status: 403 }));
    expect((await call({ authorization: 'Bearer s3cret' }, { workflow: 'live-checks' })).status).toBe(502);
  });
});
