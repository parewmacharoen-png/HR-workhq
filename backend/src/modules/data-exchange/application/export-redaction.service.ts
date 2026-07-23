// ============================================================================
// Export sensitive field redaction
// ============================================================================

import { Injectable, Inject } from '@nestjs/common';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { ActorContext } from '../../../shared/kernel/actor-context';
import type { ExportDataset } from '../domain/export.types';

const SALARY_COLUMNS = new Set([
  'salary', 'salaryamount', 'netpay', 'gross', 'bankaccount', 'bankaccountno',
  'bankname', 'bankaccountnumber', 'bankaccountholder',
]);

@Injectable()
export class ExportRedactionService {
  constructor(
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async redact(actor: ActorContext, dataset: ExportDataset): Promise<ExportDataset> {
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    const canViewSalary = role === 'owner' || role === 'secretary';

    if (canViewSalary) return dataset;

    const redactedHeaders = [...dataset.headers];
    const redactIndexes = redactedHeaders
      .map((h, i) => ({ h: h.toLowerCase().replace(/\s+/g, ''), i }))
      .filter(({ h }) => SALARY_COLUMNS.has(h))
      .map(({ i }) => i);

    if (!redactIndexes.length) return dataset;

    const rows = dataset.rows.map((row) =>
      row.map((cell, idx) => (redactIndexes.includes(idx) ? '[REDACTED]' : cell)),
    );

    return { ...dataset, rows };
  }
}
