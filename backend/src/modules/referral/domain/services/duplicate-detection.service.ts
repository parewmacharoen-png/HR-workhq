// ============================================================================
// modules/referral/domain/services/duplicate-detection.service.ts
// Pure duplicate-detection logic.
// Three signals checked in order: phone → national_id → bank_account.
// Returns which signals matched and the masked value for audit logging.
// The actual DB lookup is done by the repository (DuplicateCheckRepository);
// this service only decides what to mask and how to interpret results.
// ============================================================================

export type DuplicateSignal = 'phone' | 'national_id' | 'bank_account';

export interface DuplicateCheckInput {
  phone: string | null;
  nationalId: string | null;         // plaintext (decrypted before passing in)
  bankAccountNo: string | null;      // plaintext (decrypted before passing in)
}

export interface DuplicateCheckResult {
  signal: DuplicateSignal;
  matchFound: boolean;
  matchDetail: string | null;   // masked version for audit (never full value)
}

export class DuplicateDetectionService {
  /**
   * Produces masked display strings for each signal.
   * These are stored in the audit log, never the raw values.
   */
  maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.slice(0, 2) + '****' + phone.slice(-2);
  }

  maskNationalId(id: string): string {
    if (id.length <= 4) return '****';
    return '****' + id.slice(-4);
  }

  maskBankAccount(acct: string): string {
    if (acct.length <= 4) return '****';
    return '****' + acct.slice(-4);
  }

  /**
   * Build the set of signals to check from available data.
   * Signals with null values are skipped.
   */
  signalsFor(input: DuplicateCheckInput): Array<{ signal: DuplicateSignal; value: string; masked: string }> {
    const signals: Array<{ signal: DuplicateSignal; value: string; masked: string }> = [];
    if (input.phone) {
      signals.push({ signal: 'phone', value: input.phone, masked: this.maskPhone(input.phone) });
    }
    if (input.nationalId) {
      signals.push({ signal: 'national_id', value: input.nationalId, masked: this.maskNationalId(input.nationalId) });
    }
    if (input.bankAccountNo) {
      signals.push({ signal: 'bank_account', value: input.bankAccountNo, masked: this.maskBankAccount(input.bankAccountNo) });
    }
    return signals;
  }

  /**
   * Given raw DB match results, decide the overall duplicate verdict.
   * Returns true if ANY signal produced a match.
   */
  isDuplicate(results: DuplicateCheckResult[]): boolean {
    return results.some(r => r.matchFound);
  }

  /**
   * Return the first matching signal's description for error messages.
   */
  firstMatchSignal(results: DuplicateCheckResult[]): DuplicateSignal | null {
    return results.find(r => r.matchFound)?.signal ?? null;
  }
}
