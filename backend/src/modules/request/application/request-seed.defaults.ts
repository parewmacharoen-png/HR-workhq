import { randomUUID } from 'crypto';
import {
  Prisma, RequestApproverType, RequestFormFieldType, RequestTypeCategory,
} from '@prisma/client';

export interface RequestTypeSeed {
  key: string;
  nameTh: string;
  nameEn: string;
  description: string;
  icon: string;
  category: RequestTypeCategory;
  telegramMenuOrder: number;
  telegramMenuIcon: string;
}

export const DEFAULT_REQUEST_TYPE_SEEDS: RequestTypeSeed[] = [
  { key: 'leave_request', nameTh: 'ขอวันลา', nameEn: 'Leave request', description: 'คำร้องขอลา', icon: '📅', category: 'leave', telegramMenuOrder: 1, telegramMenuIcon: '📅' },
  { key: 'ot_request', nameTh: 'ขอ OT', nameEn: 'OT request', description: 'คำร้องขอทำงานล่วงเวลา', icon: '⏰', category: 'attendance', telegramMenuOrder: 2, telegramMenuIcon: '⏰' },
  { key: 'no_break_report', nameTh: 'แจ้งไม่พักเบรก', nameEn: 'No break report', description: 'แจ้งว่าวันนั้นไม่ได้พักเบรก — นำไปคำนวณ OT', icon: '☕', category: 'attendance', telegramMenuOrder: 3, telegramMenuIcon: '☕' },
  { key: 'advance_pay', nameTh: 'ขอเบิกเงินล่วงหน้า', nameEn: 'Advance pay', description: 'คำร้องขอเบิกเงินล่วงหน้า', icon: '💸', category: 'payroll', telegramMenuOrder: 4, telegramMenuIcon: '💸' },
  { key: 'time_correction', nameTh: 'ขอแก้ไขเวลาเข้างาน', nameEn: 'Time correction', description: 'แก้ไขเวลาเช็กอิน/เช็กเอาท์', icon: '🕒', category: 'attendance', telegramMenuOrder: 5, telegramMenuIcon: '🕒' },
  { key: 'shift_change', nameTh: 'ขอเปลี่ยนกะ', nameEn: 'Shift change', description: 'คำร้องขอเปลี่ยนกะ', icon: '🔁', category: 'shift', telegramMenuOrder: 6, telegramMenuIcon: '🔁' },
  { key: 'off_day_change', nameTh: 'ขอเปลี่ยนวันหยุด', nameEn: 'Off-day change', description: 'คำร้องขอเปลี่ยนวันหยุด', icon: '🗓', category: 'leave', telegramMenuOrder: 7, telegramMenuIcon: '🗓' },
  { key: 'document_request', nameTh: 'ขอเอกสาร', nameEn: 'Document request', description: 'ขอเอกสารราชการ/HR', icon: '📄', category: 'document', telegramMenuOrder: 8, telegramMenuIcon: '📄' },
  { key: 'generic_request', nameTh: 'คำร้องทั่วไป', nameEn: 'Generic request', description: 'คำร้องทั่วไป', icon: '📝', category: 'general', telegramMenuOrder: 9, telegramMenuIcon: '📝' },
  { key: 'telegram_registration_review', nameTh: 'รับพนักงานใหม่', nameEn: 'Employee onboarding (legacy)', description: 'คำขอรับพนักงานใหม่ (legacy key)', icon: '📱', category: 'general', telegramMenuOrder: 99, telegramMenuIcon: '📱' },
  { key: 'employee_onboarding', nameTh: 'รับพนักงานใหม่', nameEn: 'Employee onboarding', description: 'คำขอรับพนักงานใหม่จากลิงก์เชิญ', icon: '👤', category: 'general', telegramMenuOrder: 98, telegramMenuIcon: '👤' },
];

type Tx = Prisma.TransactionClient;

export async function seedFormFieldsForVersion(tx: Tx, versionId: string, typeKey: string): Promise<void> {
  const defs = FORM_DEFS[typeKey] ?? FORM_DEFS.generic_request;
  for (const [idx, f] of defs.entries()) {
    await tx.requestFormField.create({
      data: {
        id: randomUUID(),
        requestTypeVersionId: versionId,
        key: f.key,
        labelTh: f.labelTh,
        fieldType: f.fieldType,
        required: f.required ?? false,
        helpText: f.helpText ?? undefined,
        order: idx + 1,
        optionsJson: f.optionsJson ?? undefined,
        visibilityConditionJson: f.visibilityConditionJson ?? undefined,
        isSystem: true,
      },
    });
  }
}

