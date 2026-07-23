import { mergeReasonNote } from './compensation-reason.util';

describe('mergeReasonNote', () => {
  it('returns reason only', () => {
    expect(mergeReasonNote('Annual review', null)).toBe('Annual review');
  });

  it('combines reason and note', () => {
    expect(mergeReasonNote('Annual review', 'Strong KPI')).toBe('Annual review\n\nStrong KPI');
  });

  it('returns note when reason missing', () => {
    expect(mergeReasonNote(undefined, 'Note only')).toBe('Note only');
  });
});
