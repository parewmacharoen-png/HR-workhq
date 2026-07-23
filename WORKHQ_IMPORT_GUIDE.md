# WorkHQ Import Guide (IMPORT-001 / IMPORT-002)

## Overview

Imports use **ImportService** with preview, validation, mapping, dry-run, apply, rollback, and audit.

## Supported modules

Employees, Employee Bank, Leave Balances, Salary, Shift Assignments, Off Days, Holidays, Position Assignments, KPI Assignments, Competencies, Training Assignments.

## Flow

1. POST `/imports` — create job
2. POST `/imports/:id/upload` — CSV/XLSX file
3. POST `/imports/:id/map` — column mapping + duplicate strategy
4. GET `/imports/:id/preview` — valid/invalid rows (dry run, no DB write)
5. POST `/imports/:id/apply` — apply valid rows
6. POST `/imports/:id/rollback` — reverse applied import (when safe)
7. GET `/imports/:id/error-report` — download CSV error report

## Duplicate strategies

`skip` | `update` | `replace` | `merge` — set via map endpoint.

## Validation

Required fields, types, company scope, employee existence, duplicates, permissions, enums, dates, salary permission.

## Templates

GET `/imports/templates/:module?format=csv|xlsx`

## Permissions

- Owner/Secretary only (default)
- Salary import requires payroll write permission

## Web UI

- **`/ops/imports`** — ImportWizard + history
- ImportMappingTable / ImportPreviewTable via wizard steps

## Audit actions

`import_created`, `import_uploaded`, `import_parsed`, `import_mapped`, `import_validated`, `import_applied`, `import_rolled_back`, `import_row_failed`
