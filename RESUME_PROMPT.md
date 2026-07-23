# วาง prompt นี้ใน Cursor chat ใหม่ (เครื่องใหม่)

Copy ทั้งบล็อกด้านล่างไปวางใน Agent chat:

---

```
# CONTINUATION — WorkHQ HOTFIX (ย้ายเครื่องมาทำต่อ)

อ่านไฟล์เหล่านี้ก่อน:
- HANDOFF_MACHINE_MIGRATION.md (สถานะงาน + setup)
- UAT_FINDINGS.md (ถ้ามี)

## งานที่ค้าง (blocking hotfix)

### A. Telegram registration → Web Requests (draft → in_review)
ปัญหา: Telegram บอก "ส่งให้ HR ตรวจสอบ" แต่ Web Requests เป็น draft / Approval Center ว่าง

ทำไปแล้วบางส่วน — ตรวจและทำให้จบ:
1. `createAndSubmitSystemRequest()` ใน request-instance.service.ts — ต้องสร้าง status `in_review` ไม่ใช่ draft
2. `TelegramRegistrationRequestBridgeService` — wire จาก telegram-identity + self-onboarding
3. Request type seed: `telegram_registration_review`
4. Integration approve/reject → link Telegram + notify
5. Migration: requestInstanceId บน registration_requests + self_onboarding_submissions
6. Repair script: backend/scripts/repair-telegram-registration-draft-requests.ts

Success: auto-confirm fail → Requests แสดง in_review → Approval Center เห็น → dashboard count ขึ้น

### B. Employee Detail / status consistency
- Badge ไม่แสดง "เชื่อมแล้ว" จนกว่า HR approve
- แสดง "รอ HR ตรวจสอบ" เมื่อ pending
- `/status` อ่าน source เดียวกับ Web

### C. Compact summary cards (~110–140px desktop)

## Tests ที่ต้องผ่าน
- telegram-registration-request-bridge.service.unit.spec.ts
- Telegram pending → in_review not draft
- Approval Center lists request
- Employee Detail badge pending until approved

## หลังแก้เสร็จ
Return completion report: root cause, files changed, status mapping, repair command, test results, gaps.

อย่าเพิ่ม feature ใหม่ อย่าทำ Employee 360 tabs — hotfix only.
```

---