export async function seedApprovalFlowForVersion(tx: Tx, versionId: string, typeKey: string): Promise<void> {
  const flowId = randomUUID();
  const flowName = typeKey === 'leave_request'
    ? expectedLeaveApprovalFlowSignature()
    : 'Default approval';
  await tx.requestApprovalFlow.create({
    data: { id: flowId, requestTypeVersionId: versionId, name: flowName, status: 'active' },
  });
  const steps = FLOW_DEFS[typeKey] ?? FLOW_DEFS.generic_request;
  for (const s of steps) {
    await tx.requestApprovalStepDefinition.create({
      data: {
        id: randomUUID(),
        approvalFlowId: flowId,
        stepOrder: s.stepOrder,
        name: s.name,
        approverType: s.approverType,
        approverRole: s.approverRole,
        conditionJson: s.conditionJson ?? undefined,
        notifyTelegram: true,
      },
    });
  }
}

interface FieldDef {
  key: string;
  labelTh: string;
  fieldType: RequestFormFieldType;
  required?: boolean;
  helpText?: string;
  optionsJson?: unknown;
  visibilityConditionJson?: unknown;
}

/** Expected form field keys per system request type (for startup sync). */
export function expectedFormFieldKeys(typeKey: string): string[] {
  const defs = FORM_DEFS[typeKey] ?? FORM_DEFS.generic_request;
  return defs.map((f) => f.key);
}

/** Policy version marker — triggers form republish when routing rules change. */
export function expectedLeaveApprovalFlowSignature(): string {
  return 'leave_policy_v2_dept_role_routing';
}

/** Expected primary approver type for system request types. */
export function expectedPrimaryApproverType(typeKey: string): RequestApproverType {
  const steps = FLOW_DEFS[typeKey] ?? FLOW_DEFS.generic_request;
  return steps[0]?.approverType ?? 'owner';
}

/** Detect form shape/options changes for system type republish. */
export function expectedFormSchemaSignature(typeKey: string): string {
  const defs = FORM_DEFS[typeKey] ?? FORM_DEFS.generic_request;
  return JSON.stringify(defs.map((f) => ({
    key: f.key,
    fieldType: f.fieldType,
    required: f.required ?? false,
    optionsJson: f.optionsJson ?? null,
    visibilityConditionJson: f.visibilityConditionJson ?? null,
    helpText: f.helpText ?? null,
  })));
}

interface StepDef {
  stepOrder: number;
  name: string;
  approverType: RequestApproverType;
  approverRole?: string;
  conditionJson?: unknown;
}

