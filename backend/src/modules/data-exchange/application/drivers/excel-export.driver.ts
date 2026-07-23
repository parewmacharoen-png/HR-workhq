// ============================================================================
// Excel export driver
// ============================================================================

import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ExportDataset, ExportDriverContext, ExportDriverResult } from '../../domain/export.types';

@Injectable()
export class ExcelExportDriver {
  async export(dataset: ExportDataset, ctx: ExportDriverContext): Promise<ExportDriverResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WorkHQ';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sanitizeSheetName(dataset.worksheetName));
    sheet.addRow([dataset.title]);
    if (dataset.filtersSummary) sheet.addRow([dataset.filtersSummary]);
    sheet.addRow([`Generated: ${new Date().toISOString()}`]);
    sheet.addRow([]);
    sheet.addRow(dataset.headers);
    const headerRow = sheet.getRow(sheet.rowCount);
    headerRow.font = { bold: true };
    for (const row of dataset.rows) {
      sheet.addRow(row);
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `${sanitizeFileName(dataset.worksheetName)}-${ctx.jobId.slice(0, 8)}.xlsx`;
    return {
      fileName,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').slice(0, 60);
}
