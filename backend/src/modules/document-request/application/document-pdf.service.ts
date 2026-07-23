// ============================================================================
// modules/document-request/application/document-pdf.service.ts
// DOC-002b — Real PDF generation with QR verification
// ============================================================================

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { DOCUMENT_STORAGE, DocumentStorageService } from '../../../shared/storage/document-storage.interface';
import { DateProvider } from '../../../shared/time/date.provider';

export interface PdfGenerationInput {
  documentNumber: string;
  typeKey: string;
  typeName: string;
  employeeName: string;
  companyName: string;
  employeeId: string;
  requestId: string;
  extraLines?: string[];
}

@Injectable()
export class DocumentPdfService {
  private readonly logger = new Logger(DocumentPdfService.name);

  constructor(
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageService,
    private readonly dates: DateProvider,
  ) {}

  async generate(input: PdfGenerationInput): Promise<{ fileKey: string; fileName: string; verifyUrl: string }> {
    const docNumber = input.documentNumber || `WHQ-${input.requestId.slice(0, 8).toUpperCase()}`;
    const issuedDate = this.dates.todayString();
    const verifyUrl = `https://workhq.app/verify/${docNumber}`;

    const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 120, margin: 1 });

    const pdfBuffer = await this.renderPdf({ ...input, docNumber, issuedDate, qrBuffer });
    const fileKey = `generated/${input.employeeId}/${input.requestId}.pdf`;
    await this.storage.save(fileKey, pdfBuffer);

    return {
      fileKey,
      fileName: `${input.typeName.replace(/\s+/g, '_')}_${issuedDate}.pdf`,
      verifyUrl,
    };
  }

  private renderPdf(opts: PdfGenerationInput & { docNumber: string; issuedDate: string; qrBuffer: Buffer }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(opts.companyName, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(opts.typeName, { align: 'center', underline: true });
      doc.moveDown(1.5);

      doc.fontSize(11);
      doc.text(`เลขที่เอกสาร: ${opts.docNumber}`);
      doc.text(`วันที่ออก: ${opts.issuedDate}`);
      doc.text(`ชื่อพนักงาน: ${opts.employeeName}`);
      doc.moveDown();

      doc.text('ขอรับรองว่าข้อมูลข้างต้นถูกต้องตามข้อมูลในระบบ WorkHQ');
      if (opts.extraLines?.length) {
        doc.moveDown();
        for (const line of opts.extraLines) doc.text(line);
      }

      doc.moveDown(2);
      doc.text('ลงชื่อ _________________________');
      doc.text('ผู้มีอำนาจลงนาม');
      doc.text(opts.companyName);

      doc.image(opts.qrBuffer, doc.page.width - 150, doc.page.height - 150, { width: 100 });
      doc.fontSize(8).text('สแกนเพื่อตรวจสอบ', doc.page.width - 150, doc.page.height - 45, { width: 100, align: 'center' });

      doc.end();
    });
  }

  newDocumentNumber(): string {
    return `WHQ-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
