# WORKHQ P0-003 — Completion Report

**Payroll Permission & Manual Payroll Items**  
**Date:** 2026-06-29

---

## Summary

P0-003 closes the remaining payroll production gaps without UI redesign:

1. **Secretary** now has `payroll:write` for open cycle, generate, lock, paid, export, and payslip actions.
2. **Manual Payroll Item builder** — reusable backend + frontend with Thai earnings/deduction categories, one-time/recurring schedules, effective dates, and notes.
3. **PDF export** — Payroll Summary PDF and Payslip PDF endpoints with download buttons on existing screens.

---

## Files Created

| File | Purpose |
|------|---------|
| `prisma/migrations/20260629140000_p0_payroll_manual_items_pdf/migration.sql` | `manual_payroll_item_definitions` table + enums |
| `backend/src/modules/payroll/domain/manual-payroll-item.constants.ts` | Thai category labels, item-type mapping, note format |
| `backend/src/modules/payroll/domain/manual-payroll-item.constants.unit.spec.ts` | Unit tests for category mapping |
| `backend/src/modules/payroll/application/dto/manual-payroll-item.dto.ts` | Create/list DTOs |
| `backend/src/modules/payroll/application/manual-payroll-item.service.ts` | CRUD + apply-to-cycle logic |
| `backend/src/modules/payroll/application/payroll-pdf.service.ts` | Summary + payslip PDF generation (pdfkit) |
| `backend/src/modules/payroll/interface/http/manual-payroll-item.controller.ts` | Manual item REST API |
| `backend/src/modules/payroll/interface/http/payroll-pdf.controller.ts` | PDF download endpoints |
| `web/src/api/manual-payroll-items.ts` | API client + category constants + PDF download |
| `web/src/api/manual-payroll-items.test.ts` | Frontend category label tests |
| `web/src/components/payroll/ManualPayrollItemBuilder.tsx` | Reusable manual item form |

---

## Files Updated

| File | Change |
|------|--------|
| `backend/src/modules/permission/domain/entities/business-role-bundles.ts` | Added `payroll:write` to Secretary bundle |
| `prisma/schema.prisma` | `ManualPayrollItemDefinition` model + enums + relations |
| `backend/src/modules/payroll/payroll.module.ts` | Registered new services/controllers |
| `backend/src/modules/payroll/interface/http/payroll.controller.ts` | `POST cycles/:id/apply-manual-items` |
| `backend/src/modules/payroll/application/payroll-builder.service.ts` | Auto-apply manual schedules at build start |
| `web/src/pages/payroll/PayrollCycleDetailPage.tsx` | `ManualPayrollItemBuilder` + summary PDF button |
| `web/src/components/payroll/PayrollOverviewEmployeeDetailModal.tsx` | Payslip PDF download button |
| `web/src/i18n/th-labels.ts` | Manual item + PDF labels |
| `WORKHQ_UAT_CHECKLIST.md` | P0-003 UAT rows |

---

## API Changes

### Manual Payroll Items

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `POST` | `/payroll/manual-items` | `payroll:write` | Create definition (optional `applyToCycleId`) |
| `GET` | `/payroll/manual-items?companyId=&employeeId=` | `payroll:read` | List active definitions |
| `DELETE` | `/payroll/manual-items/:id` | `payroll:write` | Cancel definition |
| `POST` | `/payroll/cycles/:id/apply-manual-items` | `payroll:write` | Apply due definitions to open cycle |

**Build integration:** `POST /payroll/cycles/:id/build` now auto-applies due manual items before builder items.

### PDF Export

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/payroll/cycles/:id/export-summary.pdf` | `payroll:read` | Payroll overview summary PDF |
| `GET` | `/payroll/cycles/:id/payslips/:employeeId.pdf` | `payroll:read` | Payslip PDF (uses payslip or live items) |

---

## Permission Changes

| Role | Before | After |
|------|--------|-------|
| **Owner** | `payroll:read` + `payroll:write` (via `allHrPermissions`) | Unchanged — full control |
| **Secretary** | `payroll:read` only | **`payroll:write` added** — open, build, lock, paid, manual items, payslips |
| **Big Leader** | `payroll:read` | Unchanged |
| **Export bank transfer** | Owner + Secretary (role check) | Unchanged — Secretary already had export access |

**Deploy:** Run `cd backend && npx prisma db seed` (or migrate + seed) to refresh Secretary role permissions in DB.

---

## Manual Item Categories

### Earnings (รายได้)

| Thai Label | Category Key | Payroll Item Type |
|------------|--------------|-------------------|
| โบนัส | `bonus` | `bonus` |
| ค่าคอมมิชชั่น | `commission` | `commission` |
| OT | `ot` | `ot` |
| ค่าข้าว | `meal_allowance` | `meal_allowance` |
| ค่าโทรศัพท์ | `phone_allowance` | `manual_adjustment` |
| ค่าน้ำมัน | `fuel_allowance` | `manual_adjustment` |
| เบี้ยขยัน | `diligence_bonus` | `manual_adjustment` |
| ค่าเดินทาง | `travel_allowance` | `manual_adjustment` |
| ค่าอื่นๆ | `other_earning` | `manual_adjustment` |

### Deductions (หัก)

| Thai Label | Category Key | Payroll Item Type |
|------------|--------------|-------------------|
| หักค่าไฟ | `utility_deduction` | `manual_adjustment` |
| หักประกัน | `deposit_deduction` | `deposit` |
| เงินเบิก | `advance_deduction` | `manual_adjustment` |
| ค่าปรับ | `penalty` | `manual_adjustment` |
| หักภาษี | `tax_deduction` | `manual_adjustment` |
| หักอื่นๆ | `other_deduction` | `manual_adjustment` |

Each supports: **one-time**, **recurring**, **effective from**, **effective until**, **note**.

---

## Tests

| Suite | Result |
|-------|--------|
| `backend` — `manual-payroll-item.constants.unit.spec.ts` | 4/4 pass |
| `web` — `manual-payroll-items.test.ts` | 2/2 pass |
| `web` — `npm run build` | Pass |
| `backend` — `npx tsc --noEmit` | Pass |

---

## UAT Checklist

See `WORKHQ_UAT_CHECKLIST.md` → **Secretary** section:

- P0-003 Secretary payroll write
- P0-003 Manual item builder
- P0-003 Recurring manual item
- P0-003 Summary PDF
- P0-003 Payslip PDF

---

## Remaining Gaps

| Gap | Notes |
|-----|-------|
| Employee picker in manual item form | Still uses employee UUID input (same as P0-002); no searchable employee selector |
| Manual commission UI | API-only (`ManualCommissionController`); not part of this sprint |
| PDF Thai font rendering | PDF uses Helvetica; Thai glyphs may fallback on some viewers — consider embedded Thai font later |
| Advance deduction auto-link | `advance_deduction` category creates manual item; does not auto-link `AdvanceRequest` recovery |
| Owner-only export exception confirm | Unchanged by design — Secretary cannot confirm exception exports |
| Migration deploy | Run `npx prisma migrate deploy` before seed in production |

---

## Deploy Steps

```bash
# From repo root
npx prisma migrate deploy
cd backend && npx prisma db seed
```

Secretary users may need to re-login to refresh JWT permission claims if permissions are cached client-side.
