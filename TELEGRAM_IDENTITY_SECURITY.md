# Telegram Identity & Access Security (HR-11.5)

Production Telegram self-service requires verified employee identity binding. Unknown Telegram users cannot access HR data.

## Models

### `telegram.telegram_identities`

Permanent Telegram ↔ Employee link.

| Field | Description |
|-------|-------------|
| `employeeId` | Linked employee master record |
| `telegramUserId` | Telegram user ID |
| `status` | `ACTIVE`, `PENDING`, `REVOKED` |
| `linkedAt`, `lastSeenAt` | Link and activity timestamps |

Constraints (partial unique indexes):

- One `ACTIVE` identity per employee
- One `ACTIVE` identity per Telegram user

### `telegram.registration_requests`

Audit log of onboarding attempts awaiting HR review when auto-match fails.

### `employee.employees.inviteCode`

Optional invite code (e.g. `EMP-KW-1234`) for alternate verification path.

## Access states

| State | Telegram access |
|-------|-----------------|
| **Unverified** | Register / verify only (`/start`, identity FSM) |
| **Pending** | Registration status only (`/status`) |
| **Active** | Full self-service per permissions |
| **Revoked** | Denied — contact HR message |

Blocked when: employee inactive/terminated, identity revoked, registration pending, employee deleted.

## Verification flows

### Employee code + phone (primary)

1. `/start` → enter `globalId` (e.g. `EMP000001`)
2. Enter registered mobile phone
3. **Match** → auto-approve, `TelegramIdentity` = `ACTIVE`
4. **Mismatch** → `RegistrationRequest` = `PENDING`, no HR access

### Invite code + phone (optional)

1. Tap **Use Invite Code** → enter `inviteCode`
2. Enter phone → same match rules as above

## HR admin

### Employee detail → Identity tab

`GET /api/v1/employees/:id/telegram-identity`

Actions (`security:write`):

- `POST .../telegram-identity/reset` — revoke old binding; employee re-verifies
- `POST .../telegram-identity/revoke`
- `POST .../telegram-identity/reactivate`

### Web

- `/security/registrations` — approve/reject pending requests
- `/security/telegram-identities` — search/filter identities

## Security guard

`TelegramIdentityGuard` centralizes access checks in:

- `TelegramBotService.dispatchVerifiedUser` — blocks HR menus when not active
- `ToolExecutor` — blocks `get_my_*` tools on Telegram channel when identity ≠ active

## Permissions

| Key | Default roles |
|-----|---------------|
| `security:read` | Owner, HR (via role seed) |
| `security:write` | Owner, HR |

## Audit events

Logged via `AuditService`:

- `registration_requested`, `registration_auto_approved`
- `registration_approved`, `registration_rejected`
- `identity_linked`, `identity_revoked`, `identity_reset`, `identity_reactivated`

## Migration notes

- Existing linked Telegram accounts backfilled to `ACTIVE` identities on migration
- Self-registration that **created new employees** replaced by **verify existing employee** flow
- Legacy `TelegramOnboardingService` retained for commission declaration correction only

## API

- `GET /api/v1/security/registrations?status=PENDING`
- `POST /api/v1/security/registrations/:id/approve`
- `POST /api/v1/security/registrations/:id/reject`
- `GET /api/v1/security/telegram-identities?status=&search=`
