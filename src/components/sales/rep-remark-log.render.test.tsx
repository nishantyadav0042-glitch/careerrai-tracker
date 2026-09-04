import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepRemarkLog } from './rep-remark-log';
import type { RepRemark } from '@/lib/sales-remarks';

// ── MY REMARKS, RENDERED ────────────────────────────────────────────────────
//
// The second half of the founder's 4 Sep order: "for each remark they have
// filled". The failure mode worth guarding is the quiet one — a failed read
// rendering as "you have written nothing", which is a confident wrong answer
// about a rep's own week's work.

function remark(over: Partial<RepRemark> = {}): RepRemark {
  return {
    studentId: 'stu-1', studentName: 'Riya Sharma',
    atIso: '2026-09-03T09:30:00Z', outcome: 'callback',
    note: 'she studies after her office shift, wants a plan for 9pm onwards',
    typed: true, actorId: 'rep-1', by: null, ...over,
  };
}
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('a rep can read back their own remarks', () => {
  it('shows each remark with the student it belongs to and a link to them', () => {
    const html = render(<RepRemarkLog items={[remark()]} failed={false} />);
    expect(html).toContain('she studies after her office shift');
    expect(html).toContain('Riya Sharma');
    expect(html).toContain('href="/sales/student/stu-1"');
    expect(html, 'the evidence class is always on the label').toContain('SELF-REPORTED');
  });

  it('a failed read says so — it never renders as "you have written nothing"', () => {
    const html = render(<RepRemarkLog items={[]} failed={true} />);
    expect(html).toContain('Could not load your remarks');
    expect(html).not.toContain('Nothing yet');
  });

  it('a genuinely empty log explains where remarks come from', () => {
    const html = render(<RepRemarkLog items={[]} failed={false} />);
    expect(html).toContain('Nothing yet');
    expect(html).not.toContain('Could not load');
  });

  it('a student whose name we cannot resolve still shows their remark', () => {
    // The remark is the point. Losing it because a profile read came back
    // thin would be exactly the wrong trade.
    const html = render(<RepRemarkLog items={[remark({ studentName: null })]} failed={false} />);
    expect(html).toContain('she studies after her office shift');
    expect(html).toContain('Student');
  });
});
