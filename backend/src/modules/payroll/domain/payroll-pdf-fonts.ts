// ============================================================================
// Thai-capable fonts for payroll PDF export (Sarabun via pdfkit)
// ============================================================================

import { existsSync } from 'fs';
import { join } from 'path';
import type PDFDocument from 'pdfkit';

export const PAYROLL_PDF_FONT_REGULAR = 'PayrollThai';
export const PAYROLL_PDF_FONT_BOLD = 'PayrollThai-Bold';

const FONT_FILES = {
  regular: 'Sarabun-Regular.ttf',
  bold: 'Sarabun-Bold.ttf',
} as const;

export function resolvePayrollPdfFontPath(fileName: string): string {
  const roots = [
    join(__dirname, '..', 'assets', 'fonts'),
    join(process.cwd(), 'src', 'modules', 'payroll', 'assets', 'fonts'),
    join(process.cwd(), 'dist', 'modules', 'payroll', 'assets', 'fonts'),
    join(process.cwd(), 'backend', 'src', 'modules', 'payroll', 'assets', 'fonts'),
    join(process.cwd(), 'backend', 'dist', 'modules', 'payroll', 'assets', 'fonts'),
  ];

  for (const root of roots) {
    const fullPath = join(root, fileName);
    if (existsSync(fullPath)) return fullPath;
  }

  throw new Error(`Payroll PDF font not found: ${fileName}`);
}

export function registerPayrollPdfFonts(doc: InstanceType<typeof PDFDocument>): void {
  doc.registerFont(PAYROLL_PDF_FONT_REGULAR, resolvePayrollPdfFontPath(FONT_FILES.regular));
  doc.registerFont(PAYROLL_PDF_FONT_BOLD, resolvePayrollPdfFontPath(FONT_FILES.bold));
}

export function usePayrollPdfFont(
  doc: InstanceType<typeof PDFDocument>,
  weight: 'regular' | 'bold' = 'regular',
): void {
  doc.font(weight === 'bold' ? PAYROLL_PDF_FONT_BOLD : PAYROLL_PDF_FONT_REGULAR);
}
