// ============================================================================
// modules/referral/domain/services/duplicate-detection.service.unit.spec.ts
// ============================================================================

import { DuplicateDetectionService, DuplicateCheckResult } from './duplicate-detection.service';

describe('DuplicateDetectionService', () => {
  const svc = new DuplicateDetectionService();

  // ── maskPhone ─────────────────────────────────────────────────────────────

  describe('maskPhone', () => {
    it('masks a 10-digit phone to first2 + **** + last2', () => {
      expect(svc.maskPhone('0812345678')).toBe('08****78');
    });

    it('masks an 8-digit phone correctly', () => {
      expect(svc.maskPhone('08123456')).toBe('08****56');
    });

    it('returns **** for a 4-character phone (boundary)', () => {
      expect(svc.maskPhone('0812')).toBe('****');
    });

    it('returns **** for a 3-character phone', () => {
      expect(svc.maskPhone('081')).toBe('****');
    });

    it('returns **** for a 1-character phone', () => {
      expect(svc.maskPhone('0')).toBe('****');
    });

    it('returns **** for empty string', () => {
      expect(svc.maskPhone('')).toBe('****');
    });

    it('a 5-character phone exposes only first 2 and last 2', () => {
      expect(svc.maskPhone('01234')).toBe('01****34');
    });

    it('does not expose middle digits for long phone numbers', () => {
      const masked = svc.maskPhone('+66812345678');
      expect(masked).not.toContain('2345');
      expect(masked.startsWith('+6')).toBe(true);
      expect(masked.endsWith('78')).toBe(true);
    });
  });

  // ── maskNationalId ────────────────────────────────────────────────────────

  describe('maskNationalId', () => {
    it('masks a 13-digit Thai national ID to ****+last4', () => {
      expect(svc.maskNationalId('1234567890123')).toBe('****0123');
    });

    it('masks a 9-digit passport number to ****+last4', () => {
      expect(svc.maskNationalId('AB1234567')).toBe('****4567');
    });

    it('returns **** for exactly 4 characters', () => {
      expect(svc.maskNationalId('1234')).toBe('****');
    });

    it('returns **** for fewer than 4 characters', () => {
      expect(svc.maskNationalId('123')).toBe('****');
      expect(svc.maskNationalId('')).toBe('****');
    });

    it('shows only last 4 digits for a 5-character ID', () => {
      expect(svc.maskNationalId('12345')).toBe('****2345');
    });

    it('never exposes prefix digits', () => {
      const masked = svc.maskNationalId('9999999990001');
      expect(masked).not.toContain('99999999');
      expect(masked).toBe('****0001');
    });
  });

  // ── maskBankAccount ───────────────────────────────────────────────────────

  describe('maskBankAccount', () => {
    it('masks a 10-digit bank account to ****+last4', () => {
      expect(svc.maskBankAccount('1234567890')).toBe('****7890');
    });

    it('returns **** for exactly 4 characters', () => {
      expect(svc.maskBankAccount('1234')).toBe('****');
    });

    it('returns **** for fewer than 4 characters', () => {
      expect(svc.maskBankAccount('12')).toBe('****');
      expect(svc.maskBankAccount('')).toBe('****');
    });

    it('exposes only last 4 for a 5-character account', () => {
      expect(svc.maskBankAccount('12345')).toBe('****2345');
    });
  });

  // ── signalsFor ────────────────────────────────────────────────────────────

  describe('signalsFor', () => {
    it('returns all three signals when all fields are provided', () => {
      const signals = svc.signalsFor({
        phone: '0812345678',
        nationalId: '1234567890123',
        bankAccountNo: '1234567890',
      });
      expect(signals).toHaveLength(3);
      expect(signals.map(s => s.signal)).toEqual(['phone', 'national_id', 'bank_account']);
    });

    it('returns only phone signal when nationalId and bankAccountNo are null', () => {
      const signals = svc.signalsFor({ phone: '0812345678', nationalId: null, bankAccountNo: null });
      expect(signals).toHaveLength(1);
      expect(signals[0]!.signal).toBe('phone');
    });

    it('returns empty array when all inputs are null', () => {
      const signals = svc.signalsFor({ phone: null, nationalId: null, bankAccountNo: null });
      expect(signals).toHaveLength(0);
    });

    it('includes the raw value and masked value for each signal', () => {
      const signals = svc.signalsFor({
        phone: '0812345678',
        nationalId: null,
        bankAccountNo: null,
      });
      expect(signals[0]!.value).toBe('0812345678');
      expect(signals[0]!.masked).toBe('08****78');
    });

    it('skips only the null fields, includes non-null ones', () => {
      const signals = svc.signalsFor({
        phone: null,
        nationalId: '1234567890123',
        bankAccountNo: '1234567890',
      });
      expect(signals).toHaveLength(2);
      expect(signals[0]!.signal).toBe('national_id');
      expect(signals[1]!.signal).toBe('bank_account');
    });

    it('preserves original ordering: phone → national_id → bank_account', () => {
      const signals = svc.signalsFor({
        phone: '0812345678',
        nationalId: '1234567890123',
        bankAccountNo: '1234567890',
      });
      expect(signals[0]!.signal).toBe('phone');
      expect(signals[1]!.signal).toBe('national_id');
      expect(signals[2]!.signal).toBe('bank_account');
    });
  });

  // ── isDuplicate ───────────────────────────────────────────────────────────

  describe('isDuplicate', () => {
    it('returns false when no results have matchFound=true', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: false, matchDetail: null },
        { signal: 'national_id',  matchFound: false, matchDetail: null },
        { signal: 'bank_account', matchFound: false, matchDetail: null },
      ];
      expect(svc.isDuplicate(results)).toBe(false);
    });

    it('returns true when the first signal matches', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: true,  matchDetail: '08****78' },
        { signal: 'national_id',  matchFound: false, matchDetail: null },
        { signal: 'bank_account', matchFound: false, matchDetail: null },
      ];
      expect(svc.isDuplicate(results)).toBe(true);
    });

    it('returns true when only the last signal matches', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: false, matchDetail: null },
        { signal: 'national_id',  matchFound: false, matchDetail: null },
        { signal: 'bank_account', matchFound: true,  matchDetail: '****7890' },
      ];
      expect(svc.isDuplicate(results)).toBe(true);
    });

    it('returns true when all signals match', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: true, matchDetail: '08****78' },
        { signal: 'national_id',  matchFound: true, matchDetail: '****0123' },
        { signal: 'bank_account', matchFound: true, matchDetail: '****7890' },
      ];
      expect(svc.isDuplicate(results)).toBe(true);
    });

    it('returns false for an empty results array', () => {
      expect(svc.isDuplicate([])).toBe(false);
    });
  });

  // ── firstMatchSignal ──────────────────────────────────────────────────────

  describe('firstMatchSignal', () => {
    it('returns null when no signals match', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',       matchFound: false, matchDetail: null },
        { signal: 'national_id', matchFound: false, matchDetail: null },
      ];
      expect(svc.firstMatchSignal(results)).toBeNull();
    });

    it('returns the first matching signal', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: false, matchDetail: null },
        { signal: 'national_id',  matchFound: true,  matchDetail: '****0123' },
        { signal: 'bank_account', matchFound: true,  matchDetail: '****7890' },
      ];
      expect(svc.firstMatchSignal(results)).toBe('national_id');
    });

    it('returns phone when it is the only match', () => {
      const results: DuplicateCheckResult[] = [
        { signal: 'phone',        matchFound: true,  matchDetail: '08****78' },
        { signal: 'national_id',  matchFound: false, matchDetail: null },
        { signal: 'bank_account', matchFound: false, matchDetail: null },
      ];
      expect(svc.firstMatchSignal(results)).toBe('phone');
    });

    it('returns null for an empty results array', () => {
      expect(svc.firstMatchSignal([])).toBeNull();
    });
  });

  // ── Integration: full workflow ────────────────────────────────────────────

  describe('full duplicate detection workflow', () => {
    it('signals with no match → isDuplicate=false, firstMatch=null', () => {
      const input = { phone: '0812345678', nationalId: '1234567890123', bankAccountNo: '1234567890' };
      const signals = svc.signalsFor(input);
      // Simulate: all DB checks return no match
      const results: DuplicateCheckResult[] = signals.map(s => ({
        signal: s.signal,
        matchFound: false,
        matchDetail: null,
      }));
      expect(svc.isDuplicate(results)).toBe(false);
      expect(svc.firstMatchSignal(results)).toBeNull();
    });

    it('phone match → isDuplicate=true, firstMatch=phone, matchDetail is masked', () => {
      const input = { phone: '0812345678', nationalId: null, bankAccountNo: null };
      const signals = svc.signalsFor(input);
      // Simulate: DB found a phone match
      const results: DuplicateCheckResult[] = signals.map(s => ({
        signal: s.signal,
        matchFound: true,
        matchDetail: s.masked,
      }));
      expect(svc.isDuplicate(results)).toBe(true);
      expect(svc.firstMatchSignal(results)).toBe('phone');
      expect(results[0]!.matchDetail).toBe('08****78'); // masked, not raw
    });

    it('masked value never equals the raw value for phone >= 5 chars', () => {
      const phone = '0812345678';
      expect(svc.maskPhone(phone)).not.toBe(phone);
    });

    it('masked value never equals the raw national ID for id >= 5 chars', () => {
      const id = '1234567890123';
      expect(svc.maskNationalId(id)).not.toBe(id);
    });
  });
});
