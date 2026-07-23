import { describe, expect, it } from 'vitest';
import {
  filterTimelineItems,
  groupTimelineItems,
  searchTimelineItems,
  sortTimelineNewestFirst,
  timelineGroupKey,
} from './employee-timeline-utils';
import type { EmployeeTimelineItem } from '../api/employee-timeline';

const base = (overrides: Partial<EmployeeTimelineItem>): EmployeeTimelineItem => ({
  id: 'item-1',
  timestamp: '2026-06-24T10:00:00.000Z',
  category: 'PERSONAL',
  eventKey: 'personal_updated',
  title: 'Personal updated',
  description: 'Changed phone number',
  actor: { name: 'Secretary User', businessRole: 'secretary' },
  source: 'Web Admin',
  icon: 'user',
  color: 'blue',
  ...overrides,
});

describe('employee timeline utils', () => {
  it('sorts newest first', () => {
    const items = [
      base({ id: 'a', timestamp: '2026-06-20T10:00:00.000Z' }),
      base({ id: 'b', timestamp: '2026-06-24T10:00:00.000Z' }),
    ];
    expect(sortTimelineNewestFirst(items).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('filters by category', () => {
    const items = [
      base({ id: 'p', category: 'PERSONAL' }),
      base({ id: 'e', category: 'EMPLOYMENT' }),
    ];
    expect(filterTimelineItems(items, 'employment').map((i) => i.id)).toEqual(['e']);
  });

  it('searches title description and actor', () => {
    const items = [
      base({ id: '1', description: 'Changed phone number' }),
      base({ id: '2', description: 'Changed department', actor: { name: 'HR Admin', businessRole: null } }),
    ];
    expect(searchTimelineItems(items, 'phone').map((i) => i.id)).toEqual(['1']);
    expect(searchTimelineItems(items, 'HR Admin').map((i) => i.id)).toEqual(['2']);
  });

  it('groups into today yesterday week earlier', () => {
    const now = new Date('2026-06-24T15:00:00.000Z');
    const items = [
      base({ id: 'today', timestamp: '2026-06-24T08:00:00.000Z' }),
      base({ id: 'yesterday', timestamp: '2026-06-23T08:00:00.000Z' }),
      base({ id: 'week', timestamp: '2026-06-22T08:00:00.000Z' }),
      base({ id: 'earlier', timestamp: '2026-06-01T08:00:00.000Z' }),
    ];
    const groups = groupTimelineItems(items, now);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'thisWeek', 'earlier']);
    expect(timelineGroupKey('2026-06-24T08:00:00.000Z', now)).toBe('today');
  });
});
