import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ALL_COMPANIES_ID, userHasGlobalCompanyScope } from '../../constants/company';
import { useAuth } from '../../context/AuthContext';
import {
  formatNavBadgeCount,
  navBadgeCountForPath,
  useNavNotificationCounts,
} from '../../hooks/useNavNotificationCounts';
import { th, userRoleLabel } from '../../i18n/th-labels';
import { filterNavGroups } from '../../layout/nav-config';
import { CommandPalette } from '../workhq/command/CommandPalette';
import { GlobalQuickCreate } from '../workhq/quick-create/GlobalQuickCreate';
import { WorkHQAlert } from './WorkHQAlert';
import { WorkHQAvatar } from './WorkHQAvatar';

export function WorkHQAppLayout() {
  const location = useLocation();
  const { user, companies, companyId, selectCompany, logout } = useAuth();
  const hasAllScope = user ? userHasGlobalCompanyScope(user) : false;
  const groups = filterNavGroups(
    user?.permissions ?? [],
    undefined,
    hasAllScope,
  );
  const displayName = user?.displayName ?? user?.username ?? '';
  const initial = displayName.charAt(0) || '?';
  const displayCompanyId = companyId
    || (hasAllScope && companies.length > 1 ? ALL_COMPANIES_ID : '');
  const needsCompanyPick = companies.length > 0 && !displayCompanyId && !hasAllScope;
  const hasAllScopeNav = hasAllScope;
  const navIsEmpty = !hasAllScopeNav
    && groups.every((g) => g.items.length <= 1)
    && (groups[0]?.items.length ?? 0) <= 1
    && !(user?.permissions.includes('employee:read') || user?.permissions.includes('settings:read'));
  const navCounts = useNavNotificationCounts();

  return (
    <div className="whq-app-shell">
      <aside className="whq-sidebar">
        <div className="whq-brand">
          <div className="whq-brand-logo">
            <div className="whq-brand-icon" aria-hidden>🌱</div>
            <div>
              <strong>{th.brand}</strong>
              <span>{th.brandTagline} ✨</span>
            </div>
          </div>
        </div>

        <nav className="whq-sidebar-nav" aria-label="เมนูหลัก">
          {groups.map((group) => (
            <div key={group.id} className="whq-nav-group">
              <div className="whq-nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const badgeCount = navBadgeCountForPath(item.path, navCounts);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => {
                      const prefix = item.matchPrefix ?? item.path;
                      const active = isActive || (prefix !== '/' && location.pathname.startsWith(prefix));
                      return `whq-nav-link${active ? ' active' : ''}`;
                    }}
                    end={!item.matchPrefix || item.matchPrefix === item.path}
                  >
                    {item.icon && <span className="whq-nav-icon" aria-hidden>{item.icon}</span>}
                    <span className="whq-nav-label">{item.label}</span>
                    {badgeCount > 0 ? (
                      <span className="whq-nav-badge" aria-label={`${badgeCount} รายการรอดำเนินการ`}>
                        {formatNavBadgeCount(badgeCount)}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="whq-sidebar-footer">
          <div className="whq-user-row">
            <WorkHQAvatar initials={initial} variant="peach" />
            <div>
              <div className="whq-user-name">คุณ{displayName}</div>
              <div className="whq-user-role">{userRoleLabel(user?.roles ?? [])}</div>
            </div>
          </div>
          <button type="button" className="whq-btn whq-btn-ghost" onClick={logout} style={{ width: '100%', justifyContent: 'flex-start' }}>
            {th.nav.logout}
          </button>
        </div>
      </aside>

      <div className="whq-main-column">
        <header className="whq-topbar">
          <div>
            {companies.length > 0 && (
              <label className="whq-company-pill">
                <span className="whq-company-pill-label">{th.nav.companyScope}</span>
                <span aria-hidden>🏢</span>
                <select
                  value={displayCompanyId}
                  onChange={(e) => selectCompany(e.target.value)}
                  aria-label={th.nav.company}
                >
                  <option value="">{th.nav.selectCompany}</option>
                  {companies.length > 1 ? (
                    <option value={ALL_COMPANIES_ID}>{th.nav.allCompanies} ({companies.length})</option>
                  ) : null}
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="whq-user-row">
            <WorkHQAvatar initials={initial} variant="peach" size="sm" />
            <div>
              <div className="whq-user-name">คุณ{displayName}</div>
              <div className="whq-user-role">{userRoleLabel(user?.roles ?? [])}</div>
            </div>
          </div>
        </header>
        <main className="whq-page-content">
          {needsCompanyPick && (
            <WorkHQAlert
              tone="warning"
              autoDismissMs={0}
              message="เลือกบริษัทจากแถบด้านบนก่อน — ถ้าเป็นผู้ดูแลทุกบริษัท ให้เลือก “ทุกบริษัท”"
            />
          )}
          {navIsEmpty && (
            <WorkHQAlert
              tone="warning"
              autoDismissMs={0}
              message="บัญชีนี้ยังไม่มีสิทธิ์เมนู — ให้ผู้ดูแลระบบเปิดหน้าผู้ใช้หลังบ้าน → กด “สิทธิ์” แล้วบันทึกชุดสิทธิ์ให้ครบ"
            />
          )}
          <Outlet />
        </main>
        <GlobalQuickCreate />
        <CommandPalette companyId={companyId || undefined} />
      </div>
    </div>
  );
}
