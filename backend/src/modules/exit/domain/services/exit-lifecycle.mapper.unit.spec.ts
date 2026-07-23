import {
  OPEN_WORKFLOW_STATUSES,
  resolveExitType,
  toLifecycleStatus,
} from './exit-lifecycle.mapper';

describe('exit-lifecycle.mapper', () => {
  it('maps exit reasons to EMP-012 types', () => {
    expect(resolveExitType('proper_resignation')).toBe('resignation');
    expect(resolveExitType('constructive_resignation')).toBe('resignation');
    expect(resolveExitType('absconding')).toBe('absconding');
    expect(resolveExitType('performance_failure')).toBe('termination');
    expect(resolveExitType('gross_misconduct')).toBe('termination');
  });

  it('maps workflow statuses to lifecycle statuses', () => {
    expect(toLifecycleStatus('draft')).toBe('OPEN');
    expect(toLifecycleStatus('pending_leader_review')).toBe('OPEN');
    expect(toLifecycleStatus('pending_owner_review')).toBe('IN_PROGRESS');
    expect(toLifecycleStatus('pending_settlement')).toBe('IN_PROGRESS');
    expect(toLifecycleStatus('settled')).toBe('IN_PROGRESS');
    expect(toLifecycleStatus('closed')).toBe('COMPLETED');
    expect(toLifecycleStatus('cancelled')).toBe('CANCELLED');
  });

  it('tracks open workflow statuses', () => {
    expect(OPEN_WORKFLOW_STATUSES).toContain('settled');
    expect(OPEN_WORKFLOW_STATUSES).not.toContain('closed');
  });
});