const FORM_DEFS: Record<string, FieldDef[]> = {
  leave_request: [
    { key: 'leaveType', labelTh: 'ประเภทการลา', fieldType: 'leave_type_picker', required: true, optionsJson: [
      { label: 'ลาป่วย', value: 'sick' }, { label: 'ลากิจ', value: 'personal' },
      { label: 'ลาฉุกเฉิน', value: 'emergency' }, { label: 'ลาไม่รับค่าจ้าง', value: 'unpaid' },
    ] },
    {
      key: 'startDate',
      labelTh: 'วันที่ลา',
      fieldType: 'quick_date',
      required: true,
      helpText: 'กรอกวันเดียว หรือหลายวัน เช่น 16/07/2026,19/07/2026,22-23/07/2026',
    },
    { key: 'endDate', labelTh: 'วันที่สิ้นสุด (ระบบ)', fieldType: 'system_auto_fill', required: true },
    { key: 'leaveDates', labelTh: 'รายการวันลา', fieldType: 'system_auto_fill', required: false },
    { key: 'durationType', labelTh: 'รูปแบบ', fieldType: 'button_select', required: true, optionsJson: [
      { label: 'เต็มวัน', value: 'full' }, { label: 'ครึ่งวันเช้า', value: 'am' }, { label: 'ครึ่งวันบ่าย', value: 'pm' },
    ] },
    { key: 'reason', labelTh: 'เหตุผล', fieldType: 'textarea', required: true },
    { key: 'attachment', labelTh: 'ไฟล์แนบ', fieldType: 'file_upload', required: false },
  ],
  ot_request: [
    { key: 'otDate', labelTh: 'วันที่ OT', fieldType: 'quick_date', required: true },
    { key: 'startTime', labelTh: 'เวลาเริ่ม OT', fieldType: 'quick_time', required: true },
    { key: 'endTime', labelTh: 'เวลาสิ้นสุด OT', fieldType: 'quick_time', required: true },
    {
      key: 'reason',
      labelTh: 'เหตุผลขอ OT',
      fieldType: 'button_select',
      required: true,
      optionsJson: [
        { label: 'งานเร่งด่วน', value: 'urgent_work' },
        { label: 'งานค้างต่อเนื่อง', value: 'continued_work' },
        { label: 'ลูกค้า/นัดหมาย', value: 'client_meeting' },
        { label: '✏️ อื่นๆ (พิมพ์เอง)', value: 'other' },
      ],
    },
    {
      key: 'reasonDetail',
      labelTh: 'ระบุเหตุผล',
      fieldType: 'textarea',
      required: true,
      visibilityConditionJson: { fieldKey: 'reason', operator: 'equals', value: 'other' },
    },
  ],
  no_break_report: [
    {
      key: 'workDate',
      labelTh: 'วันที่ไม่ได้พักเบรก',
      fieldType: 'quick_date',
      required: true,
      helpText: 'วันที่ทำงานต่อเนื่องโดยไม่พักเบรก',
    },
    {
      key: 'note',
      labelTh: 'หมายเหตุ (ไม่บังคับ)',
      fieldType: 'textarea',
      required: false,
      helpText: 'เช่น งานลูกค้าเร่งด่วน ทีมไม่ทันเบรก',
    },
  ],
  advance_pay: [
    { key: 'amount', labelTh: 'จำนวนเงิน', fieldType: 'quick_amount', required: true },
    { key: 'reason', labelTh: 'เหตุผล', fieldType: 'textarea', required: true },
    { key: 'requestedPayDate', labelTh: 'วันที่ต้องการรับเงิน', fieldType: 'quick_date', required: true },
    { key: 'attachment', labelTh: 'ไฟล์แนบ', fieldType: 'file_upload', required: false },
  ],
  time_correction: [
    { key: 'attendanceDate', labelTh: 'วันที่', fieldType: 'quick_date', required: true },
    { key: 'correctionType', labelTh: 'ประเภทการแก้ไข', fieldType: 'button_select', required: true, optionsJson: [
      { label: 'ลืมเช็กอิน', value: 'missed_in' }, { label: 'ลืมเช็กเอาท์', value: 'missed_out' },
      { label: 'แก้เวลาเข้า', value: 'check_in' }, { label: 'แก้เวลาออก', value: 'check_out' },
      { label: 'แก้เวลากลับจากพัก', value: 'break_return' },
    ] },
    { key: 'requestedTime', labelTh: 'เวลาที่ต้องการ', fieldType: 'quick_time', required: true },
    { key: 'reason', labelTh: 'เหตุผล', fieldType: 'textarea', required: true },
    { key: 'attachment', labelTh: 'รูปภาพ', fieldType: 'image_upload', required: false },
  ],
  shift_change: [
    { key: 'currentShift', labelTh: 'กะปัจจุบัน', fieldType: 'system_auto_fill', required: false },
    { key: 'requestedShift', labelTh: 'กะที่ต้องการ', fieldType: 'shift_picker', required: true, optionsJson: [
      { label: 'เช้า', value: 'morning' }, { label: 'บ่าย', value: 'afternoon' }, { label: 'ดึก', value: 'night' },
    ] },
    { key: 'effectiveDate', labelTh: 'วันที่มีผล', fieldType: 'quick_date', required: true },
    { key: 'reason', labelTh: 'เหตุผล', fieldType: 'textarea', required: true },
  ],
  off_day_change: [
    { key: 'currentOffDay', labelTh: 'วันหยุดปัจจุบัน', fieldType: 'quick_date', required: true },
    { key: 'requestedOffDay', labelTh: 'วันหยุดที่ต้องการ', fieldType: 'quick_date', required: true },
    { key: 'reason', labelTh: 'เหตุผล', fieldType: 'textarea', required: true },
  ],
  document_request: [
    { key: 'documentType', labelTh: 'ประเภทเอกสาร', fieldType: 'document_type_picker', required: true, optionsJson: [
      { label: 'หนังสือรับรองเงินเดือน', value: 'salary_certificate' },
      { label: 'หนังสือรับรองการทำงาน', value: 'employment_certificate' },
      { label: 'เอกสารภาษี', value: 'tax_document' },
      { label: 'เอกสารอื่น ๆ', value: 'other' },
    ] },
    { key: 'language', labelTh: 'ภาษา', fieldType: 'button_select', required: true, optionsJson: [
      { label: 'ไทย', value: 'th' }, { label: 'อังกฤษ', value: 'en' },
    ] },
    { key: 'purpose', labelTh: 'วัตถุประสงค์', fieldType: 'textarea', required: true },
    { key: 'deliveryMethod', labelTh: 'วิธีรับเอกสาร', fieldType: 'button_select', required: true, optionsJson: [
      { label: 'ดาวน์โหลดผ่าน Telegram', value: 'telegram' },
      { label: 'รับไฟล์ในระบบ', value: 'system' },
      { label: 'ติดต่อ HR', value: 'hr' },
    ] },
    { key: 'dueDate', labelTh: 'วันที่ต้องการ', fieldType: 'quick_date', required: false },
  ],
  generic_request: [
    { key: 'subject', labelTh: 'หัวข้อ', fieldType: 'text', required: true },
    { key: 'detail', labelTh: 'รายละเอียด', fieldType: 'textarea', required: true },
    { key: 'attachment', labelTh: 'ไฟล์แนบ', fieldType: 'file_upload', required: false },
  ],
  telegram_registration_review: [
    { key: 'employeeId', labelTh: 'Employee ID', fieldType: 'text', required: true },
    { key: 'telegramUserId', labelTh: 'Telegram User ID', fieldType: 'text', required: true },
    { key: 'verificationMethod', labelTh: 'วิธียืนยัน', fieldType: 'text', required: true },
    { key: 'submittedEmployeeCode', labelTh: 'รหัสพนักงาน', fieldType: 'text', required: false },
    { key: 'submittedPhone', labelTh: 'เบอร์โทร', fieldType: 'text', required: false },
    { key: 'submittedInviteCode', labelTh: 'Invite Code', fieldType: 'text', required: false },
    { key: 'invitationId', labelTh: 'Invitation ID', fieldType: 'text', required: false },
    { key: 'registrationRequestId', labelTh: 'Registration Request ID', fieldType: 'text', required: false },
    { key: 'selfOnboardingSubmissionId', labelTh: 'Self-Onboarding Submission ID', fieldType: 'text', required: false },
    { key: 'reviewReason', labelTh: 'เหตุผลส่งตรวจสอบ', fieldType: 'textarea', required: false },
  ],
  employee_onboarding: [
    { key: 'employeeId', labelTh: 'รหัสพนักงาน', fieldType: 'text', required: true },
    { key: 'telegramUserId', labelTh: 'Telegram User ID', fieldType: 'text', required: true },
    { key: 'verificationMethod', labelTh: 'ช่องทาง', fieldType: 'text', required: true },
    { key: 'invitationId', labelTh: 'Invitation ID', fieldType: 'text', required: false },
    { key: 'selfOnboardingSubmissionId', labelTh: 'Submission ID', fieldType: 'text', required: false },
    { key: 'submittedPhone', labelTh: 'เบอร์โทร', fieldType: 'text', required: false },
    { key: 'reviewReason', labelTh: 'หมายเหตุ', fieldType: 'textarea', required: false },
  ],
};

