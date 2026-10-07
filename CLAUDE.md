# WorkHQ (HR-workhq)

ระบบ HR สำหรับเครือบริษัท 5 แห่ง (SB, MB, KW, VB, HH) พนักงานประมาณ 80 คน

## การสื่อสาร
- ตอบผู้ใช้เป็น **ภาษาไทย** เสมอ
- ผู้ใช้ไม่ใช่นักพัฒนา: อธิบายเป็นภาษาง่าย บอกขั้นตอนทีละข้อ บอกตรง ๆ ว่าอะไรทดสอบแล้ว/ยังไม่ได้ทดสอบ
- ห้ามให้ผู้ใช้วางค่าลับ (DATABASE_URL, token, รหัสผ่าน) ในแชท ให้ใส่ในไฟล์ `.env` แทน

## โครงสร้าง
- `backend/` — NestJS + Prisma (PostgreSQL + pgvector), Redis, บอท Telegram
- `web/` — React + Vite (vitest), design tokens ใน `web/src/design-system/workhq.css`
- `prisma/` — schema, migrations, `seed.ts` (สร้างบริษัท 5 แห่ง, สิทธิ์, ประเภทลา, บัญชี owner/admin, พนักงาน Placeholder)
- เอกสารออกแบบ/audit จำนวนมากอยู่ที่ root (`WORKHQ_*.md`, `POL-*.md`), คู่มือย้าย VPS: `DEPLOY_VPS.md`

## Production ตอนนี้
| ส่วน | ที่อยู่ |
|---|---|
| เว็บ | https://workhq-web.onrender.com (Render) |
| API + บอท Telegram | https://workhq-api.onrender.com (Render แพ็กเกจฟรี, หลับเมื่อไม่มีคนใช้ 15 นาที) |
| ฐานข้อมูล | Neon (สิงคโปร์) |
| โค้ด | GitHub `parewmacharoen-png` — push ขึ้น `main` แล้ว Render deploy อัตโนมัติ |
| Uptime | UptimeRobot เรียก `/api/v1/health/live` ทุก 5 นาที (endpoint นี้ไม่แตะ DB เพื่อไม่กินโควต้า Neon) |

- `DIRECT_URL` ต้องเป็น host ของ Neon **ที่ไม่มี `-pooler`** ใช้สำหรับ `prisma migrate deploy` ถ้าชี้ไป pooler จะเกิด advisory lock ค้างแล้ว deploy ล้ม
- เอกสารที่อัปโหลดบน Render เก็บในดิสก์ชั่วคราว (`/tmp/workhq/documents`) **หายได้** — ห้ามอัปโหลดเอกสารจริงของพนักงานจนกว่าจะย้าย VPS

## กฎของโดเมนที่ตัดสินใจแล้ว
- **พนักงาน 1 คน = 1 record** ผูกได้หลายบริษัท ห้ามสร้างคนเดียวซ้ำในแต่ละบริษัท
- หน้า "ทุกบริษัท" แสดงการ์ดเดียวต่อคน พร้อมป้ายบริษัท (บริษัทหลักสีเขียวขึ้นก่อน) ผู้ดูที่มีสิทธิ์บางบริษัทเห็นเฉพาะป้ายที่มีสิทธิ์
- **หลายทีม:** 1 คนอยู่ได้หลายทีมทั้งในบริษัทเดียวกันและข้ามบริษัท (ตาราง `employee_assignments`) ห้ามทีมซ้ำ
  - แต่ละบริษัทมี **ทีมหลัก 1 ทีม** — การอนุมัติ, แจ้งเตือนหัวหน้า, export ใช้ทีมหลักเสมอ (ดู `backend/src/modules/employee/domain/services/company-teams.util.ts`)
  - payroll คิดตามบริษัท ไม่ใช่ทีม
  - สิทธิ์ sub-leader ครอบคลุมเฉพาะทีมหลัก
  - หน้าลิงก์เชิญ (InvitationCodePage) ยังเลือกได้ 1 ทีมต่อบริษัท
- ปิดใช้งานพนักงานให้ใช้สถานะ **"พักงาน"** ไม่ใช่ "ลาออกแล้ว" (จะไปเริ่ม flow ลาออก/ชดเชย) และห้ามกด "ลบพนักงาน" (ลบถาวร)

## การพัฒนาและทดสอบ
- Typecheck web: `cd web && npx tsc -b` (ไฟล์ `web/tsconfig.tsbuildinfo` ไม่ต้อง commit)
- เทสต์ backend ทั้งชุดใช้ RAM มาก (เคยกิน ~42 GB จนเครื่องค้าง) — รันเฉพาะไฟล์ที่เกี่ยวข้อง:
  `NODE_OPTIONS=--max-old-space-size=8192 npx jest --selectProjects unit --runInBand <pattern>`
- เทสต์ backend เก่าพังอยู่ก่อนแล้ว ~20 ไฟล์ (payroll, commission, `employee.service.access`, `onboarding-reconcile.util`, `employee-onboarding-approval`) — ไม่ใช่ผลจากงานใหม่ ถ้าเจอให้เช็คว่าพังก่อนแก้หรือไม่
- Docker บนเครื่องนี้: ต้องใช้ `-p workhq-full` เพื่อใช้ volume ฐานข้อมูลเดิม
  `docker compose -p workhq-full up -d --build` → http://localhost:8080
  (สำเนาเก่าที่ `C:\Users\Admin\Downloads\workhq-full` เลิกใช้แล้ว)
- `.env` บนเครื่องใช้ Telegram bot token จริง — ระวังแย่งข้อความกับ production ควรใช้บอทแยกสำหรับทดสอบ
- ไฟล์ `.sh` ต้องเป็น LF (ตั้งใน `.gitattributes` แล้ว)
