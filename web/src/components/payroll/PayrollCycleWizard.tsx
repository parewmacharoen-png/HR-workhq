import { PayrollBuilderPreview, PayrollCycle } from '../../api/payroll';
import { PayrollOverviewSummary } from '../../api/payroll-overview';
import { WorkHQButton } from '../ui';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

type WizardStepId = 'calculate' | 'review' | 'payslip' | 'lock' | 'export' | 'paid';

const STEPS: Array<{ id: WizardStepId; label: string; hint: string }> = [
  { id: 'calculate', label: 'คำนวณ', hint: 'ดึงเวลาเข้างาน ลา OT แล้วสร้างรายการ' },
  { id: 'review', label: 'ตรวจและแก้', hint: 'คลิกชื่อพนักงานเพื่อแก้รายการด้วยมือ' },
  { id: 'payslip', label: 'สร้างสลิป', hint: 'ให้พนักงานดูใน Telegram ได้' },
  { id: 'lock', label: 'ล็อครอบ', hint: 'ยืนยันยอดก่อนโอนเงิน' },
  { id: 'export', label: 'ส่งออกไฟล์', hint: 'ดาวน์โหลดไฟล์โอนธนาคาร' },
  { id: 'paid', label: 'จ่ายแล้ว', hint: 'บันทึกว่าโอนเงินเรียบร้อย' },
];

