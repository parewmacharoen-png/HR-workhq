// ============================================================================
// salary-band-employment.util.ts
// Payroll counts eligible days from hire date, not from when HR entered salary.
// ============================================================================

export interface SalaryBandRow {
  monthlySalary: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * When salary was recorded after hire (HR entered late), backdate the band for
 * proration to max(periodStart, hireDate) so pay follows employment, not data entry.
 */
export function clampSalaryBandsToHireDate(
  bands: SalaryBandRow[],
  hireDate: Date,
  periodStart: Date,
  periodEnd: Date,
): SalaryBandRow[] {
  if (!bands.length || hireDate > periodEnd) return bands;

  const employmentStartInPeriod = hireDate < periodStart ? periodStart : hireDate;

  return bands.map((band) => {
    if (band.effectiveFrom <= employmentStartInPeriod) return band;
    if (hireDate > periodEnd) return band;
    return { ...band, effectiveFrom: employmentStartInPeriod };
  });
}

/**
 * First salary band should use hire date as effectiveFrom when persisting history.
 */
export function resolveInitialSalaryEffectiveDate(
  proposedEffectiveDate: Date,
  hireDate: Date | null | undefined,
  hasExistingSalaryHistory: boolean,
): Date {
  if (hasExistingSalaryHistory || !hireDate) return proposedEffectiveDate;
  return proposedEffectiveDate < hireDate ? proposedEffectiveDate : hireDate;
}
