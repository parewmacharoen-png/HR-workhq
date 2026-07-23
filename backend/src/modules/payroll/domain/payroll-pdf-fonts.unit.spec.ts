// ============================================================================
// Unit tests — payroll PDF Thai font resolution
// ============================================================================

import { existsSync } from 'fs';
import { join } from 'path';
import {
  PAYROLL_PDF_FONT_BOLD,
  PAYROLL_PDF_FONT_REGULAR,
  resolvePayrollPdfFontPath,
} from './payroll-pdf-fonts';

describe('payroll-pdf-fonts', () => {
  it('resolves bundled Sarabun regular and bold fonts', () => {
    const regular = resolvePayrollPdfFontPath('Sarabun-Regular.ttf');
    const bold = resolvePayrollPdfFontPath('Sarabun-Bold.ttf');

    expect(existsSync(regular)).toBe(true);
    expect(existsSync(bold)).toBe(true);
    expect(regular).toContain(join('assets', 'fonts', 'Sarabun-Regular.ttf'));
    expect(bold).toContain(join('assets', 'fonts', 'Sarabun-Bold.ttf'));
  });

  it('exports stable pdfkit font names', () => {
    expect(PAYROLL_PDF_FONT_REGULAR).toBe('PayrollThai');
    expect(PAYROLL_PDF_FONT_BOLD).toBe('PayrollThai-Bold');
  });
});
