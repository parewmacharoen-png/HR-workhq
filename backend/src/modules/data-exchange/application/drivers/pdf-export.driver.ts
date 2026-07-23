// ============================================================================
// PDF export driver (tabular reports)
// ============================================================================

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { ExportDataset, ExportDriverContext, ExportDriverResult } from '../../domain/export.types';

@Injectable()
export class PdfExportDriver {
  async export(dataset: ExportDataset, ctx: ExportDriverContext): Promise<ExportDriverResult> {
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text(dataset.title, { align: 'center' });
      doc.moveDown(0.5);
      if (dataset.filtersSummary) {
        doc.fontSize(10).text(dataset.filtersSummary);
      }
      doc.fontSize(9).text(`Generated: ${new Date().toISOString()}${dataset.generatedBy ? ` · ${dataset.generatedBy}` : ''}`);
      doc.moveDown();

      const colCount = dataset.headers.length;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth = pageWidth / Math.max(colCount, 1);

      doc.fontSize(8).font('Helvetica-Bold');
      dataset.headers.forEach((h, i) => {
        doc.text(String(h), doc.page.margins.left + i * colWidth, doc.y, {
          width: colWidth - 4,
          continued: i < colCount - 1,
        });
      });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      for (const row of dataset.rows.slice(0, 500)) {
        const y = doc.y;
        if (y > doc.page.height - 60) {
          doc.addPage();
        }
        row.forEach((cell, i) => {
          doc.text(cell == null ? '' : String(cell), doc.page.margins.left + i * colWidth, doc.y, {
            width: colWidth - 4,
            continued: i < colCount - 1,
          });
        });
        doc.moveDown(0.3);
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pages.count}`,
          doc.page.margins.left,
          doc.page.height - 30,
          { align: 'center', width: pageWidth },
        );
      }

      doc.end();
    });

    const fileName = `${sanitizeFileName(dataset.worksheetName)}-${ctx.jobId.slice(0, 8)}.pdf`;
    return { fileName, buffer, mimeType: 'application/pdf' };
    void ctx;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\-]+/g, '_').slice(0, 60);
}
