// ============================================================================
// Unit tests — CSV export driver
// ============================================================================

import { CsvExportDriver } from './csv-export.driver';
import type { ExportDataset } from '../../domain/export.types';

describe('CsvExportDriver', () => {
  const driver = new CsvExportDriver();

  const dataset: ExportDataset = {
    title: 'Test',
    worksheetName: 'Employees',
    headers: ['Code', 'Name', 'Note'],
    rows: [['E001', 'Alice', 'hello, world'], ['E002', 'Bob', 'line\ntwo']],
  };

  it('emits UTF-8 BOM CSV with escaped fields', async () => {
    const result = await driver.export(dataset, {
      jobId: 'job-12345678',
      module: 'employees',
      companyId: 'co-1',
      mode: 'create_spreadsheet',
      shareMode: 'owner_secretary',
    });

    expect(result.fileName).toMatch(/Employees-job-1234\.csv$/);
    const text = result.buffer!.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('"hello, world"');
    expect(text).toContain('"line\ntwo"');
  });
});
