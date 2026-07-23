// ============================================================================
// modules/employee/application/employee-events.service.unit.spec.ts
// (probation ending soon buckets)
// ============================================================================

import { EmployeeEventsService } from './employee-events.service';

describe('EmployeeEventsService probation buckets (unit)', () => {
  const service = new EmployeeEventsService({} as never, {} as never);

  it('buildProbationEndingSoon groups employees by 7/14/30 day windows', () => {
    const asOf = new Date('2026-06-23T02:00:00.000Z');
    const buckets = (service as unknown as {
      buildProbationEndingSoon: (employees: Array<{
        id: string;
        firstName: string;
        lastName: string;
        department: string | null;
        position: string | null;
        employmentStatus: string;
        probationEndDate: Date | null;
      }>, asOf: Date) => unknown;
    }).buildProbationEndingSoon([
      {
        id: 'e1',
        firstName: 'A',
        lastName: 'One',
        department: 'HR',
        position: 'Officer',
        employmentStatus: 'probation',
        probationEndDate: new Date('2026-06-28'),
      },
      {
        id: 'e2',
        firstName: 'B',
        lastName: 'Two',
        department: 'Sales',
        position: 'Rep',
        employmentStatus: 'probation',
        probationEndDate: new Date('2026-07-10'),
      },
      {
        id: 'e3',
        firstName: 'C',
        lastName: 'Three',
        department: 'Ops',
        position: 'Staff',
        employmentStatus: 'active',
        probationEndDate: new Date('2026-06-25'),
      },
    ], asOf);

    expect(buckets).toEqual({
      within7Days: [expect.objectContaining({ employeeId: 'e1', daysRemaining: 5 })],
      within14Days: [expect.objectContaining({ employeeId: 'e1', daysRemaining: 5 })],
      within30Days: [
        expect.objectContaining({ employeeId: 'e1', daysRemaining: 5 }),
        expect.objectContaining({ employeeId: 'e2', daysRemaining: 17 }),
      ],
    });
  });
});
