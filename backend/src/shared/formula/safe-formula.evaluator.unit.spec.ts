import { evaluateFormula, FormulaEvaluationError, validateFormulaExpression } from './safe-formula.evaluator';

describe('safe-formula.evaluator', () => {
  it('parses and validates expressions', () => {
    expect(validateFormulaExpression('baseSalary + allowance').valid).toBe(true);
    expect(validateFormulaExpression('IF leaveDays > 4 THEN commission * 0.7 ELSE commission').valid).toBe(true);
  });

  it('executes arithmetic', () => {
    expect(evaluateFormula('10 + 5 * 2', {})).toBe(20);
  });

  it('executes IF THEN ELSE', () => {
    const expr = 'IF leaveDays > 4 THEN commission * 0.7 ELSE commission';
    expect(evaluateFormula(expr, { leaveDays: 5, commission: 1000 })).toBe(700);
    expect(evaluateFormula(expr, { leaveDays: 2, commission: 1000 })).toBe(1000);
  });

  it('executes MIN MAX ROUND', () => {
    expect(evaluateFormula('MIN(3, 7, 1)', {})).toBe(1);
    expect(evaluateFormula('MAX(3, 7, 1)', {})).toBe(7);
    expect(evaluateFormula('ROUND(4.6)', {})).toBe(5);
  });

  it('throws on missing variable', () => {
    expect(() => evaluateFormula('baseSalary + x', { baseSalary: 100 })).toThrow(FormulaEvaluationError);
  });

  it('throws on divide by zero', () => {
    expect(() => evaluateFormula('10 / 0', {})).toThrow(FormulaEvaluationError);
  });

  it('rejects invalid formula', () => {
    expect(validateFormulaExpression('10 +').valid).toBe(false);
  });
});
