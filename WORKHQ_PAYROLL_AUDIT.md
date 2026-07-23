# WorkHQ Payroll & Money Audit (QA-001)

## Summary

| Area | Status | Risk |
|------|--------|------|
| Base salary / history | PASS | Medium |
| Meal allowance | PASS | Low |
| OT → payroll source | PASS | Medium |
| Late deduction | PARTIAL | Medium — formula + fallback |
| Absence penalty | PARTIAL | Medium — formula + fallback |
| Leave deduction | PASS | Medium |
| Advance pay | PASS | High |
| Admin commission | PARTIAL | Medium |
| Referral bonus | PARTIAL | Medium — formula |
| Final settlement | PARTIAL | High |
| Payroll export | PASS | High |
| Payslip self-service | PASS | Medium |
| Salary visibility | PASS | Critical |

## Integration Test Coverage

| Test file | Coverage |
|-----------|----------|
| `payroll.integration.spec.ts` | Cycle build |
| `payroll-build.integration.spec.ts` | Full build |
| `payroll-late-deduction.integration.spec.ts` | Late |
| `payroll-absence-deduction.integration.spec.ts` | Absence |
| `payroll-leave-bonus.integration.spec.ts` | Leave/bonus |
| `payroll-meal-allowance.integration.spec.ts` | Meal |
| `final-settlement-pay005c.integration.spec.ts` | Settlement |
| `admin-commission.integration.spec.ts` | Admin commission |

## Formula Audit

| Key | Logged | Fallback | Status |
|-----|--------|----------|--------|
| attendance.late_deduction | ✓ | ✓ | PASS |
| attendance.absence_penalty | ✓ | ✓ | PASS |
| commission.admin_leave_penalty | ✓ | ✓ | PASS |
| kpi.weighted_score | ✓ | ✓ | PASS |
| referral.bonus_amount | ✓ | ✓ | PASS |

## Edge Cases (UAT required)

| Case | Automated | UAT |
|------|-----------|-----|
| Mid-cycle join | Partial | Required |
| Mid-cycle exit | Partial | Required |
| Unpaid leave | PASS | Verify |
| Multiple late days | PARTIAL | Required |
| Advance + negative net | Partial | Required |
| Missing bank account | Partial | Required |
| Exported then edit | PASS | Verify |

## QA Verdict: **CONDITIONAL PASS** — money paths need real UAT with Owner sign-off
