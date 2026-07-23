// ============================================================================
// modules/payroll/domain/services/prorate.service.ts
// Payroll period is 25th prev → 23rd curr.
// - ทำงานครบทั้งรอบ → จ่ายเต็มฐานเงินเดือนรายเดือน
// - ทำงานไม่ครบรอบ (เริ่มกลางรอบ/ลาออกกลางรอบ) → ฐาน ÷ 30 × จำนวนวันที่นับ
// ============================================================================

/** ตัวหารคงที่สำหรับเงินเดือนรายเดือน (นโยบายบริษัท) */
export const SALARY_PRORATE_DIVISOR = 30;

export interface SalaryBand {
  dailyRate: number;
  fromDate: Date;
  toDate: Date;
}

export interface ProrateInput {
  periodStart: Date;
  periodEnd: Date;
  bands: Array<{ monthlySalary: number; effectiveFrom: Date; effectiveTo: Date | null }>;
}

export interface ProrateResult {
  totalDays: number;
  earnedAmount: number;
  bands: Array<{ days: number; dailyRate: number; amount: number }>;
}

export class ProrateService {
  compute(input: ProrateInput): ProrateResult {
    const { periodStart, periodEnd } = input;
    const periodDays = this.daysBetween(periodStart, periodEnd) + 1;
    const resultBands: ProrateResult['bands'] = [];
    let earned = 0;

    for (const band of input.bands) {
      const from = band.effectiveFrom < periodStart ? periodStart : band.effectiveFrom;
      const rawTo = band.effectiveTo ?? periodEnd;
      const to = rawTo > periodEnd ? periodEnd : rawTo;
      if (from > periodEnd || to < periodStart) continue;

      const eligibleDays = this.daysBetween(from, to) + 1;
      const dailyRate = band.monthlySalary / SALARY_PRORATE_DIVISOR;
      const amount = eligibleDays >= periodDays
        ? band.monthlySalary
        : this.round2(dailyRate * eligibleDays);
      earned += amount;
      resultBands.push({ days: eligibleDays, dailyRate: this.round2(dailyRate), amount });
    }

    return { totalDays: periodDays, earnedAmount: this.round2(earned), bands: resultBands };
  }

  private daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