const FLOW_DEFS: Record<string, StepDef[]> = {
  leave_request: [
    { stepOrder: 1, name: 'Leave policy (resolved at submit)', approverType: 'owner' },
  ],
  ot_request: [{ stepOrder: 1, name: 'Owner', approverType: 'owner' }],
  no_break_report: [{ stepOrder: 1, name: 'Owner', approverType: 'owner' }],
  advance_pay: [{ stepOrder: 1, name: 'Owner', approverType: 'owner' }],
  time_correction: [{ stepOrder: 1, name: 'Big Leader', approverType: 'requester_big_leader' }],
  shift_change: [{ stepOrder: 1, name: 'Big Leader', approverType: 'requester_big_leader' }],
  off_day_change: [{ stepOrder: 1, name: 'Big Leader', approverType: 'requester_big_leader' }],
  document_request: [{ stepOrder: 1, name: 'Secretary', approverType: 'secretary' }],
  generic_request: [
    { stepOrder: 1, name: 'Big Leader', approverType: 'requester_big_leader' },
    { stepOrder: 2, name: 'Owner', approverType: 'owner' },
  ],
  telegram_registration_review: [{ stepOrder: 1, name: 'Secretary', approverType: 'secretary' }],
  employee_onboarding: [{ stepOrder: 1, name: 'Secretary', approverType: 'secretary' }],
};
