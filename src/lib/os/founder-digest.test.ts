import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { digestToHtml, type DigestBlock } from './founder-digest';

describe('the daily digest tells the founder the state before they open anything', () => {
  const sample: DigestBlock = {
    score: 78,
    new24h: { students: 12, premium: 2, revenueRupees: 3998 },
    critical: [{ title: '₹999 captured but premium never unlocked for Riya', student: 'Riya' }],
    attention: [{ title: '3 students going cold', count: 3 }],
    ai: { rupeesToday: 4.2, spikeRatio: 3.1 },
    headline: '1 critical issue needs you today — paid students at risk.',
  };

  it('leads with critical paid-student issues', () => {
    const html = digestToHtml(sample);
    expect(html).toContain('Critical');
    expect(html).toContain('Riya');
  });

  it('shows the 24h business numbers and AI cost', () => {
    const html = digestToHtml(sample);
    expect(html).toContain('12 new students');
    expect(html).toContain('2 new premium');
    expect(html).toContain('₹3998');
    expect(html).toContain('₹4.20');
  });

  it('flags an AI cost spike', () => {
    expect(digestToHtml(sample)).toContain('3.1×');
  });

  it('reuses the same Founder Score the Command Center shows', () => {
    // The digest score IS inbox.score (buildFounderDigest returns inbox.score),
    // so the morning email and the live screen can never disagree.
    const src = readFileSync('src/lib/os/founder-digest.ts', 'utf8');
    expect(src).toContain('score: inbox.score');
  });

  it('is wired into the existing 8am cron, not a duplicate', () => {
    const cron = readFileSync('src/app/api/cron/founder-digest/route.ts', 'utf8');
    expect(cron).toContain('buildFounderDigest');
    expect(cron).toContain('digestToHtml');
  });
});
