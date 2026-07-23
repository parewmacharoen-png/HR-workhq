import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { isKnownRoute } from '../../../config/routes';
import { isMarketingEnabled } from '../../../config/product';
import { ONBOARDING_INVITE_PERMISSIONS } from '../../../constants/onboarding-invite-permissions';

interface QuickCreateItem {
  label: string;
  path: string;
  icon: string;
  permission?: string;
  inviteItem?: boolean;
  marketingOnly?: boolean;
}

const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  { label: 'เพิ่มพนักงาน', path: '/hr/employees/new', icon: '👤', permission: 'employee:write' },
  { label: 'เชิญพนักงาน', path: '/hr/invitation', icon: '🔗', inviteItem: true },
  { label: 'สร้างคำขอ', path: '/requests/create', icon: '📋', permission: 'workflow:read' },
  { label: 'คำนวณเงินเดือน', path: '/payroll/cycles', icon: '💰', permission: 'payroll:read' },
  { label: 'คำนวณคอมมิชชั่น', path: '/commission', icon: '💎', permission: 'commission:read', marketingOnly: true },
  { label: 'ตั้งค่าวันหยุด', path: '/settings/leave', icon: '📅', permission: 'settings:read' },
  { label: 'ตั้งค่า Workflow', path: '/settings/workflows', icon: '🔧', permission: 'workflow:write' },
];

export function GlobalQuickCreate() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const marketing = isMarketingEnabled();

  const items = QUICK_CREATE_ITEMS.filter((item) => {
    if (item.marketingOnly && !marketing) return false;
    if (!isKnownRoute(item.path)) return false;
    if (item.inviteItem) {
      const canCreate = can(ONBOARDING_INVITE_PERMISSIONS.create);
      const canMode = can(ONBOARDING_INVITE_PERMISSIONS.newEmployee)
        || can(ONBOARDING_INVITE_PERMISSIONS.linkExisting);
      return canCreate && canMode;
    }
    if (item.permission && !can(item.permission)) return false;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="whq-global-quick-create" ref={ref}>
      <button
        type="button"
        className="whq-fab"
        aria-label="สร้างรายการใหม่"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="whq-fab-menu" role="menu">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="whq-fab-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
