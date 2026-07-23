import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchEmployeeList } from '../../../api/employees';
import { employeeCompactLabel } from '../../../lib/employee-display';
import { useAuth } from '../../../context/AuthContext';
import { isKnownRoute } from '../../../config/routes';

interface CommandAction {
  id: string;
  label: string;
  keywords: string[];
  path?: string;
  run?: () => void;
  group: string;
}

interface CommandPaletteProps {
  companyId?: string;
}

export function CommandPalette({ companyId }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [employeeHits, setEmployeeHits] = useState<Array<{ id: string; label: string }>>([]);

  const navActions = useMemo((): CommandAction[] => {
    const items: CommandAction[] = [
      { id: 'nav-payroll', label: 'ไปหน้าเงินเดือน', keywords: ['payroll', 'เงินเดือน'], path: '/payroll/cycles', group: 'นำทาง' },
      { id: 'nav-requests', label: 'ไปหน้าคำขอ', keywords: ['requests', 'คำขอ'], path: '/requests', group: 'นำทาง' },
      { id: 'nav-approvals', label: 'ไปหน้าอนุมัติ', keywords: ['approve', 'อนุมัติ'], path: '/approvals', group: 'นำทาง' },
      { id: 'nav-employees', label: 'ไปหน้าพนักงาน', keywords: ['employee', 'พนักงาน'], path: '/hr/employees', group: 'นำทาง' },
      { id: 'nav-settings', label: 'ไปหน้าตั้งค่า', keywords: ['settings', 'ตั้งค่า'], path: '/settings', group: 'นำทาง' },
      { id: 'nav-dashboard', label: 'ไปภาพรวม', keywords: ['dashboard', 'ภาพรวม'], path: '/dashboard', group: 'นำทาง' },
    ];

    if (can('workflow:read')) {
      items.push({
        id: 'create-request',
        label: 'สร้างคำขอ',
        keywords: ['create', 'สร้าง', 'request'],
        path: '/requests/create',
        group: 'การดำเนินการ',
      });
    }
    if (can('employee:write')) {
      items.push({
        id: 'invite-employee',
        label: 'เชิญพนักงาน',
        keywords: ['invite', 'เชิญ', 'telegram'],
        path: '/hr/invitation',
        group: 'การดำเนินการ',
      });
    }

    return items.filter((a) => !a.path || isKnownRoute(a.path));
  }, [can]);

  const runAction = useCallback((action: CommandAction) => {
    setOpen(false);
    setQuery('');
    if (action.path) navigate(action.path);
    else action.run?.();
  }, [navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || !companyId || query.trim().length < 2 || !can('employee:read')) {
      setEmployeeHits([]);
      return;
    }
    const q = query.trim();
    let cancelled = false;
    void fetchEmployeeList({ companyId, search: q })
      .then((res) => {
        if (cancelled) return;
        setEmployeeHits(
          res.items.slice(0, 8).map((e) => ({
            id: e.id,
            label: employeeCompactLabel(e),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setEmployeeHits([]);
      });
    return () => { cancelled = true; };
  }, [open, query, companyId, can]);

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navActions;
    return navActions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q)),
    );
  }, [navActions, query]);

  if (!open) return null;

  return (
    <div className="whq-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="whq-command-palette whq-modal"
        role="dialog"
        aria-label="ค้นหาและนำทาง"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="search"
          className="whq-command-input"
          placeholder="ค้นหาพนักงาน หรือพิมพ์คำสั่ง… (Cmd/Ctrl+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="whq-command-results">
          {filteredNav.length > 0 && (
            <section>
              <div className="whq-command-group-label">คำสั่ง</div>
              {filteredNav.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="whq-command-item"
                  onClick={() => runAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </section>
          )}
          {employeeHits.length > 0 && (
            <section>
              <div className="whq-command-group-label">พนักงาน</div>
              {employeeHits.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  className="whq-command-item"
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                    navigate(`/hr/employees/${emp.id}`);
                  }}
                >
                  {emp.label}
                </button>
              ))}
            </section>
          )}
          {filteredNav.length === 0 && employeeHits.length === 0 && (
            <p className="whq-muted" style={{ padding: '1rem' }}>ไม่พบผลลัพธ์</p>
          )}
        </div>
      </div>
    </div>
  );
}
