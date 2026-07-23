// ============================================================================
// modules/recruitment/domain/entities/offer.entity.ts
// ============================================================================

import { OfferAlreadyRespondedError, InvalidOfferTransitionError } from '../errors/recruitment.errors';

export type OfferStatus =
  | 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface OfferProps {
  id: string;
  candidateId: string;
  companyId: string;
  position: string;
  baseSalary: number;
  startDate: Date | null;
  expiryDate: Date;
  status: OfferStatus;
  terms: Record<string, unknown> | null;
  sentAt: Date | null;
  respondedAt: Date | null;
  notes: string | null;
  deletedAt: Date | null;
}

const TERMINAL_STATUSES: OfferStatus[] = ['accepted', 'declined', 'expired', 'withdrawn'];
const TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft:     ['sent', 'withdrawn'],
  sent:      ['accepted', 'declined', 'expired', 'withdrawn'],
  accepted:  [],
  declined:  [],
  expired:   [],
  withdrawn: [],
};

export class Offer {
  private constructor(private props: OfferProps) {}

  static rehydrate(props: OfferProps): Offer { return new Offer(props); }

  static create(input: {
    id: string; candidateId: string; companyId: string;
    position: string; baseSalary: number; expiryDate: Date;
    startDate?: Date | null; terms?: Record<string, unknown> | null;
    notes?: string | null;
  }): Offer {
    if (input.baseSalary <= 0) throw new Error('Offer salary must be positive');
    return new Offer({
      id: input.id, candidateId: input.candidateId, companyId: input.companyId,
      position: input.position.trim(), baseSalary: input.baseSalary,
      startDate: input.startDate ?? null, expiryDate: input.expiryDate,
      status: 'draft', terms: input.terms ?? null,
      sentAt: null, respondedAt: null, notes: input.notes ?? null, deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): OfferStatus { return this.props.status; }
  get candidateId(): string { return this.props.candidateId; }
  get baseSalary(): number { return this.props.baseSalary; }
  get isTerminal(): boolean { return TERMINAL_STATUSES.includes(this.props.status); }

  private transition(to: OfferStatus): void {
    if (this.isTerminal) throw new OfferAlreadyRespondedError();
    if (!TRANSITIONS[this.props.status].includes(to)) {
      throw new InvalidOfferTransitionError(this.props.status, to);
    }
    this.props.status = to;
  }

  send(): void { this.transition('sent'); this.props.sentAt = new Date(); }
  accept(): void { this.transition('accepted'); this.props.respondedAt = new Date(); }
  decline(notes?: string): void {
    this.transition('declined'); this.props.respondedAt = new Date();
    if (notes) this.props.notes = notes;
  }
  expire(): void { this.transition('expired'); }
  withdraw(notes?: string): void {
    this.transition('withdrawn');
    if (notes) this.props.notes = notes;
  }

  toPersistence(): OfferProps { return { ...this.props }; }
}
