import { apiGet, apiPost } from './client';

export interface AbsenceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  status: string;
  positionSnapshot: string | null;
  penaltyAmount: number | null;
  penaltyExempt?: boolean;
}

export async function listAbsences(params: Record<string, string>) {
  return apiGet<{ items: AbsenceRecord[]; total: number }>('/attendance/absences', params);
}

export async function approveAbsence(id: string, body: { contactAttemptedAt: string; contactNotes: string }) {
  return apiPost(`/attendance/absences/${id}/approve`, body);
}

export async function waiveAbsence(id: string, body: { reason: string }) {
  return apiPost(`/attendance/absences/${id}/waive`, body);
}

export async function runAbsenceFlag(body: { companyId: string; workDate: string }) {
  return apiPost<{ flaggedCount: number; skippedCount: number }>('/attendance/absences/run-flag', body);
}
