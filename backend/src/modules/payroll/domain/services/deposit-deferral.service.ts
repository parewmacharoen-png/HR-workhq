// ============================================================================
// modules/payroll/domain/services/deposit-deferral.service.ts
// PAY-004b — defer deposit when net pay would fall below minimum
// ============================================================================

export const DEPOSIT_DEFERRAL_WARNING_TH =
  'เลื่อนหักเงินประกัน เนื่องจากเงินเดือนสุทธิต่ำกว่าขั้นต่ำ';

export function shouldDeferDeposit(input: {
  netPayBeforeDeposit: number;
  depositAmount: number;
  minimumNetPayAfterDeposit: number;
}): { defer: boolean; reason?: string } {
  const net = roundMoney(input.netPayBeforeDeposit);
  const deposit = roundMoney(input.depositAmount);
  const minNet = roundMoney(input.minimumNetPayAfterDeposit);

  if (deposit <= 0) return { defer: false };
  if (minNet <= 0) return { defer: false };
  if (net - deposit < minNet) {
    return { defer: true, reason: DEPOSIT_DEFERRAL_WARNING_TH };
  }
  return { defer: false };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
