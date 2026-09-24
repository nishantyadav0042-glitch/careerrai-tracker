import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LogBreakerBrief } from './log-breaker-brief';

describe('the brief the counsellor reads on every open', () => {
  it('names the rule and today\'s count', () => {
    const html = renderToStaticMarkup(<LogBreakerBrief logBreakers={12} dailyLoggers={8} />);
    expect(html).toContain('non-negotiable');
    expect(html).toContain('Connect all 12 log breakers today');
    expect(html).toContain('exact words in the remark');
    expect(html).toContain('8 daily loggers');
  });

  it('says so plainly when there are none, and does not invent a feedback line', () => {
    const html = renderToStaticMarkup(<LogBreakerBrief logBreakers={0} dailyLoggers={0} />);
    expect(html).toContain('No log breakers right now');
    expect(html).not.toContain('daily logger');
  });
});
