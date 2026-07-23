// ============================================================================
// Monthly off-day entitlement with new-hire / partial-period proration.
// entitlement = round(fullMonthlyOffDays × eligibleEmploymentDays ÷ periodDays)
// ============================================================================

export interface MonthlyOffEntitlementInput {
  monthlyOffDays: number;
  periodStartIso: string;
  periodEndIso: string;
  hireDate: Date;
  terminationDate?: Date | null;
}

export interface MonthlyOffEntitlementResult {
  fullMonthlyOffDays: number;
  entitledOffDays: number;
  periodDays: number;
  eligibleEmploymentDays: number;
  prorated: boolean;
}

export function computeMonthlyOffEntitlement(
  input: MonthlyOffEntitlementInput,
): MonthlyOffEntitlementResult {
  const periodDays = inclusiveDaysBetween(input.periodStartIso, input.periodEndIso);
  const hireIso = toIsoDate(input.hireDate);
  const terminationIso = input.terminationDate
    ? toIsoDate(input.terminationDate)
    : input.periodEndIso;

  const employmentStartIso = hireIso > input.periodStartIso ? hireIso : input.periodStartIso;
  const employmentEndIso = terminationIso < input.periodEndIso ? terminationIso : input.periodEndIso;

  const eligibleEmploymentDays = inclusiveDaysBetween(employmentStartIso, employmentEndIso);

  if (eligibleEmploymentDays <= 0 || periodDays <= 0) {
    return {
      fullMonthlyOffDays: input.monthlyOffDays,
      entitledOffDays: 0,
      periodDays,
      eligibleEmploymentDays: 0,
      prorated: true,
    };
  }

  if (eligibleEmploymentDays >= periodDays) {
    return {
      fullMonthlyOffDays: input.monthlyOffDays,
      entitledOffDays: input.monthlyOffDays,
      periodDays,
      eligibleEmploymentDays,
      prorated: false,
    };
  }

  const entitledOffDays = Math.max(
    0,
    Math.min(
      input.monthlyOffDays,
      Math.round((input.monthlyOffDays * eligibleEmploymentDays) / periodDays),
    ),
  );

  return {
    fullMonthlyOffDays: input.monthlyOffDays,
    entitledOffDays,
    periodDays,
    eligibleEmploymentDays,
    prorated: true,
  };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function inclusiveDaysBetween(startIso: string, endIso: string): number {
  const startMs = Date.parse(`${startIso}T00:00:00.000Z`);
  const endMs = Date.parse(`${endIso}T00:00:00.000Z`);
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}
