import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  fetchEmployeeAttendance,
  type EmployeeAttendanceHistoryItem,
  type EmployeeAttendanceResponse,
} from '../../../api/employee-attendance';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import {
  attendanceDayTitle,
  buildAttendanceDayChips,
  formatBreakListCell,
  attendanceMonthOptions,
  attendanceShiftOptions,
  attendanceStatusLabel,
  attendanceStatusVariant,
  attendanceYearOptions,
  buildAttendanceMonthCalendar,
  filterAttendanceHistory,
  formatAttendanceTime,
  formatWorkedHours,
  isOffDayStatus,
  isWorkDayStatus,
  leaveTypeFullLabel,
  todayStatusLabel,
  todayStatusVariant,
} from '../../../lib/employee-attendance-utils';
import { useAuth } from '../../../context/AuthContext';
import { canEditEmployeeAttendance } from '../../../lib/attendance-edit-access';
import { AttendanceRecordDetailModal } from '../../attendance/AttendanceRecordDetailModal';
import {
  AttendanceSummaryDetailModal,
  type AttendanceSummaryKind,
} from '../../attendance/AttendanceSummaryDetailModal';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function AttendanceSummarySkeleton() {
  return (
    <div className="whq-stat-grid whq-employee-attendance-summary-skeleton" data-testid="employee-attendance-summary-skeleton">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="whq-stat-card whq-stat-card--skeleton" />
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  onOpen,
}: {
  label: string;
  value: string | number;
  tone: AttendanceSummaryKind;
  onOpen: (kind: AttendanceSummaryKind) => void;
}) {
  return (
    <button
      type="button"
      className="whq-stat-card whq-stat-card--clickable"
      data-testid={`attendance-summary-${tone}`}
      onClick={() => onOpen(tone)}
    >
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
      <div className="whq-stat-card__hint">กดดูรายละเอียด</div>
    </button>
  );
}

function dayCellClass(status: string): string {
  if (status === 'empty') return 'whq-att-day whq-att-day--empty';
  if (status === 'holiday') return 'whq-att-day whq-att-day--holiday';
  if (status === 'leave') return 'whq-att-day whq-att-day--leave';
  if (status === 'absent') return 'whq-att-day whq-att-day--absent';
  if (status === 'late') return 'whq-att-day whq-att-day--late';
  if (isWorkDayStatus(status)) return 'whq-att-day whq-att-day--work';
  return 'whq-att-day whq-att-day--none';
}

interface EmployeeAttendanceTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeeAttendanceTab({ employeeId, companyId }: EmployeeAttendanceTabProps) {
  const { can, user } = useAuth();
  const canEditAttendance = canEditEmployeeAttendance(can, user?.businessRole);
  const [data, setData] = useState<EmployeeAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const [shift, setShift] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmployeeAttendanceHistoryItem | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [summaryKind, setSummaryKind] = useState<AttendanceSummaryKind | null>(null);

  function openRecord(row: EmployeeAttendanceHistoryItem, edit = false) {
    setSummaryKind(null);
    setSelected(row);
    setOpenInEditMode(edit && canEditAttendance);
  }

  function closeRecord() {
    setSelected(null);
    setOpenInEditMode(false);
  }

