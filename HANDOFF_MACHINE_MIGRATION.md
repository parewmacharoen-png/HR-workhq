# WorkHQ — ย้ายเครื่อง / ทำต่อบนคอมใหม่

> สร้างเมื่อ: 2026-06-26  
> โฟลเดอร์โปรเจกต์: `workhq-full`  
> **สำคัญ:** Cursor chat / agent **ไม่ย้ายตามเครื่อง** — ใช้ไฟล์นี้ + `RESUME_PROMPT.md` แทน

---

## 1. สิ่งที่ต้องย้าย (เลือกวิธีใดวิธีหนึ่ง)

### วิธี A — แนะนำ: คัดลอกโฟลเดอร์ทั้งก้อน

```bash
# บนเครื่องเก่า (Mac) — บีบอัดก่อนย้าย
cd /Users/chatphat/Downloads
tar -czf workhq-full-handoff.tar.gz workhq-full

# ย้าย workhq-full-handoff.tar.gz ไปเครื่องใหม่ (AirDrop / USB / Google Drive)
# บนเครื่องใหม่
mkdir -p ~/Projects && cd ~/Projects
tar -xzf /path/to/workhq-full-handoff.tar.gz
```

**ต้องมีในโฟลเดอร์ (อย่าลืม):**

| รายการ | ทำไม |
|--------|------|
| ทั้งโฟลเดอร์ `workhq-full/` | โค้ด + migration + docs |
| `backend/.env` | DB, JWT, Telegram token (ไม่ commit git) |
| `.env` (ถ้ามีที่ root) | docker-compose |
| `node_modules` | **ไม่จำเป็น** — ติดตั้งใหม่บนเครื่องใหม่ได้ |

### วิธี B — Git (ถ้าอยาก sync ระยะยาว)

โปรเจกต์ตอนนี้ **ยังไม่มี commit** — บนเครื่องเก่ารันครั้งเดียว:

```bash
cd /Users/chatphat/Downloads/workhq-full
git init
git add .
git commit -m "WorkHQ snapshot before machine migration"

# สร้าง repo บน GitHub แล้ว
git remote add origin git@github.com:YOUR_ORG/workhq-full.git
git branch -M main
git push -u origin main
```

**อย่า push:** `backend/.env`, `.env` ที่มี secret (มีใน `.gitignore` แล้ว)  
**ย้าย `.env` แยก:** AirDrop / 1Password / USB

---

## 2. ติดตั้งบนเครื่องใหม่ (ครั้งแรก)

### Prerequisites

- Node.js 20+ (`node -v`)
- Docker Desktop (ถ้าใช้ docker-compose)
- Cursor IDE

### ขั้นตอน

```bash
cd ~/Projects/workhq-full   # หรือ path ที่แตกไฟล์

# 1) ติดตั้ง dependencies
cd backend && npm install && cd ..
cd web && npm install && cd ..

# 2) ตรวจ .env
cp backend/.env.example backend/.env   # ถ้ายังไม่มี — แล้ว copy ค่าจากเครื่องเก่า
# หรือ copy ไฟล์ backend/.env จากเครื่องเก่ามาวางทับ

# 3) Database (Docker)
docker compose up -d postgres redis

# 4) Migration + Prisma client
npx prisma generate
npx prisma migrate deploy   # หรือ migrate dev ถ้า dev ล้วน

# 5) รัน backend
cd backend && npm run start:dev

# 6) รัน frontend (terminal ใหม่)
cd web && npm run dev
```

---

## 3. งานค้างอยู่ตรงไหน (อ่านก่อนเปิด Cursor)

### HOTFIX หลัก (ยังไม่เสร็จ / ยังไม่ merge UAT)

**ปัญหา UAT:**
- Telegram บอก "ส่งให้ HR ตรวจสอบ" แต่ Web → Requests ว่าง หรือ status = `draft`
- Approval Center ว่าง
- Employee Detail แสดง "เชื่อมแล้ว" ก่อน HR อนุมัติ
- Summary cards ใหญ่เกิน (250–300px)

**Root cause (draft fix ล่าสุด):**
- คำขอ Telegram ถูกสร้างเป็น `draft` แทน `in_review` → ไม่เข้า Approval Center
- Approval Center filter: `status = in_review` + มี approval step `pending`

**สิ่งที่ทำไปแล้ว (ใน working tree นี้):**

