import { FinalSettlementCalculatorService } from './final-settlement-calculator.service';

describe('FinalSettlementCalculatorService', () => {
  describe('computeNetPayable', () => {
    it('sums credits and subtracts deductions', () => {
      const net = FinalSettlementCalculatorService.computeNetPayable({
        salaryProrateAmount: 10000,
        unpaidSalaryAmount: 5000,
        pendingOtAmount: 500,
        pendingCommissionAmount: 2000,
        pendingBonusAmount: 1000,
        advanceDeductionAmount: 3000,
        equipmentDeductionAmount: 500,
        penaltyDeductionAmount: 200,
        depositReturnAmount: 1500,
        otherAdjustmentAmount: -100,
      });
      expect(net).toBe(16200);
    });

    it('rounds to two decimal places', () => {
      const net = FinalSettlementCalculatorService.computeNetPayable({
        salaryProrateAmount: 10.005,
        unpaidSalaryAmount: 0,
        pendingOtAmount: 0,
        pendingCommissionAmount: 0,
        pendingBonusAmount: 0,
        advanceDeductionAmount: 0,
        equipmentDeductionAmount: 0,
        penaltyDeductionAmount: 0,
        depositReturnAmount: 0,
        otherAdjustmentAmount: 0,
      });
      expect(net).toBe(10.01);
    });
  });
});
