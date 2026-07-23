# WorkHQ Data Exchange Guide

Unified HR data exchange: export, import, scheduled reports, templates, AI-assisted export.

## Components

| ID | Feature | Status |
|----|---------|--------|
| EXPORT-001 | Global ExportService + drivers | Implemented |
| IMPORT-001 | Import wizard + validation | Implemented |
| EXPORT-002 | Scheduled exports + Telegram | Implemented |
| REPORT-001 | ReportTemplate + SavedReport | Implemented |
| EXPORT-003 | Column picker + user preferences | Implemented |
| IMPORT-002 | Mapping, dry run, rollback | Implemented |
| EXPORT-004 | Async queue + progress | Implemented |
| AI-004 | AI export parse/confirm | Implemented |
| EXPORT-005 | Live sync fields (syncMode, lastSyncAt) | Schema ready |

## Ops pages

- `/ops/exports` — export history
- `/ops/imports` — import wizard + history
- `/ops/reports` — saved reports
- `/ops/scheduled-exports` — cron schedules

## AI export

POST `/ai/export/parse` with `{ companyId, prompt }` → preview module/filters/columns.

POST `/ai/export/:id/confirm` → runs ExportService (Google Sheets default).

Examples: sick leave this month, payroll summary, employees without Telegram, KPI below 70.

## Scheduled exports

Owner/Secretary create schedules with `scheduleCron`, optional `savedReportId` / `reportTemplateId`. Redis lock prevents duplicate runs.

## Not in scope

Finance, accounting, revenue, P&L, CRM, marketing exports/imports.

See also: [WORKHQ_EXPORT_GUIDE.md](./WORKHQ_EXPORT_GUIDE.md), [WORKHQ_IMPORT_GUIDE.md](./WORKHQ_IMPORT_GUIDE.md)
