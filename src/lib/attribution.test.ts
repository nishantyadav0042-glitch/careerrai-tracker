import { describe, it, expect } from 'vitest';
import { attributionFromCookie, classifyAttribution, parseAttrCookie } from './attribution';

// Attribution decides where ad budget goes. Every case here is one the founder
// would otherwise have to spot by eye in a dashboard that looks confident
// either way — a misclassified channel does not look like a bug, it looks like
// a result.

const cookie = (o: Record<string, string>) => encodeURIComponent(JSON.stringify(o));

describe('the signup path cannot be broken by a bad cookie', () => {
  it('survives anything a client can hand it', () => {
    for (const bad of ['', 'null', '{', 'not json', '%%%', '[]', '{"a":1}', 'undefined']) {
      expect(() => attributionFromCookie(bad)).not.toThrow();
    }
    expect(attributionFromCookie(null).channel).toBe('direct');
    expect(attributionFromCookie(undefined).channel).toBe('direct');
  });

  it('rejects a JSON array and a bare value rather than half-reading them', () => {
    expect(parseAttrCookie(encodeURIComponent(JSON.stringify(['google'])))).toBeNull();
    expect(parseAttrCookie(encodeURIComponent(JSON.stringify('google')))).toBeNull();
  });

  it('reads a cookie that arrived already decoded', () => {
    expect(parseAttrCookie('{"gclid":"abc"}')).toEqual({ gclid: 'abc' });
  });

  it('keeps only non-empty string values', () => {
    expect(parseAttrCookie('{"utm_source":"","gclid":"x"}')).toEqual({ gclid: 'x' });
  });
});

describe('a Google Ads click is identified with certainty', () => {
  it('gclid alone is enough — it is only ever minted by an ad click', () => {
    const a = attributionFromCookie(cookie({ gclid: 'Cj0KCQ' }));
    expect(a.channel).toBe('google_ads');
    expect(a.clickId).toBe('Cj0KCQ');
  });

  it('utm tags naming google with a paid medium also count', () => {
    expect(classifyAttribution({ utm_source: 'google', utm_medium: 'cpc' }).channel).toBe('google_ads');
    expect(classifyAttribution({ utm_source: 'Google', utm_medium: 'CPC' }).channel).toBe('google_ads');
    expect(classifyAttribution({ utm_source: 'google', utm_medium: 'paid-social' }).channel).toBe('google_ads');
  });

  it('google WITHOUT a paid medium is organic search, not ad spend', () => {
    expect(classifyAttribution({ utm_source: 'google' }).channel).toBe('organic');
  });

  it('a click id outranks a contradicting utm tag, because tags are typed by hand', () => {
    const a = classifyAttribution({ gclid: 'x', utm_source: 'facebook', utm_medium: 'cpc' });
    expect(a.channel).toBe('google_ads');
  });
});

describe('fbclid is never allowed to masquerade as paid Meta spend', () => {
  // The expensive mistake this guards: Facebook and Instagram append fbclid to
  // ANY outbound link — organic posts, bio links, DMs, shares. Counting those
  // as ad conversions inflates Meta's apparent performance with traffic Meta
  // was never paid for, and budget follows the inflated number.
  it('fbclid with no paid tag is reported separately, not as meta_ads', () => {
    const a = attributionFromCookie(cookie({ fbclid: 'IwAR123' }));
    expect(a.channel).toBe('meta_link');
    expect(a.channel).not.toBe('meta_ads');
    expect(a.clickId).toBe('IwAR123');
  });

  it('only a paid utm medium promotes a Meta click to meta_ads', () => {
    expect(classifyAttribution({ utm_source: 'instagram', utm_medium: 'cpc' }).channel).toBe('meta_ads');
    expect(classifyAttribution({ utm_source: 'facebook', utm_medium: 'paid_social', fbclid: 'z' }).channel).toBe('meta_ads');
  });

  it('an organic Meta post with utm tags but no paid medium is not ad spend', () => {
    expect(classifyAttribution({ utm_source: 'instagram', utm_medium: 'bio' }).channel).not.toBe('meta_ads');
  });
});

describe('everything else keeps its raw source instead of being guessed at', () => {
  it('an unrecognised tagged campaign is kept as campaign, with its source intact', () => {
    const a = classifyAttribution({ utm_source: 'whatsapp', utm_campaign: 'aug_blast' });
    expect(a.channel).toBe('campaign');
    expect(a.source).toBe('whatsapp');
    expect(a.campaign).toBe('aug_blast');
  });

  it('a non-google search engine is organic', () => {
    expect(classifyAttribution({ utm_source: 'bing' }).channel).toBe('organic');
  });

  it('no params at all is direct', () => {
    expect(classifyAttribution({}).channel).toBe('direct');
    expect(classifyAttribution(null).channel).toBe('direct');
  });
});

describe('captured values are bounded and normalised', () => {
  it('a hostile over-long value cannot blow up the column', () => {
    const a = classifyAttribution({ utm_source: 'x'.repeat(5000), utm_medium: 'cpc' });
    expect((a.source ?? '').length).toBeLessThanOrEqual(200);
  });

  it('case and padding never split one campaign into two rows', () => {
    const a = classifyAttribution({ utm_source: '  GOOGLE  ', utm_medium: ' CPC ' });
    expect(a.channel).toBe('google_ads');
    expect(a.source).toBe('google');
  });
});
