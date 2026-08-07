import { describe, expect, it } from 'vitest';
import { readWorkflowVerdict } from './expedify';

// The verbatim body Expedify returned on 8 Aug 2026 with HTTP 200, while no
// contact was created and no call was ever placed. Every "call dispatched"
// count since July was built on treating this as success.
const ACCEPTED_BUT_FAILED = JSON.stringify({
  status: 'failed',
  message: '0 of 1 workflows succeeded',
  webhook_id: '852f1145-f5a1-4c0a-9185-f988958d71e1',
  results: [{
    workflow_id: '0e87ce68-dbca-481f-8e94-f5646b6d2f5d',
    workflow_name: 'Contact Updates Webhook',
    success: false,
    execution_id: '768eccf4-30b6-474d-a673-fced3309c483',
    error: 'crmmanager_1: Operation failed',
  }],
});

describe('readWorkflowVerdict', () => {
  it('calls a 200-with-failed-workflow what it is', () => {
    const v = readWorkflowVerdict(ACCEPTED_BUT_FAILED);
    expect(v.ok).toBe(false);
    expect(v.error).toContain('crmmanager_1');
    expect(v.error).toContain('Contact Updates Webhook');
  });

  it('passes a genuine success', () => {
    const v = readWorkflowVerdict(JSON.stringify({
      status: 'success', message: '1 of 1 workflows succeeded',
      results: [{ workflow_name: 'AI Calling Agent Workflow', success: true }],
    }));
    expect(v.ok).toBe(true);
  });

  it('still catches the no-workflow-attached black hole', () => {
    expect(readWorkflowVerdict('no workflows connected to this webhook').ok).toBe(false);
  });

  it('reads the counted form even when the body is not JSON', () => {
    expect(readWorkflowVerdict('0 of 2 workflows succeeded').ok).toBe(false);
    expect(readWorkflowVerdict('2 of 2 workflows succeeded').ok).toBe(true);
  });

  it('stays silent rather than guessing when the body says nothing', () => {
    // null, not false: an unrecognised body must not mark a real call failed.
    expect(readWorkflowVerdict('OK').ok).toBeNull();
    expect(readWorkflowVerdict('').ok).toBeNull();
    expect(readWorkflowVerdict(null).ok).toBeNull();
    expect(readWorkflowVerdict('{"accepted":true}').ok).toBeNull();
  });

  it('flags a failed result even when the top-level status is missing', () => {
    const v = readWorkflowVerdict(JSON.stringify({
      results: [{ workflow_name: 'X', success: false, error: 'node_2: boom' }],
    }));
    expect(v.ok).toBe(false);
    expect(v.error).toBe('X: node_2: boom');
  });
});