  function openSummary(kind: AttendanceSummaryKind) {
    setSelected(null);
    setOpenInEditMode(false);
    setSummaryKind(kind);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEmployeeAttendance(employeeId, companyId));
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => attendanceYearOptions(data?.history ?? [], currentYear),
    [currentYear, data?.history],
  );
  const monthOptions = useMemo(
    () => attendanceMonthOptions(data?.history ?? [], year || String(currentYear)),
    [currentYear, data?.history, year],
  );
  const shiftOptions = useMemo(
    () => attendanceShiftOptions(data?.history ?? []),
    [data?.history],
  );

  useEffect(() => {
    if (!year && yearOptions.length) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  useEffect(() => {
    if (!monthOptions.length) return;
    // Reset when year changes and current month is not in that year's data.
    if (!month || !monthOptions.includes(month)) {
      setMonth(monthOptions[0]);
    }
  }, [month, monthOptions]);

  const monthHistory = useMemo(
    () => filterAttendanceHistory(data?.history ?? [], {
      year,
      month,
      status: '',
      shift: '',
      search: '',
    }),
    [data?.history, year, month],
  );

  const filteredHistory = useMemo(
    () => filterAttendanceHistory(data?.history ?? [], { year, month, status, shift, search }),
    [data?.history, year, month, status, shift, search],
  );

  const calendarDays = useMemo(
    () => buildAttendanceMonthCalendar(year, month, monthHistory),
    [year, month, monthHistory],
  );

  const monthHolidayDates = useMemo(
    () => monthHistory.filter((row) => row.status === 'holiday').map((row) => row.date).sort(),
    [monthHistory],
  );
  const monthLeaveDays = useMemo(
    () => monthHistory
      .filter((row) => row.status === 'leave')
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date)),
    [monthHistory],
  );

  const monthStats = useMemo(() => {
    const work = monthHistory.filter((row) => isWorkDayStatus(row.status)).length;
    const holiday = monthHistory.filter((row) => row.status === 'holiday').length;
    const leave = monthHistory.filter((row) => row.status === 'leave').length;
    const late = monthHistory.filter((row) => row.status === 'late').length;
    const absent = monthHistory.filter((row) => row.status === 'absent').length;
    return { work, holiday, leave, late, absent };
  }, [monthHistory]);

  const tableState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !data || data.history.length === 0
        ? 'empty' as const
        : filteredHistory.length === 0 && viewMode === 'list'
          ? 'empty' as const
          : 'success' as const;

  const summary = data?.summary;
  const todayVariant = summary ? todayStatusVariant(summary.todayStatus) : 'neutral';
  const todayIsOff = summary
    ? summary.todayStatus === 'holiday' || summary.todayStatus === 'leave'
    : false;

  return (
    <div className="whq-employee-attendance-tab" data-testid="employee-attendance-tab">
      <div className="whq-tab-toolbar">
        <WorkHQButton to={`/requests/create?employeeId=${employeeId}&typeKey=time_correction&mode=hr_manual`} variant="secondary">
          สร้างคำขอแก้ไขเวลา
        </WorkHQButton>
        <WorkHQButton to={`/attendance?employeeId=${employeeId}`} variant="ghost">
          ศูนย์ควบคุมเวลา
        </WorkHQButton>
      </div>

      <WorkHQPageState
        state={loading ? 'loading' : error ? 'error' : 'success'}
        loading={<AttendanceSummarySkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
      >
        {summary && (
          <>
            <div
              className={`whq-att-today-banner whq-att-today-banner--${todayVariant}${todayIsOff ? ' whq-att-today-banner--off' : ''}`}
              data-testid="attendance-today-banner"
            >
              <div className="whq-att-today-banner__label">สถานะวันนี้</div>
              <div className="whq-att-today-banner__value">
                <span className={`whq-badge whq-badge-${todayVariant} whq-att-today-badge`}>
                  {todayStatusLabel(summary.todayStatus)}
                </span>
              </div>
              <div className="whq-att-today-banner__meta">
                {todayIsOff
                  ? summary.todayStatus === 'holiday'
                    ? 'วันนี้เป็นวันหยุดประจำเดือน — ไม่ต้องเข้างาน'
                    : 'วันนี้ลางาน'
                  : summary.todayStatus === 'working'
                    ? `กำลังทำงาน · เช็กอิน ${formatAttendanceTime(summary.lastCheckInAt)}`
                    : summary.todayStatus === 'checked_out'
                      ? `เช็กเอาต์แล้ว · ${formatAttendanceTime(summary.lastCheckOutAt)}`
                      : summary.todayStatus === 'absent'
                        ? 'วันนี้ขาดงาน'
                        : 'ยังไม่เช็กอิน'}
              </div>
            </div>

            <div className="whq-stat-grid whq-employee-attendance-summary" data-testid="employee-attendance-summary">
              <SummaryCard label="วันทำงานเดือนนี้" value={summary.workingDaysMonth} tone="working-days" onOpen={openSummary} />
              <SummaryCard label="วันหยุดเดือนนี้" value={summary.holidayDaysMonth ?? monthStats.holiday} tone="holiday-days" onOpen={openSummary} />
              <SummaryCard label="วันลาเดือนนี้" value={summary.leaveDaysMonth ?? monthStats.leave} tone="leave-days" onOpen={openSummary} />
              <SummaryCard label="มาสายเดือนนี้" value={summary.lateCountMonth} tone="late-month" onOpen={openSummary} />
              <SummaryCard label="ขาดงานเดือนนี้" value={summary.absentCountMonth} tone="absent-month" onOpen={openSummary} />
              <SummaryCard label="OT เดือนนี้ (ชม.)" value={summary.otHoursMonth} tone="ot-month" onOpen={openSummary} />
              <SummaryCard
                label="พักเกินเวลาเดือนนี้"
                value={summary.breakOverCountMonth ?? 0}
                tone="break-over-month"
                onOpen={openSummary}
              />
              <SummaryCard label="วัน Office" value={summary.officeDaysMonth} tone="office-days" onOpen={openSummary} />
              <SummaryCard label="วัน WFH" value={summary.wfhDaysMonth} tone="wfh-days" onOpen={openSummary} />
            </div>
            <p className="whq-muted whq-text-sm whq-att-summary-hint">
              กดการ์ดด้านบนเพื่อดูรายละเอียด (เช่น พักเกินวันไหน กี่นาที หักเท่าไหร่) · กดวันที่ในปฏิทินเพื่อดูเข้า–ออกงานรายวัน
            </p>
          </>
        )}
      </WorkHQPageState>

      <WorkHQCard title="ปฏิทินเวลาทำงาน" className="whq-detail-card whq-detail-card--wide">
        <div className="whq-employee-attendance-toolbar">
          <WorkHQField label="ปี">
            <WorkHQSelect
              value={year}
              data-testid="attendance-filter-year"
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="เดือน">
            <WorkHQSelect
              value={month}
              data-testid="attendance-filter-month"
              onChange={(event) => setMonth(event.target.value)}
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="มุมมอง">
            <WorkHQSelect
              value={viewMode}
              data-testid="attendance-view-mode"
              onChange={(event) => setViewMode(event.target.value as 'calendar' | 'list')}
            >
              <option value="calendar">ปฏิทิน</option>
              <option value="list">ตารางรายละเอียด</option>
            </WorkHQSelect>
          </WorkHQField>
          {viewMode === 'list' && (
            <>
              <WorkHQField label="สถานะ">
                <WorkHQSelect
                  value={status}
                  data-testid="attendance-filter-status"
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  <option value="working">กำลังทำงาน</option>
                  <option value="checked_out">เช็กเอาต์แล้ว</option>
                  <option value="late">มาสาย</option>
                  <option value="absent">ขาดงาน</option>
                  <option value="leave">ลา</option>
                  <option value="holiday">วันหยุด</option>
                </WorkHQSelect>
              </WorkHQField>
              <WorkHQField label="กะ">
                <WorkHQSelect
                  value={shift}
                  data-testid="attendance-filter-shift"
                  onChange={(event) => setShift(event.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  {shiftOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
              <WorkHQField label="ค้นหา">
                <WorkHQInput
                  type="search"
                  value={search}
                  placeholder="ค้นหาวันที่ สถานะ กะ หรือสถานที่ทำงาน"
                  data-testid="attendance-search"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </WorkHQField>
            </>
          )}
        </div>

        {year && month && (
          <div className="whq-att-month-summary" data-testid="attendance-month-summary">
            <strong>สรุปเดือน {month}/{year}:</strong>
            {' '}ทำงาน {monthStats.work} วัน
            {' · '}หยุด {monthStats.holiday} วัน
            {' · '}ลา {monthStats.leave} วัน
            {' · '}สาย {monthStats.late} วัน
            {' · '}ขาด {monthStats.absent} วัน
          </div>
        )}

        <WorkHQPageState
          state={tableState}
          loading={<AttendanceSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีข้อมูลเวลาทำงาน"
              description="ประวัติการเข้างานจะแสดงที่นี่เมื่อมีการบันทึกเวลา"
            />
          )}
        >
          {viewMode === 'calendar' ? (
            <>
              <div className="whq-att-legend" data-testid="attendance-legend">
                <span className="whq-att-legend__item whq-att-legend__item--work">ทำงาน</span>
                <span className="whq-att-legend__item whq-att-legend__item--holiday">วันหยุด</span>
                <span className="whq-att-legend__item whq-att-legend__item--leave">ลา</span>
                <span className="whq-att-legend__item whq-att-legend__item--late">มาสาย</span>
                <span className="whq-att-legend__item whq-att-legend__item--absent">ขาดงาน</span>
                <span className="whq-att-legend__item whq-att-legend__item--break-over">พักเกิน</span>
              </div>
              <p className="whq-muted whq-text-sm whq-att-calendar-hint">
                กดวันที่เพื่อดูรายละเอียด (เข้างาน · พัก · เลิกงาน · OT · พักเกินเวลา)
              </p>

              <div className="whq-att-month-cal" data-testid="attendance-month-calendar">
                {WEEKDAYS.map((label) => (
                  <div key={label} className="whq-att-day-head">{label}</div>
                ))}
                {calendarDays.map((cell, index) => {
                  if (!cell.date) {
                    return <div key={`pad-${index}`} className={dayCellClass('empty')} />;
                  }
                  const clickable = Boolean(cell.item);
                  const chips = buildAttendanceDayChips(
                    cell.item,
                    cell.status,
                    formatAttendanceTime,
                  );
                  const title = cell.item
                    ? `${attendanceDayTitle(cell.item)} — กดดูรายละเอียด`
                    : undefined;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      className={`${dayCellClass(cell.status)}${clickable ? ' whq-att-day--clickable' : ''}`}
                      data-testid={`attendance-day-${cell.date}`}
                      disabled={!clickable}
                      title={title}
                      onClick={() => {
                        if (cell.item) openRecord(cell.item, false);
                      }}
                    >
                      <span className="whq-att-day__num">{cell.day}</span>
                      <div className="whq-att-day__chips">
                        {chips.map((chip) => (
                          <span
                            key={`${chip.tone}-${chip.text}`}
                            className={`whq-att-day__chip whq-att-day__chip--${chip.tone}`}
                          >
                            {chip.text}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {(monthHolidayDates.length > 0 || monthLeaveDays.length > 0) && (
                <div className="whq-att-off-lists" data-testid="attendance-off-lists">
                  {monthHolidayDates.length > 0 && (
                    <div>
                      <div className="whq-att-off-lists__title">วันหยุดประจำเดือน ({monthHolidayDates.length} วัน)</div>
                      <div className="whq-att-off-lists__chips">
                        {monthHolidayDates.map((date) => (
                          <span key={date} className="whq-att-chip whq-att-chip--holiday">
                            {formatThaiDate(date)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {monthLeaveDays.length > 0 && (
                    <div>
                      <div className="whq-att-off-lists__title">วันลา ({monthLeaveDays.length} วัน)</div>
                      <div className="whq-att-off-lists__chips">
                        {monthLeaveDays.map((row) => (
                          <span key={row.id} className="whq-att-chip whq-att-chip--leave">
                            {formatThaiDate(row.date)}
                            {' · '}
                            {leaveTypeFullLabel(row.leaveTypeCode, row.leaveTypeName)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-employee-attendance-table" data-testid="employee-attendance-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>สถานะ</th>
                    <th>กะ</th>
                    <th>เช็กอิน</th>
                    <th>เช็กเอาต์</th>
                    <th>พัก</th>
                    <th>ชั่วโมงทำงาน</th>
                    <th>OT</th>
                    <th>สาย</th>
                    <th>สถานที่ทำงาน</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row) => {
                    const variant = attendanceStatusVariant(row.status);
                    const badgeClass = row.status === 'leave'
                      ? 'whq-badge whq-badge-info'
                      : `whq-badge whq-badge-${variant}`;
                    const rowClass = [
                      'whq-table-row-clickable',
                      isOffDayStatus(row.status) ? 'whq-att-row--off' : '',
                      isWorkDayStatus(row.status) ? 'whq-att-row--work' : '',
                      row.status === 'absent' ? 'whq-att-row--absent' : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <tr
                        key={row.id}
                        data-testid={`attendance-row-${row.id}`}
                        className={rowClass}
                        onClick={() => openRecord(row, false)}
                      >
                        <td>{formatThaiDate(row.date)}</td>
                        <td>
                          <span className={badgeClass} data-testid={`attendance-status-${row.id}`}>
                            {row.status === 'leave'
                              ? leaveTypeFullLabel(row.leaveTypeCode, row.leaveTypeName)
                              : attendanceStatusLabel(row.status)}
                          </span>
                        </td>
                        <td>{isOffDayStatus(row.status) ? '—' : (row.shift ?? NO_DATA)}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : formatAttendanceTime(row.checkInAt)}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : formatAttendanceTime(row.checkOutAt)}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : formatBreakListCell(row)}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : formatWorkedHours(row.workedHours)}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : row.otHours}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : row.lateMinutes}</td>
                        <td>{isOffDayStatus(row.status) ? '—' : (row.workCategory === 'wfh' ? 'WFH' : 'Office')}</td>
                        <td>
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            data-testid={`attendance-view-${row.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openRecord(row, false);
                            }}
                          >
                            ดูรายละเอียด
                          </WorkHQButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQPageState>
      </WorkHQCard>

      {summaryKind && data && (
        <AttendanceSummaryDetailModal
          kind={summaryKind}
          history={data.history}
          employeeId={employeeId}
          companyId={companyId}
          canEdit={canEditAttendance}
          onClose={() => setSummaryKind(null)}
          onOpenDay={(row) => openRecord(row, false)}
          onChanged={() => void load()}
        />
      )}

      {selected && (
        <AttendanceRecordDetailModal
          item={selected}
          employeeId={employeeId}
          companyId={companyId}
          canEdit={canEditAttendance}
          startInEditMode={openInEditMode}
          onClose={closeRecord}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
