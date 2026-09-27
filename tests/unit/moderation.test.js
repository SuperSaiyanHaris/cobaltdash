import { describe, it, expect } from 'vitest';
import { localCheck, handleProblem, profanityIn, collapseSpaced } from '../../api/_moderation.js';

const reason = (t) => localCheck(t)?.reason ?? null;

describe('localCheck', () => {
  it('lets normal comments through', () => {
    for (const t of [
      'Crazy that he passed 500M this year',
      'His videos got boring tbh, the old ones were better',
      '100,000,000 subs is insane',
      'Scunthorpe United fan here',
      'class assignment brought me here',
      'Damn that last video was good',
    ]) expect(reason(t), t).toBe(null);
  });

  it('blocks swearing, including disguised spellings, and names the word', () => {
    expect(reason('this is shit')).toBe('swearing');
    expect(reason('fuuuuck yes')).toBe('swearing');
    expect(reason('f.u.c.k this')).toBe('swearing');
    expect(reason('f u c k this')).toBe('swearing');
    expect(reason('what an @ss')).toBe('swearing');
    expect(localCheck('this is shit').message).toContain('"shit"');
  });

  it('blocks links, emails and phone numbers', () => {
    expect(reason('sub to me youtube.com/@spam')).toBe('links');
    expect(reason('https://example.org')).toBe('links');
    expect(reason('dm me at kid@example.com')).toBe('links');
    expect(reason('call 555-123-4567')).toBe('links');
  });

  it('blocks directed self-harm phrases', () => {
    for (const t of ['kys', 'k y s loser', 'go kill yourself', 'just unalive urself', 'go die']) {
      expect(reason(t), t).toBe('self_harm');
    }
  });

  it('enforces length', () => {
    expect(reason('a')).toBe('length');
    expect(reason('x'.repeat(501))).toBe('length');
  });
});

describe('collapseSpaced / profanityIn', () => {
  it('joins single letters split by punctuation', () => {
    expect(collapseSpaced('f.u.c.k off')).toBe('fuck off');
  });
  it('returns nothing for clean text', () => {
    expect(profanityIn('great video')).toEqual([]);
  });
});

describe('handleProblem', () => {
  it('accepts normal handles', () => {
    for (const h of ['jordanreacts', 'mika_k', 'kai.fan99']) expect(handleProblem(h), h).toBe(null);
  });
  it('rejects bad shapes, reserved and rude names', () => {
    expect(handleProblem('ab')).not.toBe(null);
    expect(handleProblem('has space')).not.toBe(null);
    expect(handleProblem('_lead')).not.toBe(null);
    expect(handleProblem('a..b')).not.toBe(null);
    expect(handleProblem('ShinyPull')).not.toBe(null);
    expect(handleProblem('admin')).not.toBe(null);
    expect(handleProblem('shit_lord')).not.toBe(null);
  });
});
