// IndexNow ownership file and URL helpers. If the key constant and the file in
// public/ ever drift, every ping is rejected silently, so keep them in step.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INDEXNOW_KEY, INDEXNOW_KEY_URL, INDEXNOW_HOST, dailyUrls, toAbsolute } from '../../src/lib/indexNow.js';

describe('indexNow', () => {
  it('serves the key file the engines will fetch', () => {
    const file = path.join(process.cwd(), 'public', `${INDEXNOW_KEY}.txt`);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8').trim()).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(INDEXNOW_KEY_URL).toBe(`https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
  });

  it('lists the daily pages with every platform ranking', () => {
    const list = dailyUrls(['youtube', 'kick']);
    expect(list).toContain('https://shinypull.com/rankings');
    expect(list).toContain('https://shinypull.com/rankings/youtube');
    expect(list).toContain('https://shinypull.com/rankings/kick');
    expect(list.every((u) => u.startsWith('https://shinypull.com/'))).toBe(true);
  });

  it('only accepts our own pages', () => {
    expect(toAbsolute('/blog/x')).toBe('https://shinypull.com/blog/x');
    expect(toAbsolute('blog/x')).toBe('https://shinypull.com/blog/x');
    expect(toAbsolute('https://shinypull.com/best')).toBe('https://shinypull.com/best');
    expect(toAbsolute('https://example.com/x')).toBeNull();
    expect(toAbsolute('')).toBeNull();
  });
});
