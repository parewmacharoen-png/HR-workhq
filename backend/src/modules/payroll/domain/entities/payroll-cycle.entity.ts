// ============================================================================
// modules/payroll/domain/entities/payroll-cycle.entity.ts
// Aggregate root. Holds the 25→23 window and drives its own lifecycle.
// Items are added through the service, not through this entity, to keep the
// aggregate small (items can be many thousands for large companies).
// ============================================================================

import { PayrollCycleLockedError } from '../errors/payroll.errors';

export type CycleStatus = 'open' | 'locked' | 'paid';

export interface PayrollCycleProps {
  id: string;
  companyId: string;
  periodStart: Date;   // 25th prev month
  periodEnd: Date;     // 23rd current month
  payDate: Date;       // 25th current month
  status: CycleStatus;
  lockedAt: Date | null;
  paidAt: Date | null;
  deletedAt: Date | null;
}

export class PayrollCycle {
  private constructor(private props: PayrollCycleProps) {}

  static rehydrate(props: PayrollCycleProps): PayrollCycle {
    return new PayrollCycle(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
  }): PayrollCycle {
    if (input.periodEnd <= input.periodStart) {
      throw new Error('periodEnd must be after periodStart');
    }
    return new PayrollCycle({
      ...input,
      status: 'open',
      lockedAt: null,
      paidAt: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get status(): CycleStatus { return this.props.status; }
  get periodStart(): Date { return this.props.periodStart; }
  get periodEnd(): Date { return this.props.periodEnd; }
  get isOpen(): boolean { return this.props.status === 'open'; }
  get isLocked(): boolean { return this.props.status === 'locked'; }

  assertOpen(): void {
    if (this.props.status !== 'open') throw new PayrollCycleLockedError();
  }

  lock(at: Date = new Date()): void {
    this.assertOpen();
    this.props.status = 'locked';
    this.props.lockedAt = at;
  }

  markPaid(at: Date = new Date()): void {
    if (this.props.status !== 'locked') {
      throw new Error('Cycle must be locked before marking paid');
    }
    this.props.status = 'paid';
    this.props.paidAt = at;
  }

  toPersistence(): PayrollCycleProps {
    return { ...this.props };
  }
}
