#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "== Data Exchange platform check =="

echo "-- Prisma schema models --"
grep -q 'model ExportJob' ../prisma/schema.prisma
grep -q 'model ImportJob' ../prisma/schema.prisma
grep -q 'model ScheduledExport' ../prisma/schema.prisma

echo "-- Module wiring --"
grep -q 'DataExchangeModule' src/app.module.ts
grep -q 'ExportService' src/modules/data-exchange/application/export.service.ts
grep -q 'GoogleSheetsExportDriver' src/modules/data-exchange/application/drivers/google-sheets-export.driver.ts
grep -q 'ImportService' src/modules/data-exchange/application/import.service.ts
grep -q 'ScheduledExportService' src/modules/data-exchange/application/scheduled-export.service.ts

echo "-- Web UI --"
grep -q 'ExportDropdown' ../web/src/components/data-exchange/ExportDropdown.tsx
grep -q 'ImportWizard' ../web/src/components/data-exchange/ImportWizard.tsx
grep -q '/ops/exports' ../web/src/App.tsx

echo "-- Unit tests --"
npm run test:unit -- \
  --testPathPattern='data-exchange/(csv-export|export-redaction|export-access)' \
  --passWithNoTests 2>&1 | tail -20

echo "OK — data exchange platform present"
