// ============================================================================
// modules/referral/domain/entities/referral.entity.ts
// Referral aggregate. One referral per referred employee (enforced by DB
// partial unique index). Lifecycle: pending → qualified → paid | rejected.
// ============================================================================

import {
  SelfReferralError, ReferralAlreadyQualifiedError,
  ReferralAlreadyPaidError, ReferralRejectedError,
} from '../errors/referral.errors';
import type { QualifyingCondition } from '../services/qualification.service';

export type ReferralStatus = 'pending' | 'qualified' | 'paid' | 'rejected';

export interface ReferralProps {
  id: string;
  referrerEmployeeId: string;
  referredEmployeeId: string;
  companyId: string;
  candidateId: string | null;       // recruitment integration
  rewardAmount: number;
  qualifyingCondition: QualifyingCondition | null;
  qualifiedAt: Date | null;
  status: ReferralStatus;
  payrollItemId: string | null;
  notes: string | null;
  rejectionReason: string | null;
  deletedAt: Date | null;
}

export class ReferralEntity {
  private constructor(private props: ReferralProps) {}

  static rehydrate(props: ReferralProps): ReferralEntity {
    return new ReferralEntity(props);
  }

  static create(input: {
    id: string;
    referrerEmployeeId: string;
    referredEmployeeId: string;
    companyId: string;
    candidateId?: string | null;
    notes?: string | null;
    rewardAmount: number;
  }): ReferralEntity {
    if (input.referrerEmployeeId === input.referredEmployeeId) {
      throw new SelfReferralError();
    }
    return new ReferralEntity({
      id: input.id,
      referrerEmployeeId: input.referrerEmployeeId,
      referredEmployeeId: input.referredEmployeeId,
      companyId: input.companyId,
      candidateId: input.candidateId ?? null,
      rewardAmount: input.rewardAmount,
      qualifyingCondition: null,
      qualifiedAt: null,
      status: 'pending',
      payrollItemId: null,
      notes: input.notes ?? null,
      rejectionReason: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): ReferralStatus { return this.props.status; }
  get referrerEmployeeId(): string { return this.props.referrerEmployeeId; }
  get referredEmployeeId(): string { return this.props.referredEmployeeId; }
  get companyId(): string { return this.props.companyId; }
  get rewardAmount(): number { return this.props.rewardAmount; }
  get isPending(): boolean { return this.props.status === 'pending'; }
  get isQualified(): boolean { return this.props.status === 'qualified'; }
  get isPaid(): boolean { return this.props.status === 'paid'; }

  qualify(condition: QualifyingCondition, at: Date = new Date()): void {
    if (this.props.status === 'qualified' || this.props.status === 'paid') {
      throw new ReferralAlreadyQualifiedError();
    }
    if (this.props.status === 'rejected') throw new ReferralRejectedError();
    this.props.status = 'qualified';
    this.props.qualifyingCondition = condition;
    this.props.qualifiedAt = at;
  }

  markPaid(payrollItemId: string): void {
    if (this.props.status === 'paid') throw new ReferralAlreadyPaidError();
    if (this.props.status !== 'qualified') {
      throw new Error(`Cannot mark as paid from status "${this.props.status}" — must be qualified first`);
    }
    this.props.status = 'paid';
    this.props.payrollItemId = payrollItemId;
  }

  reject(reason?: string): void {
    if (this.props.status === 'paid') throw new ReferralAlreadyPaidError();
    this.props.status = 'rejected';
    this.props.rejectionReason = reason ?? null;
  }

  addNote(note: string): void { this.props.notes = note; }

  toPersistence(): ReferralProps { return { ...this.props }; }
}
