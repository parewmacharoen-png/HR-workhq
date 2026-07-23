// ============================================================================
// Google Sheets export driver — uses Google Sheets API when configured
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ExportDataset, ExportDriverContext, ExportDriverResult } from '../../domain/export.types';
import { CsvExportDriver } from './csv-export.driver';

@Injectable()
export class GoogleSheetsExportDriver {
  private readonly log = new Logger(GoogleSheetsExportDriver.name);

  constructor(private readonly csvFallback: CsvExportDriver) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      && process.env.GOOGLE_PRIVATE_KEY
    );
  }

  async export(dataset: ExportDataset, ctx: ExportDriverContext): Promise<ExportDriverResult> {
    if (!this.isConfigured()) {
      this.log.warn('Google credentials missing — storing CSV fallback for export job');
      const csv = await this.csvFallback.export(dataset, ctx);
      return {
        ...csv,
        googleSheetUrl: null,
        googleSpreadsheetId: null,
      };
    }

    try {
      const { google } = await import('googleapis');
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      const spreadsheetTitle = ctx.spreadsheetTitle ?? `WorkHQ ${dataset.title}`;
      let spreadsheetId = ctx.existingSpreadsheetId ?? undefined;

      if (!spreadsheetId || ctx.mode === 'create_spreadsheet') {
        const createRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: spreadsheetTitle },
            sheets: [{ properties: { title: sanitizeSheetName(dataset.worksheetName) } }],
          },
        });
        spreadsheetId = createRes.data.spreadsheetId ?? undefined;
      }

      if (!spreadsheetId) throw new Error('Failed to create spreadsheet');

      const sheetName = sanitizeSheetName(dataset.worksheetName);
      const values = [dataset.headers, ...dataset.rows.map((r) => r.map((c) => (c == null ? '' : c)))];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });

      const folderId = process.env.GOOGLE_DRIVE_EXPORT_FOLDER_ID;
      if (folderId) {
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: folderId,
          fields: 'id, parents',
        }).catch(() => undefined);
      }

      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      await this.applyShareMode(drive, spreadsheetId, ctx.shareMode);
      await this.applyFormatting(sheets, spreadsheetId, sheetName, values.length, values[0]?.length ?? 1);

      return {
        googleSpreadsheetId: spreadsheetId,
        googleWorksheetId: sheetName,
        googleSheetUrl: url,
        fileName: `${spreadsheetTitle}.gsheet`,
      };
    } catch (err) {
      this.log.error(`Google Sheets export failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private async applyShareMode(
    drive: { permissions: { create: (args: object) => Promise<unknown> } },
    fileId: string,
    shareMode: string,
  ): Promise<void> {
    if (shareMode === 'private') return;
    void drive;
    void fileId;
    void shareMode;
  }

  private async applyFormatting(
    sheets: { spreadsheets: { batchUpdate: (args: object) => Promise<unknown> } },
    spreadsheetId: string,
    sheetName: string,
    rowCount: number,
    colCount: number,
  ): Promise<void> {
    const meta = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
          {
            setBasicFilter: {
              filter: {
                range: { sheetId: 0, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: colCount },
              },
            },
          },
        ],
      },
    });
    void meta;
    void sheetName;
  }
}

function sanitizeSheetName(name: string): string {
  const base = name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 80);
  return base || 'Export';
}
