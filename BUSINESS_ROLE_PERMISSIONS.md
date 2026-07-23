# Business Role Permissions (HR-12)

WorkHQ HR uses **business roles** as the primary access model. Generic permission keys remain the internal engine, but admins assign business roles, scopes, and overrides — not free-form permission grids.

## Resolution order

Effective access resolves in this order:

1. **Business role bundle** — fixed permission set for the assigned role
2. **Scope grants** — `all`, `company`, `team`, or `self`
3. **User overrides** — explicit `allow` / `deny` on permission keys (audited)

## Business roles

| Code | Also known as | Default scope | Summary |
|------|---------------|---------------|---------|
| `owner` | — | all | Full HR access, all companies |
| `secretary` | HR Manager, Payroll Operator | all | Broad read all companies; limited safe writes |
| `big_leader` | — | company | Company leadership |
| `sub_leader` | — | team | Team leadership |
| `admin_manager` | — | company | Company HR operations |
| `admin` | — | company | Company admin read/write |
| `employee` | — | self | Self-service only |

**Secretary, HR Manager, and payroll operator are the same business role** (`secretary`). Assign `secretary` for any of these job titles.

These are **not** the same as `EmployeeAssignment.roleLevel` (`employee`, `sub_leader`, `big_leader`) unless explicitly mapped by HR admin.

## Salary visibility matrix (FINAL)

**Deny-by-default:** viewing another employee's salary is denied unless the viewer's business role explicitly allows it in the matrix below, or a listed override role has `UserPermissionOverride`.

Any role **not** listed in this matrix (including users with no business role, e.g. legacy `super_admin` only) defaults to **self only** for salary. Other employees' salary requires `UserPermissionOverride` (`salary:read` or `payroll:read`, `allow`).

| Viewer role | Can view other employees' salary |
|-------------|--------------------------------|
| Owner | All employees, all companies |
| Secretary / HR Manager / Payroll Operator | All employees, all companies |
| Big Leader | All employees in viewer's scoped company/companies |
| Sub Leader | Denied (own salary only; no override path) |
| Admin Manager | Denied unless UserPermissionOverride |
| Admin | Denied unless UserPermissionOverride |
| Employee | Denied (own salary only; no override path) |
| *Any other / unlisted role* | Denied unless UserPermissionOverride |

Own salary is **always** visible to the linked employee regardless of role.

### Override rule (Admin / Admin Manager only)

Admin Manager and Admin **do not** see other employees' salary by default.

If they need payroll access later, owner assigns an explicit **UserPermissionOverride** only:

- `salary:read` and/or `payroll:read` with `effect: allow`

No other role uses overrides for salary visibility except admin and admin_manager.

### Enforcement

`SalaryVisibilityPolicy` is applied to:

- Payroll APIs (payslip fetch, salary item amounts)
- `GET /employees/:id/salary-history`
- Telegram payslip and payroll summary flows (self-service remains self-only)
- AI tools: `get_latest_payslip`, `get_my_latest_payslip`, `get_my_payroll_summary`, `get_payroll_summary`

Denied access returns **403** on detail endpoints or an error message in Telegram/AI channels.

Notes:

- Big leader salary scope is **company-level**, not team-level.
- Deny overrides remove permissions from the effective set even if the role bundle includes them.

## Onboarding invite permissions (P0-001c)

Configurable keys under category **Employee Onboarding**:

| Key | Thai label | Default Owner/Secretary | Default Big Leader | Default others |
|-----|------------|-------------------------|--------------------|----------------|
| `employee:onboarding:invite:view` | ดูลิงก์เชิญพนักงาน | allow | allow | deny |
| `employee:onboarding:invite:create` | สร้างลิงก์เชิญพนักงาน | allow | allow | deny |
| `employee:onboarding:invite:manage` | จัดการลิงก์เชิญพนักงาน | allow | allow | deny |
| `employee:onboarding:invite:cancel` | ยกเลิกลิงก์เชิญ | allow | **deny** | deny |
| `employee:onboarding:invite:regenerate` | สร้างลิงก์ใหม่ | allow | allow | deny |
| `employee:onboarding:invite:link-existing` | เชื่อม Telegram ให้พนักงานเดิม | allow | allow | deny |
| `employee:onboarding:invite:new-employee` | เชิญพนักงานใหม่ | allow | allow | deny |

**Scope:** Owner/Secretary = all companies. Big Leader = scoped company (and team when `teamId` on invite). Sub Leader/Admin = deny by default; grant via business role bundle edit or **UserPermissionOverride** (`allow`) with scope still enforced.

**Create rules:** new employee invite requires `create` + `new-employee`; link existing requires `create` + `link-existing`.

Overrides for invite keys are allowed via Settings → User Access (same as salary overrides).

## Override rules (general)

- Only users with `permission:write` (typically owner) may assign roles, scopes, and overrides.
- Every change writes to `permission.permission_audits`.

## Examples

**Admin works KW, MB, VB**

- Business role: `admin`
- Scopes: three `company` grants (KW, MB, VB)
- Effective: employee/attendance/referral read within those companies; **own payslip only** unless owner adds override.

**Big leader SB**

- Business role: `big_leader`
- Scope: `company` = SB
- Can view salaries for all SB employees; cannot view MB employees.

**Owner grants payroll access to admin manager**

```
POST /api/v1/permissions/users/:userId/overrides
{ "permission": "salary:read", "effect": "allow", "reason": "Payroll duty" }
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/permissions/business-roles` | Role templates (read-only bundles) |
| GET | `/api/v1/permissions/users/:userId/access` | User access snapshot |
| PUT | `/api/v1/permissions/users/:userId/business-role` | Assign business role |
| PUT | `/api/v1/permissions/users/:userId/scopes` | Replace scope grants |
| POST | `/api/v1/permissions/users/:userId/overrides` | Add override |
| DELETE | `/api/v1/permissions/users/:userId/overrides/:overrideId` | Remove override |
| GET | `/api/v1/permissions/users/:userId/audit` | Permission audit log |
| GET | `/api/v1/permissions/me/effective` | Current user's effective access |
| GET | `/api/v1/permissions/salary-visibility/preview` | Salary visibility preview |
| GET | `/api/v1/employees/:id/salary-history` | Employee salary bands (policy-guarded) |

## Web UI

`/settings/permissions` — role templates, user access editor, salary visibility preview.

## Key files

- `backend/src/modules/permission/domain/entities/salary-visibility-matrix.ts` — FINAL matrix
- `backend/src/modules/permission/domain/services/salary-visibility.policy.ts`
- `backend/src/modules/permission/application/business-permission.service.ts`
- `backend/prisma/seed.ts` — seeds seven business roles and bundles
