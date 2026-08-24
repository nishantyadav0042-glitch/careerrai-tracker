import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickLog } from './sales-log';
import { REASON_CATEGORIES, REASON_LABEL } from '@/lib/intervention-taxonomy';

// The C0 lesson: 3,124 tests passed while a page threw for any student with a
// mock debrief, because nothing rendered it. This is the rep's capture form —
// if it does not render, the intervention ledger stays empty and the entire
// learning loop is dead on arrival.

describe('the rep capture form renders', () => {
  const html = renderToStaticMarkup(<QuickLog studentId="00000000-0000-0000-0000-000000000001" />);

  it('renders without throwing, and cleanly', () => {
    expect(html).toContain('Log this call');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('offers every reason category — a missing option is an unrecordable lesson', () => {
    for (const r of REASON_CATEGORIES) {
      expect(html, `${r} missing from the form`).toContain(REASON_LABEL[r]);
    }
  });

  it('asks for the student’s reason, not the rep’s theory', () => {
    // Wording matters: the field is worthless if a rep records their own
    // diagnosis instead of what the student actually said.
    expect(html).toMatch(/their reason, not yours/i);
  });

  it('offers the DND outcome so "stop calling me" is always one tap', () => {
    expect(html).toMatch(/Stop calling/i);
  });

  it('offers the micro-commitment checkbox', () => {
    expect(html).toMatch(/committed to one task/i);
  });
});
