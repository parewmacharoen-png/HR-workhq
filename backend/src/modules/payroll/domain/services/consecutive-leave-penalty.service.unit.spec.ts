import {
  computeConsecutiveLeavePenalties,
  expandInclusiveDates,
} from './consecutive-leave-penalty.service';

describe('consecutive-leave-penalty.service', () => {
  const params = {
    enabled: true,
    baseDays: 2,
    laborUnits: 5,
    hourlyRate: 50,
  };

  it('expands inclusive leave dates', () => {
    expect(
      expandInclusiveDates(new Date('2026-06-10'), new Date('2026-06-12')),
    ).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('does not penalize a single multi-day request', () => {
    const result = computeConsecutiveLeavePenalties(
      [{
        requestId: 'r1',
        startDate: new Date('2026-06-10'),
        endDate: new Date('2026-06-12'),
        leaveTypeCode: 'annual',
        createdAt: new Date('2026-06-01'),
      }],
      params,
      '2026-06-01',
      '2026-06-30',
    );
    expect(result.totalDeduction).toBe(0);
  });

  it('penalizes a later day adjacent to an existing 2-day block', () => {
    const result = computeConsecutiveLeavePenalties(
      [
        {
          requestId: 'r1',
          startDate: new Date('2026-06-10'),
          endDate: new Date('2026-06-11'),
          leaveTypeCode: 'annual',
          createdAt: new Date('2026-06-01'),
        },
        {
          requestId: 'r2',
          startDate: new Date('2026-06-12'),
          endDate: new Date('2026-06-12'),
          leaveTypeCode: 'annual',
          createdAt: new Date('2026-06-05'),
        },
      ],
      params,
      '2026-06-01',
      '2026-06-30',
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].date).toBe('2026-06-12');
    expect(result.totalDeduction).toBe(250);
  });

  it('skips emergency leave', () => {
    const result = computeConsecutiveLeavePenalties(
      [
        {
          requestId: 'r1',
          startDate: new Date('2026-06-10'),
          endDate: new Date('2026-06-11'),
          leaveTypeCode: 'annual',
          createdAt: new Date('2026-06-01'),
        },
        {
          requestId: 'r2',
          startDate: new Date('2026-06-12'),
          endDate: new Date('2026-06-12'),
          leaveTypeCode: 'emergency',
          createdAt: new Date('2026-06-05'),
        },
      ],
      params,
      '2026-06-01',
      '2026-06-30',
    );
    expect(result.totalDeduction).toBe(0);
  });
});
