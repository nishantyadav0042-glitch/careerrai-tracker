import { describe, expect, it } from 'vitest';
import { flattenExpedifyPayload, pickStr, pickScore } from './expedify-payload';

// The exact shape observed in production on 29 Jul 2026 — a real AI call whose
// extracted fields never reached a student because the route read only the top
// level. Trimmed to the keys that matter; the rest of the contact is noise.
const REAL_CONTACT_UPDATED = {
  event: 'contact.updated',
  entity_id: 'def803d9-22de-497b-b0e8-ec319d46bc02',
  entity_type: 'contact',
  data: {
    id: 'def803d9-22de-497b-b0e8-ec319d46bc02',
    phone: '+918874203725',
    first_name: 'Jaya',
    lead_status: '🔥 Hot',
    call_status: 'completed',
    summary: null,
    custom_fields: {
      reason: 'User engaged well by installing the app and logging in but denied notifications.',
      emotion: 'Interested',
      category: 'CAT-A',
      next_step: 'Complete remaining setup to reach Today’s Plan',
      pain_point: "Confusion (didn't understand steps)",
      drop_reason: "Confusion (didn't understand steps)",
      momentum_score: '3',
      readiness_score: '60',
      mission_status: 'Partial',
      last_milestone_reached: 'App installed and logged in, notifications denied',
    },
  },
};

describe('flattenExpedifyPayload', () => {
  it('finds the phone that used to be invisible', () => {
    // THE bug: `payload.phone` is undefined on this shape, so no student ever
    // matched and months of real call data sat inert in the audit table.
    expect((REAL_CONTACT_UPDATED as Record<string, unknown>).phone).toBeUndefined();
    const flat = flattenExpedifyPayload(REAL_CONTACT_UPDATED as Record<string, unknown>);
    expect(pickStr(flat, 'lead_phone', 'phone', 'contact_phone', 'mobile')).toBe('+918874203725');
  });

  it('surfaces the agent-extracted fields buried in custom_fields', () => {
    const flat = flattenExpedifyPayload(REAL_CONTACT_UPDATED as Record<string, unknown>);
    expect(pickStr(flat, 'drop_reason')).toBe("Confusion (didn't understand steps)");
    expect(pickStr(flat, 'emotional_trigger', 'pain_point')).toBe("Confusion (didn't understand steps)");
    expect(pickStr(flat, 'agent_summary', 'notes', 'summary', 'reason')).toContain('installing the app');
    expect(pickStr(flat, 'category', 'lead_status')).toBe('CAT-A');
  });

  it('reads a score their CRM wrote as a string', () => {
    const flat = flattenExpedifyPayload(REAL_CONTACT_UPDATED as Record<string, unknown>);
    expect(pickScore(flat, 'momentum_score')).toBe(3);
  });

  it('still reads our own flat post-call payload unchanged', () => {
    const flat = flattenExpedifyPayload({
      event: 'call_report', phone: '+917015269714',
      installed: true, momentum_score: 4, agent_summary: 'Installed on the call.',
    });
    expect(pickStr(flat, 'phone')).toBe('+917015269714');
    expect(pickScore(flat, 'momentum_score')).toBe(4);
    expect(flat.installed).toBe(true);
  });

  it('lets the outer field win when both levels carry one', () => {
    const flat = flattenExpedifyPayload({
      phone: '+910000000000',
      data: { phone: '+911111111111', custom_fields: { phone: '+912222222222' } },
    });
    expect(pickStr(flat, 'phone')).toBe('+910000000000');
  });

  it('survives payloads with no data object at all', () => {
    expect(() => flattenExpedifyPayload({ event: 'ping' })).not.toThrow();
    expect(flattenExpedifyPayload({ data: 'not-an-object', event: 'ping' }).event).toBe('ping');
    expect(flattenExpedifyPayload({ data: null, event: 'ping' }).event).toBe('ping');
  });

  it('never turns a missing score into zero', () => {
    // A missing momentum and a momentum of 0 are different facts about a call.
    expect(pickScore(flattenExpedifyPayload({}), 'momentum_score')).toBeNull();
    expect(pickScore(flattenExpedifyPayload({ momentum_score: '' }), 'momentum_score')).toBeNull();
    expect(pickScore(flattenExpedifyPayload({ momentum_score: 'high' }), 'momentum_score')).toBeNull();
    expect(pickScore(flattenExpedifyPayload({ momentum_score: 0 }), 'momentum_score')).toBe(0);
  });

  it('clamps a score outside the 0-5 range', () => {
    expect(pickScore(flattenExpedifyPayload({ momentum_score: '99' }), 'momentum_score')).toBe(5);
    expect(pickScore(flattenExpedifyPayload({ momentum_score: -3 }), 'momentum_score')).toBe(0);
  });
});
