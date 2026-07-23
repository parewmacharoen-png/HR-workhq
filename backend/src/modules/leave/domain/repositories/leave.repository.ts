// ============================================================================
// modules/leave/domain/repositories/leave.repository.ts
// ============================================================================

import { LeaveRequest } from '../entities/leave-request.entity';
import { HolidayConversionResult } from '../services/holiday-conversion.service';

export const LEAVE_REPOSITORY = Symbol('LEAVE_REPOSITORY');
export const HOLIDAY_CONVERSION_REPOSITORY = Symbol('HOLIDAY_CONVERSION_REPOSITORY');

export interface LeaveTypeView {
  id: string;
  code: string;
  allowBorrowFuture: boolean;
  convertibleToBonus: boolean;
}

export interface LeaveBalanceView {
  entitled: number;
  used: number;
  borrowed: number;
  remaining: number;
}

export interface ApprovedLeaveSummary {
  id: string;
  startDate: Date;
  endDate: Date;
  days: number;
  rescheduleCount: number;
  leaveTypeName: string;
}

export interface LeaveRescheduleRecord {
  id: string;
  leaveRequestId: string;
  employeeId: string;
  companyId: string;
  originalStartDate: Date;
  originalEndDate: Date;
  originalDays: number;
  newStartDate: Date;
  newEndDate: Date;
  newDays: number;
  reason: string;
  isEmergency: boolean;
  workflowInstanceId: string | null;
  status: 'pending' | 'approved' | 'rejected';
}

export interface LeaveShiftSwapRecord {
  id: string;
  companyId: string;
  requesterEmployeeId: string;
  partnerEmployeeId: string;
  requesterLeaveRequestId: string;
  partnerLeaveRequestId: string;
  requesterAgreedAt: Date;
  partnerAgreedAt: Date | null;
  workflowInstanceId: string | null;
  status: 'pending_partner' | 'pending_approval' | 'approved' | 'rejected';
}

export interface LeaveRepository {
  findTypeByCode(code: string): Promise<LeaveTypeView | null>;
  findTypeById(id: string): Promise<LeaveTypeView | null>;
  findRequestById(id: string): Promise<LeaveRequest | null>;
  findRequestByWorkflowEntity(entityId: string): Promise<LeaveRequest | null>;
  listApprovedRequestsByEmployee(employeeId: string, companyId: string): Promise<ApprovedLeaveSummary[]>;
  hasApprovedDateOverlap(
    companyId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRequestId?: string,
  ): Promise<boolean>;
  hasApprovedLeaveForEmployeeOnDate(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean>;
  hasPendingReschedule(leaveRequestId: string): Promise<boolean>;
  getBalance(employeeId: string, leaveTypeId: string, periodStart: Date): Promise<LeaveBalanceView | null>;
  ensureEmergencyBalance(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    periodEnd: Date;
    entitled: number;
    actorUserId: string;
  }): Promise<void>;
  saveRequest(request: LeaveRequest, actorUserId: string): Promise<void>;
  softDeleteRequest(id: string, actorUserId: string): Promise<void>;
  applyConsumption(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    days: number;
    borrowed: boolean;
    actorUserId: string;
  }): Promise<void>;
  releaseConsumption(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    days: number;
    borrowed: boolean;
    actorUserId: string;
  }): Promise<void>;
  createRescheduleRequest(input: Omit<LeaveRescheduleRecord, 'id' | 'status' | 'workflowInstanceId'>, actorUserId: string): Promise<string>;
  findRescheduleById(id: string): Promise<LeaveRescheduleRecord | null>;
  findRescheduleByWorkflowEntity(entityId: string): Promise<LeaveRescheduleRecord | null>;
  attachRescheduleWorkflow(id: string, workflowInstanceId: string, actorUserId: string): Promise<void>;
  updateRescheduleStatus(id: string, status: LeaveRescheduleRecord['status'], actorUserId: string): Promise<void>;
  applyApprovedReschedule(reschedule: LeaveRescheduleRecord, actorUserId: string): Promise<void>;
  createShiftSwapRequest(input: {
    companyId: string;
    requesterEmployeeId: string;
    partnerEmployeeId: string;
    requesterLeaveRequestId: string;
    partnerLeaveRequestId: string;
    actorUserId: string;
  }): Promise<string>;
  findShiftSwapById(id: string): Promise<LeaveShiftSwapRecord | null>;
  findShiftSwapByWorkflowEntity(entityId: string): Promise<LeaveShiftSwapRecord | null>;
  markShiftSwapPartnerAgreed(id: string, actorUserId: string): Promise<void>;
  attachShiftSwapWorkflow(id: string, workflowInstanceId: string, actorUserId: string): Promise<void>;
  updateShiftSwapStatus(id: string, status: LeaveShiftSwapRecord['status'], actorUserId: string): Promise<void>;
  applyApprovedShiftSwap(swap: LeaveShiftSwapRecord, actorUserId: string): Promise<void>;
  findEmployeeIdForUser(userId: string): Promise<string | null>;
}

export interface HolidayConversionRepository {
  exists(employeeId: string, payrollCycleId: string): Promise<boolean>;
  create(input: {
    employeeId: string;
    companyId: string;
    payrollCycleId: string;
    result: HolidayConversionResult;
    actorUserId: string;
  }): Promise<string>;
}
