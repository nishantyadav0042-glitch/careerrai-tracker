import { describe, it, expect } from 'vitest';
import { failureFacts, FIELD_MAX } from './payment-failure';
import type { RazorpayPayment } from './razorpay';

const NOW = '2026-08-29T10:00:00.000Z';
const pay = (o: Partial<RazorpayPayment>): RazorpayPayment =>
  ({ id: 'pay_x', status: 'failed', amount: 29900, ...o });

describe('failureFacts', () => {
  it('copies every field Razorpay reported', () => {
    expect(failureFacts([pay({
      method: 'upi',
      error_code: 'BAD_REQUEST_ERROR',
      error_description: 'Payment was not completed on time',
      error_source: 'customer',
      error_step: 'payment_initiation',
    })], NOW)).toEqual({
      failure_code: 'BAD_REQUEST_ERROR',
      failure_description: 'Payment was not completed on time',
      failure_source: 'customer',
      failure_step: 'payment_initiation',
      failure_method: 'upi',
      failure_seen_at: NOW,
    });
  });

  it('returns null when no attempt failed — an unattempted order is not a failure', () => {
    expect(failureFacts([], NOW)).toBeNull();
    expect(failureFacts([pay({ status: 'created' })], NOW)).toBeNull();
    expect(failureFacts([pay({ status: 'captured' })], NOW)).toBeNull();
  });

  it('records the LAST failed attempt, not the first', () => {
    // The student tried UPI, then a card. The card decline is what they were
    // looking at when they gave up; reporting the UPI error would describe a
    // moment they had already moved past.
    const facts = failureFacts([
      pay({ id: 'p1', method: 'upi', error_code: 'FIRST' }),
      pay({ id: 'p2', method: 'card', error_code: 'LAST', error_step: 'payment_authentication' }),
    ], NOW)!;
    expect(facts.failure_code).toBe('LAST');
    expect(facts.failure_method).toBe('card');
  });

  it('skips non-failed attempts when choosing the last failure', () => {
    const facts = failureFacts([
      pay({ id: 'p1', status: 'failed', error_code: 'REAL' }),
      pay({ id: 'p2', status: 'created', error_code: 'NOT_A_FAILURE' }),
    ], NOW)!;
    expect(facts.failure_code).toBe('REAL');
  });

  it('stamps failure_seen_at even when Razorpay named no error at all', () => {
    // L1: "we asked and got nothing" must stay distinguishable from "we never
    // asked". Only the timestamp can carry that, so it is never conditional.
    const facts = failureFacts([pay({})], NOW)!;
    expect(facts.failure_seen_at).toBe(NOW);
    expect(facts.failure_code).toBeNull();
    expect(facts.failure_method).toBeNull();
  });

  it('normalises absent, null, blank and non-string values to null', () => {
    const facts = failureFacts([pay({
      method: null,
      error_code: '',
      error_description: '   ',
      error_source: undefined,
      error_step: 42 as unknown as string,
    })], NOW)!;
    expect(facts.failure_method).toBeNull();
    expect(facts.failure_code).toBeNull();
    expect(facts.failure_description).toBeNull();
    expect(facts.failure_source).toBeNull();
    expect(facts.failure_step).toBeNull();
  });

  it('trims surrounding whitespace rather than storing it', () => {
    expect(failureFacts([pay({ error_code: '  GATEWAY_ERROR  ' })], NOW)!.failure_code)
      .toBe('GATEWAY_ERROR');
  });

  it('bounds a pathological value instead of writing it whole', () => {
    const facts = failureFacts([pay({ error_description: 'x'.repeat(5000) })], NOW)!;
    expect(facts.failure_description).toHaveLength(FIELD_MAX);
  });

  it('never invents a reason for a failure Razorpay did not explain', () => {
    // The one guarantee that keeps this module honest: it reports, it does not
    // classify. A UPI failure carrying no error code must not acquire one.
    const facts = failureFacts([pay({ method: 'upi' })], NOW)!;
    expect(facts.failure_method).toBe('upi');
    expect(facts.failure_code).toBeNull();
    expect(facts.failure_description).toBeNull();
    expect(facts.failure_step).toBeNull();
  });
});
