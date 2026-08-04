import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { waMessages } from './wa-messages';
import { SITE_URL } from './site';

// Founder rule (5 Aug): EVERY WhatsApp outreach message must carry the app
// link. ~45 of these go out daily; a message without the link is a dead end —
// the student has to go hunting for the app instead of tapping.
//
// Two layers of enforcement:
//  1. The template FUNCTIONS we can call are rendered and checked directly.
//  2. The message-builder FILES that inline their text are source-scanned:
//     every template literal that speaks in the outreach voice ("Nishant",
//     "CareerRai") must interpolate SITE_URL. This catches a new template
//     added to an existing builder without the link.

const link = SITE_URL; // https://careerrai.in unless overridden by env

describe('every wa-messages template carries the app link', () => {
  it('all lead templates include the site URL', () => {
    const msgs = waMessages({ firstName: 'Aarav', dreamCollege: 'IIM Ahmedabad' });
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(m.text, `template "${m.key}" is missing the app link`).toContain(link);
    }
  });
});

describe('every inline outreach builder interpolates SITE_URL', () => {
  // Files that build WhatsApp outreach text inline, each with the phrase its
  // templates reliably carry (the founder signature, or the pitch's product
  // name). If you add a new outreach surface, add it here — and put the link
  // in your message.
  const BUILDERS: Array<{ file: string; marker: string }> = [
    { file: 'src/lib/mission-queue.ts',               marker: 'Nishant' }, // the daily-45 queue
    { file: 'src/lib/sales-conversion.ts',            marker: 'Exam Buddy' },
    { file: 'src/app/admin/reminders/page.tsx',       marker: 'Nishant' },
    { file: 'src/app/admin/wants-buddy/page.tsx',     marker: 'Nishant' },
    { file: 'src/app/admin/going-cold/page.tsx',      marker: 'Nishant' },
    { file: 'src/app/admin/streak-breakers/page.tsx', marker: 'Nishant' },
  ];

  for (const { file, marker } of BUILDERS) {
    it(`${file}: every outreach template literal contains \${SITE_URL}`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} no longer imports SITE_URL — outreach links broke`).toContain("from '@/lib/site'");
      const re = new RegExp('`[^`]*' + marker + '[^`]*`', 'gs');
      const templates = src.match(re) ?? [];
      expect(templates.length, `${file} has no outreach templates — did the marker change?`).toBeGreaterThan(0);
      for (const t of templates) {
        expect(t, `an outreach template in ${file} is missing \${SITE_URL}:\n${t.slice(0, 120)}…`).toContain('${SITE_URL}');
      }
    });
  }
});
