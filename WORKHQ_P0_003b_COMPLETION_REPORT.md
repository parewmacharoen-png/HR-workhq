# WORKHQ P0-003b — Completion Report

**Payroll Polish**  
**Date:** 2026-06-29

---

## Summary

P0-003b addresses the two polish gaps from P0-003 without layout redesign:

1. **Thai-capable PDF fonts** — Sarabun Regular/Bold embedded in payroll summary and payslip PDFs.
2. **Searchable employee selector** — Manual payroll item form uses typeahead search instead of raw employee UUID input.

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/src/modules/payroll/assets/fonts/Sarabun-Regular.ttf` | Thai body font for PDF |
| `backend/src/modules/payroll/assets/fonts/Sarabun-Bold.ttf` | Thai bold font for PDF headings |
| `backend/src/modules/payroll/domain/payroll-pdf-fonts.ts` | Font path resolution + pdfkit registration |
| `backend/src/modules/payroll/domain/payroll-pdf-fonts.unit.spec.ts` | Unit tests for font resolution |
| `web/src/components/hr/EmployeeSearchSelect.tsx` | Reusable searchable employee combobox |
| `web/src/components/hr/EmployeeSearchSelect.test.tsx` | Component tests (load + search + select) |

---

## Files Updated

| File | Change |
|------|--------|
| `backend/src/modules/payroll/application/payroll-pdf.service.ts` | Uses Sarabun via `registerPayrollPdfFonts` / `usePayrollPdfFont` |
| `backend/nest-cli.json` | Copies `modules/payroll/assets/**/*` to `dist` on build |
| `web/src/components/payroll/ManualPayrollItemBuilder.tsx` | Replaced UUID `<input>` with `EmployeeSearchSelect` |
| `web/src/design-system/workhq.css` | Minimal dropdown styles for employee search (no layout redesign) |
| `web/src/i18n/th-labels.ts` | `employees.noResults` label |
| `WORKHQ_UAT_CHECKLIST.md` | P0-003b UAT rows |

---

## Technical Details

### Thai PDF Fonts

- **Font family:** [Sarabun](https://fonts.google.com/specimen/Sarabun) (Google Fonts OFL)
- **Registration:** `registerPayrollPdfFonts(doc)` called once per PDF document
- **Usage:** All Thai/ASCII text in summary table and payslip body uses `PayrollThai` / `PayrollThai-Bold`
- **Path resolution:** Works in dev (`src/`), compiled (`dist/`), and monorepo (`backend/`) layouts
- **Build:** `nest-cli.json` assets copy ensures fonts ship with production builds

### Employee Search Select

- Debounced API search via existing `fetchEmployeeList({ companyId, search, status: 'active' })`
- Dropdown anchored under existing `WorkHQInput` — same form stack, no page layout changes
- Displays `รหัส — ชื่อ นามสกุล` labels; sets `employeeId` on selection
- Click-outside closes list; accessible `combobox` / `listbox` roles

---

## API Changes

None — reuses existing `GET /employees` list/search endpoint.

---

## Tests & Build

| Check | Result |
|-------|--------|
| `backend` — `npx tsc --noEmit` | Pass |
| `backend` — `payroll-pdf-fonts.unit.spec.ts` | Added (font path + name constants) |
| `web` — `EmployeeSearchSelect.test.tsx` | 2/2 pass |
| `web` — `npm run build` | Pass |

---

## UAT Checklist

See `WORKHQ_UAT_CHECKLIST.md` → **Secretary**:

- **P0-003b Thai PDF fonts** — download summary/payslip PDF; verify Thai employee names render
- **P0-003b Employee search** — manual item form; search by name/code; select without UUID

---

## Remaining Gaps

| Gap | Notes |
|-----|-------|
| `EmployeeSearchSelect` reuse elsewhere | Component is generic; other forms (e.g. requests) still use plain `<select>` where already adequate |
| PDF item-type labels | Payslip line items still show raw `itemType` keys when no payslip breakdown — pre-existing |
| Font subsetting | Full Sarabun TTF bundled (~30KB each); subsetting optional for smaller artifacts |

---

## Deploy Note

No new migration. Ensure backend build runs `nest build` so font assets copy to `dist/modules/payroll/assets/fonts/`.
