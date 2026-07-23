// ============================================================================
// modules/payroll/domain/services/meal-allowance.service.ts
// ============================================================================

export interface MealAllowanceParams {
  ratePerDay: number;
}

export interface MealAllowanceInput {
  eligibleDays: number;
}

export interface MealAllowanceResult {
  eligibleDays: number;
  ratePerDay: number;
  amount: number;
}

export function computeMealAllowance(
  params: MealAllowanceParams,
  input: MealAllowanceInput,
): MealAllowanceResult {
  const eligibleDays = Math.max(0, input.eligibleDays);
  const amount = roundMoney(eligibleDays * params.ratePerDay);
  return {
    eligibleDays,
    ratePerDay: params.ratePerDay,
    amount,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