function stepIndex(id: WizardStepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

function resolveCurrentStep(
  cycle: PayrollCycle,
  hasPreview: boolean,
  payslipReadyCount: number,
  employeeCount: number,
): WizardStepId {
  if (cycle.status === 'paid') return 'paid';
  if (cycle.status === 'locked') return 'export';
  if (!hasPreview) return 'calculate';
  if (employeeCount > 0 && payslipReadyCount < employeeCount) return 'payslip';
  if (employeeCount > 0 && payslipReadyCount >= employeeCount) return 'lock';
  return 'review';
}

export type PayrollWizardBusy =
  | 'preview'
  | 'build'
  | 'lock'
  | 'paid'
  | 'exportPreview'
  | 'exportCreate'
  | 'exportDownload'
  | 'pdfSummary'
  | 'payslips'
  | null;

export interface PayrollCycleWizardProps {
  cycle: PayrollCycle;
  preview: PayrollBuilderPreview | null;
  overviewSummary: PayrollOverviewSummary | null;
  canWrite: boolean;
  canExport: boolean;
  isOwner: boolean;
  busy: PayrollWizardBusy;
  hasExportBatch: boolean;
  payslipReadyCount?: number;
  onCalculate: () => void;
  onLock: () => void;
  onQuickExport: () => void;
  onMarkPaid: () => void;
  onRefreshPreview: () => void;
  onGeneratePayslips?: () => void;
}

export function PayrollCycleWizard({
  cycle,
  preview,
  overviewSummary,
  canWrite,
  canExport,
  isOwner,
  busy,
  hasExportBatch,
  payslipReadyCount = 0,
  onCalculate,
  onLock,
  onQuickExport,
  onMarkPaid,
  onRefreshPreview,
  onGeneratePayslips,
}: PayrollCycleWizardProps) {
  const employeeCount = preview?.totals.employeeCount ?? overviewSummary?.totalEmployees ?? 0;
  const hasPreview = Boolean(preview?.employees.length);
  const current = resolveCurrentStep(cycle, hasPreview, payslipReadyCount, employeeCount);
  const currentIdx = stepIndex(current);
  const isOpen = cycle.status === 'open';
  const isLocked = cycle.status === 'locked';
  const isPaid = cycle.status === 'paid';
  const payslipsComplete = employeeCount > 0 && payslipReadyCount >= employeeCount;

  const checklist = [
    {
      ok: employeeCount > 0,
      label: 'มีพนักงานในรอบนี้',
    },
    {
      ok: (overviewSummary?.missingBankAccountCount ?? 0) === 0,
      label: 'บัญชีธนาคารครบ',
      warn: overviewSummary?.missingBankAccountCount
        ? `ยังขาด ${overviewSummary.missingBankAccountCount} คน`
        : undefined,
    },
    {
      ok: (overviewSummary?.zeroOrNegativeNetPayCount ?? 0) === 0,
      label: 'ยอดสุทธิถูกต้อง',
      warn: overviewSummary?.zeroOrNegativeNetPayCount
        ? `มี ${overviewSummary.zeroOrNegativeNetPayCount} คนยอด ≤ 0`
        : undefined,
    },
    {
      ok: (overviewSummary?.pendingAdjustmentCount ?? 0) === 0,
      label: 'รายการปรับอนุมัติแล้ว',
      warn: overviewSummary?.pendingAdjustmentCount
        ? `รออนุมัติ ${overviewSummary.pendingAdjustmentCount} รายการ`
        : undefined,
    },
    {
      ok: !hasPreview || payslipsComplete,
      label: 'สลิปครบทุกคน',
      warn: hasPreview && !payslipsComplete
        ? `สร้างแล้ว ${payslipReadyCount}/${employeeCount} คน`
        : undefined,
    },
  ];

  return (
    <div className="whq-payroll-wizard">
      <div className="whq-payroll-wizard-steps" aria-label="ขั้นตอนทำเงินเดือน">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx || (isPaid && step.id === 'paid');
          const active = step.id === current && !isPaid;
          return (
            <div
              key={step.id}
              className={`whq-payroll-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
            >
              <div className="whq-payroll-step-num">{done && !active ? '✓' : idx + 1}</div>
              <div className="whq-payroll-step-text">
                <strong>{step.label}</strong>
                <span>{step.hint}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="whq-payroll-wizard-panel">
        {isOpen && (
          <>
            <h3>ขั้นที่ 1–4: คำนวณ · ตรวจแก้ · สร้างสลิป · ล็อก</h3>
            <ol className="whq-payroll-wizard-guide">
              <li><strong>คำนวณเงินเดือน</strong> — ดึงเวลาเข้างาน ลา OT ค่าอาหาร ค่าข้าม</li>
              <li><strong>ตรวจและแก้</strong> — คลิกชื่อพนักงานด้านล่างเพื่อแก้รายการด้วยมือ</li>
              <li><strong>สร้างสลิปทั้งหมด</strong> — พนักงานถึงจะขอสลิป PDF ใน Telegram ได้</li>
              <li><strong>ล็อครอบ</strong> — ยืนยันยอด หลังล็อกแก้รายการไม่ได้</li>
            </ol>
            {preview && (
              <div className="whq-payroll-wizard-summary">
                <span>พนักงาน <strong>{preview.totals.employeeCount}</strong> คน</span>
                <span>ยอดสุทธิโดยประมาณ <strong>{formatMoney(preview.totals.estimatedNet)}</strong> บาท</span>
                <span>
                  สลิป{' '}
                  <strong>{payslipReadyCount}/{preview.totals.employeeCount}</strong> คน
                </span>
              </div>
            )}
            {canWrite && (
              <div className="whq-payroll-wizard-actions">
                <WorkHQButton
                  type="button"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={onCalculate}
                >
                  {busy === 'build' || busy === 'preview' ? 'กำลังคำนวณ…' : '1. คำนวณเงินเดือน'}
                </WorkHQButton>
                <WorkHQButton
                  type="button"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={onRefreshPreview}
                >
                  รีเฟรชตัวอย่าง
                </WorkHQButton>
                {preview && onGeneratePayslips && (
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={onGeneratePayslips}
                  >
                    {busy === 'payslips'
                      ? 'กำลังสร้างสลิป…'
                      : payslipsComplete
                        ? '3. สร้างสลิปใหม่ทั้งหมด'
                        : '3. สร้างสลิปทั้งหมด'}
                  </WorkHQButton>
                )}
                {preview && (
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={onLock}
                  >
                    {busy === 'lock' ? 'กำลังล็อค…' : '4. ล็อครอบ (ยืนยันยอด)'}
                  </WorkHQButton>
                )}
              </div>
            )}
            {preview && (
              <p className="whq-muted whq-text-sm">
                ขั้นที่ 2: เลื่อนลงไปที่ตารางรายละเอียดตามพนักงาน — คลิกชื่อเพื่อแก้รายการ หรือกดสร้างสลิปรายคน
              </p>
            )}
          </>
        )}

        {isLocked && (
          <>
            <h3>ขั้นที่ 5–6: ส่งออกไฟล์และบันทึกว่าจ่ายแล้ว</h3>
            <p className="whq-muted">
              รอบล็อคแล้ว — สร้างไฟล์โอนธนาคาร ดาวน์โหลด แล้วกดบันทึกว่าจ่ายแล้วเมื่อโอนเงินเสร็จ
            </p>
            {canExport && (
              <div className="whq-payroll-wizard-actions">
                <WorkHQButton
                  type="button"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={onQuickExport}
                >
                  {busy === 'exportPreview' || busy === 'exportCreate' || busy === 'exportDownload'
                    ? 'กำลังสร้างไฟล์…'
                    : hasExportBatch
                      ? 'ดาวน์โหลดไฟล์โอนอีกครั้ง'
                      : 'สร้างและดาวน์โหลดไฟล์โอน'}
                </WorkHQButton>
                {canWrite && (
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy !== null || !hasExportBatch}
                    onClick={onMarkPaid}
                  >
                    {busy === 'paid' ? 'กำลังบันทึก…' : 'บันทึกว่าจ่ายแล้ว'}
                  </WorkHQButton>
                )}
              </div>
            )}
            {!canExport && canWrite && (
              <div className="whq-payroll-wizard-actions">
                <WorkHQButton type="button" variant="secondary" disabled={busy !== null} onClick={onMarkPaid}>
                  {busy === 'paid' ? 'กำลังบันทึก…' : 'บันทึกว่าจ่ายแล้ว'}
                </WorkHQButton>
              </div>
            )}
          </>
        )}

        {isPaid && (
          <>
            <h3>รอบนี้จ่ายเงินเรียบร้อยแล้ว</h3>
            <p className="whq-muted">สามารถดูรายละเอียด ดาวน์โหลดสลิป และดาวน์โหลดไฟล์โอนย้อนหลังได้ด้านล่าง</p>
          </>
        )}

        {(isOpen || isLocked) && overviewSummary && (
          <div className="whq-payroll-checklist">
            <p className="whq-payroll-checklist-title">ตรวจก่อนดำเนินการต่อ</p>
            <ul>
              {checklist.map((item) => (
                <li key={item.label} className={item.ok ? 'is-ok' : 'is-warn'}>
                  <span className="whq-payroll-check-icon" aria-hidden>{item.ok ? '✓' : '!'}</span>
                  <span>
                    {item.label}
                    {item.warn ? <em className="whq-payroll-check-warn"> — {item.warn}</em> : null}
                  </span>
                </li>
              ))}
            </ul>
            {!isOwner && (overviewSummary.pendingAdjustmentCount ?? 0) > 0 && (
              <p className="whq-muted whq-payroll-check-note">
                มีรายการรออนุมัติ — แจ้ง Owner ตรวจสอบก่อนล็อคหรือส่งออก
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