| ไฟล์ | สถานะ |
|------|--------|
| `backend/src/modules/request/application/request-instance.service.ts` | เพิ่ม `createAndSubmitSystemRequest()` + `submitDraftTelegramRegistration()` |
| `backend/src/modules/request/application/telegram-registration-request-bridge.service.ts` | **ใหม่** — bridge Telegram → Web Requests |
| `backend/src/modules/security/application/telegram-registration-integration.service.ts` | **ใหม่** — approve/reject → link Telegram |
| `backend/src/modules/request/application/request-seed.defaults.ts` | เพิ่ม type `telegram_registration_review` |
| `backend/src/modules/security/application/telegram-identity.service.ts` | wire bridge ตอน auto-confirm fail |
| `backend/src/modules/employee-onboarding/application/employee-self-onboarding.service.ts` | wire bridge ตอน submit |
| `backend/src/modules/request/request-integration.service.ts` | integrate approve/reject |
| `backend/src/modules/request/application/request-approval.service.ts` | reject → integration |
| `backend/scripts/repair-telegram-registration-draft-requests.ts` | **ใหม่** — repair draft เก่า |
| `prisma/schema.prisma` | `requestInstanceId` บน registration + self-onboarding |

**ยังต้องทำต่อ:**

- [ ] สร้าง migration SQL ถ้ายังไม่มีใน `prisma/migrations/` (schema มี field แล้ว — รัน `npx prisma migrate dev --name telegram_registration_request_bridge`)
- [ ] รัน unit test ให้ผ่าน: `npm test -- telegram-registration-request-bridge.service.unit.spec.ts`
- [ ] UAT: auto-confirm fail → Requests แสดง `in_review` → Approval Center เห็น
- [ ] HOTFIX Part B: backfill record เก่า — รัน repair script
- [ ] HOTFIX Part C: compact Employee Detail cards (CSS)
- [ ] Frontend: badge `รอ HR ตรวจสอบ` / ไม่แสดง `เชื่อมแล้ว` ก่อน approve
- [ ] อัปเดต docs: `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`, UAT checklist

**Status mapping ที่ใช้:**

```
draft          → Web สร้างมือเท่านั้น (ไม่ใช่ Telegram path)
submitted      → ส่งแล้ว แต่ไม่มี approval step
in_review      → รออนุมัติ (Approval Center + dashboard count) ← Telegram ต้องเป็นอันนี้
approved       → HR อนุมัติแล้ว → integration link Telegram
rejected       → ไม่ link
```

---

## 4. เปิด Cursor บนเครื่องใหม่ — ทำต่อยังไง

1. **Open Folder** → เลือก `workhq-full`
2. เปิดไฟล์ **`RESUME_PROMPT.md`** → copy ทั้งก้อน → paste ใน chat ใหม่
3. Agent จะอ่าน context จากไฟล์ใน repo ต่อ (ไม่มีประวัติ chat เก่า)

**อย่าพึ่งหวัง:**
- Chat history เดิม
- Todo list ใน session เก่า
- Branch metadata ใน Cursor (ตั้ง branch ใหม่ได้)

---

## 5. คำสั่งที่ใช้บ่อยหลังย้าย

```bash
# Repair draft Telegram requests (หลัง deploy hotfix)
cd backend
npx ts-node -r tsconfig-paths/register scripts/repair-telegram-registration-draft-requests.ts

# Dry run
npx ts-node -r tsconfig-paths/register scripts/repair-telegram-registration-draft-requests.ts --dry-run

# Tests
cd backend && npm test -- telegram-registration-request-bridge.service.unit.spec.ts
cd web && npm test -- --run src/api/employee-telegram-link.test.ts
```

---

## 6. Checklist ก่อนปิดเครื่องเก่า

- [ ] Copy / tar โฟลเดอร์ `workhq-full` ครบ
- [ ] Copy `backend/.env` (และ root `.env` ถ้ามี)
- [ ] (Optional) `git commit` + push ถ้าใช้ Git
- [ ] เก็บไฟล์นี้ + `RESUME_PROMPT.md` ไว้ในโฟลเดอร์
- [ ] จด path ใหม่บนเครื่องใหม่ (เช่น `~/Projects/workhq-full`)

---

## 7. ถ้ามีปัญหาบนเครื่องใหม่

| อาการ | แก้ |
|--------|-----|
| `DATABASE_URL` error | ตรวจ `backend/.env` + `docker compose ps` |
| Prisma field ไม่ตรง | `npx prisma generate && npx prisma migrate deploy` |
| Approval Center ว่าง | ตรวจ request status ใน DB ว่าเป็น `in_review` ไม่ใช่ `draft` |
| Telegram bot ไม่ตอบ | ตรวจ `TELEGRAM_BOT_TOKEN` ใน `.env` |
