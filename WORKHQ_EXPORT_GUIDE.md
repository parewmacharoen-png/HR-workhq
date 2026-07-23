# WorkHQ Export Guide (EXPORT-001 / EXPORT-003 / EXPORT-004)

## Overview

All HR exports use the shared **ExportService**. Google Sheets is the default format (`EXPORT_DEFAULT_FORMAT=google_sheets`).

## Export formats (priority order)

1. **Google Sheets** (default) — creates/updates spreadsheet with bold header, frozen row, filter
2. **PDF** — printable report with title and metadata
3. **CSV** — UTF-8 BOM, Excel/Sheets compatible
4. **Excel (.xlsx)** — explicit selection only

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/exports` | Create export (supports `async`, `columns`, `reportTemplateId`, `savedReportId`) |
| GET | `/exports?companyId=` | List export history |
| GET | `/exports/:id` | Job status + `progressPercent` |
| POST | `/exports/:id/cancel` | Cancel queued/running job |
| POST | `/exports/:id/retry` | Retry failed export |
| GET | `/exports/columns/:module` | Column catalog for picker |
| GET/POST | `/exports/preferences/:module` | User column/format preferences |

## Report templates

System templates seeded on startup (Employee Standard/Payroll/Contact, Attendance Daily, Leave Summary, Payroll Summary, Audit Security).

| Method | Path |
|--------|------|
| GET | `/report-templates?module=&companyId=` |
| POST | `/report-templates` |
| POST | `/report-templates/:id/archive` |

## Saved reports

| Method | Path |
|--------|------|
| GET | `/saved-reports?companyId=` |
| POST | `/saved-reports` |
| POST | `/saved-reports/:id/run` |
| POST | `/saved-reports/:id/favorite` |

## Async queue

When `async: true` or row count exceeds `EXPORT_ASYNC_ROW_THRESHOLD` (default 500), job status becomes `queued`. Poll `GET /exports/:id` for `progressPercent`.

## Environment variables

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_EXPORT_FOLDER_ID=
GOOGLE_SHEETS_DEFAULT_SHARE_MODE=owner_secretary
DOCUMENT_STORAGE_DRIVER=local
EXPORT_ASYNC_ROW_THRESHOLD=500
EXPORT_DEFAULT_FORMAT=google_sheets
```

## Web UI

- **ExportDropdown** — module pages (Employees wired)
- **ExportColumnPicker** / **ExportFilterBuilder** — pre-export configuration
- **ExportProgressModal** — async progress polling
- **`/ops/exports`** — export history
- **`/ops/reports`** — saved reports

## Permissions

- Sensitive modules (payroll, salary, audit, documents, disciplinary): Owner/Secretary only
- Big Leader: non-sensitive company/team exports with redaction
- Salary/bank columns redacted unless Owner/Secretary

## Telegram

On completion: ✅ Export สำเร็จ with Google Sheets link and download buttons.

On failure: ❌ Export ไม่สำเร็จ with retry callback.
