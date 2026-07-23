import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  createCompanyShift,
  deleteCompanyShift,
  fetchCompanyShifts,
  formatShiftMinutes,
  parseTimeToMinutes,
  ShiftOption,
  updateCompanyShift,
} from '../../api/shift-assignments';

interface ShiftTemplatesSectionProps {
  companyId: string;
  canWrite: boolean;
}

interface ShiftFormState {
  name: string;
  startTime: string;
  endTime: string;
}

const EMPTY_FORM: ShiftFormState = {
  name: '',
  startTime: '09:00',
  endTime: '18:00',
};

export function ShiftTemplatesSection({ companyId, canWrite }: ShiftTemplatesSectionProps) {
  const addFormRef = useRef<HTMLDivElement>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<ShiftFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ShiftFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchCompanyShifts(companyId);
      setShifts(rows);
      setError(null);
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'โหลดรายการกะไม่สำเร็จ';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [companyId]);

  function startEdit(shift: ShiftOption) {
    setEditingId(shift.id);
    setEditForm({
      name: shift.name,
      startTime: formatShiftMinutes(shift.startMinutes),
      endTime: formatShiftMinutes(shift.endMinutes),
    });
    setSuccess(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function validateForm(form: ShiftFormState): { startMinutes: number; endMinutes: number } | string {
    const startMinutes = parseTimeToMinutes(form.startTime);
    const endMinutes = parseTimeToMinutes(form.endTime);
    if (!form.name.trim()) return 'กรุณาระบุชื่อกะ';
    if (startMinutes === null || endMinutes === null) return 'รูปแบบเวลาไม่ถูกต้อง (ใช้ HH:MM)';
    if (startMinutes === endMinutes) return 'เวลาเข้าและเลิกงานต้องไม่เท่ากัน';
    return { startMinutes, endMinutes };
  }

  async function handleSaveEdit(shiftId: string) {
    if (!canWrite || !editForm) return;
    const validated = validateForm(editForm);
    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateCompanyShift(companyId, shiftId, {
        name: editForm.name.trim(),
        startMinutes: validated.startMinutes,
        endMinutes: validated.endMinutes,
      });
      setSuccess(`บันทึกกะ "${editForm.name.trim()}" แล้ว`);
      cancelEdit();
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'บันทึกกะไม่สำเร็จ';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!canWrite) return;
    const validated = validateForm(addForm);
    if (typeof validated === 'string') {
      setError(validated);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createCompanyShift(companyId, {
        name: addForm.name.trim(),
        startMinutes: validated.startMinutes,
        endMinutes: validated.endMinutes,
      });
      setSuccess(`เพิ่มกะ "${addForm.name.trim()}" สำเร็จ`);
      setAddForm(EMPTY_FORM);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'บันทึกกะไม่สำเร็จ';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(shift: ShiftOption) {
    if (!canWrite) return;
    if (!window.confirm(`ปิดใช้งานกะ "${shift.name}"? (กะที่มีพนักงานใช้งานอยู่จะลบไม่ได้)`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteCompanyShift(companyId, shift.id);
      if (editingId === shift.id) cancelEdit();
      setSuccess(`ปิดใช้งานกะ "${shift.name}" แล้ว`);
      await load();
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : 'ไม่สามารถปิดใช้งานกะได้ — อาจมีพนักงานใช้งานอยู่';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function focusAddForm() {
    addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const activeShifts = shifts.filter((s) => s.isActive !== false);

  return (
    <section className="whq-shift-settings-section">
      <h2>ตั้งค่ากะงาน (เวลาเข้า–เลิก)</h2>
      <p className="muted">
        กำหนดเวลาแต่ละกะเพื่อใช้แจ้งเตือน Telegram, คำนวณสาย และหักเงินเดือน
      </p>

      {error && <p className="error-text whq-shift-settings-banner">{error}</p>}
      {success && <p className="success-text whq-shift-settings-banner">{success}</p>}
      {editingId && editForm && (
        <p className="whq-shift-settings-editing-banner">
          กำลังแก้ไขกะ — แก้ค่าในแถวที่ไฮไลต์แล้วกด &quot;บันทึก&quot;
        </p>
      )}

      <div className="whq-shift-settings-table-wrap">
        <h3>กะที่ตั้งไว้แล้ว ({activeShifts.length})</h3>
        {loading ? (
          <p>กำลังโหลดกะ...</p>
        ) : activeShifts.length === 0 ? (
          <p className="muted">
            ยังไม่มีกะ —{' '}
            {canWrite ? (
              <button type="button" className="link-btn" onClick={focusAddForm}>เพิ่มกะด้านล่าง</button>
            ) : (
              'ยังไม่มีการตั้งกะ'
            )}
          </p>
        ) : (
          <table className="whq-shift-settings-table">
            <thead>
              <tr>
                <th>ชื่อกะ</th>
                <th>เข้างาน</th>
                <th>เลิกงาน</th>
                <th>หมายเหตุ</th>
                {canWrite && <th>จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {activeShifts.map((shift) => {
                const isEditing = editingId === shift.id && editForm != null;
                return (
                  <tr key={shift.id} className={isEditing ? 'is-editing' : undefined}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            className="whq-shift-inline-input"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })}
                            disabled={saving}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            className="whq-shift-inline-input"
                            value={editForm.startTime}
                            onChange={(e) => setEditForm((f) => f && { ...f, startTime: e.target.value })}
                            disabled={saving}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            className="whq-shift-inline-input"
                            value={editForm.endTime}
                            onChange={(e) => setEditForm((f) => f && { ...f, endTime: e.target.value })}
                            disabled={saving}
                          />
                        </td>
                        <td>{shift.crossesMidnight ? 'ข้ามวัน' : '—'}</td>
                        <td className="whq-shift-settings-actions">
                          <button
                            type="button"
                            className="whq-bo-act whq-bo-act--perm"
                            onClick={() => void handleSaveEdit(shift.id)}
                            disabled={saving}
                          >
                            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            ยกเลิก
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><strong>{shift.name}</strong></td>
                        <td>{formatShiftMinutes(shift.startMinutes)}</td>
                        <td>{formatShiftMinutes(shift.endMinutes)}</td>
                        <td>{shift.crossesMidnight ? 'ข้ามวัน' : '—'}</td>
                        {canWrite && (
                          <td className="whq-shift-settings-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEdit(shift)}
                              disabled={saving || editingId != null}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void onDeactivate(shift)}
                              disabled={saving || editingId != null}
                            >
                              ปิดใช้งาน
                            </button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {canWrite && !editingId && (
        <div ref={addFormRef} className="whq-shift-settings-form form-grid">
          <h3>เพิ่มกะใหม่</h3>
          <label>
            ชื่อกะ
            <input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="เช่น กะกลางวัน"
            />
          </label>
          <label>
            เวลาเข้างาน
            <input
              type="time"
              value={addForm.startTime}
              onChange={(e) => setAddForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </label>
          <label>
            เวลาเลิกงาน
            <input
              type="time"
              value={addForm.endTime}
              onChange={(e) => setAddForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="button" onClick={() => void handleAdd()} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'เพิ่มกะ'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
