// ============================================================================
// CSV export driver
// ============================================================================

import { Injectable } from '@nestjs/common';
import type { ExportDataset, ExportDriverContext, ExportDriverResult } from '../../domain/export.types';

@Injectable()
export class CsvExportDriver {
  async export(dataset: ExportDataset, ctx: ExportDriverContext): Promise<ExportDriverResult> {
    const lines = [dataset.headers.map(csvEscape).join(',')];
    for (const row of dataset.rows) {
      lines.push(row.map((c) => csvEscape(c == null ? '' : String(c))).join(','));
    }
    const buffer = Buffer.from(`\uFEFF${lines.join('\n')}\n`, 'utf8');
    const fileName = `${sanitizeFileName(dataset.worksheetName)}-${ctx.jobId.slice(0, 8)}.csv`;
    return { fileName, buffer, mimeType: 'text/csv; charset=utf-8' };
  }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').slice(0, 60);
}
