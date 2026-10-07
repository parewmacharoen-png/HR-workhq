# ติดตั้ง WorkHQ บน VPS (Hostinger + AWS S3)

ภาพรวม: เซิร์ฟเวอร์ 1 เครื่องรันทุกอย่าง (เว็บ, API, Postgres, Redis, บอท Telegram)
โดยมี **Caddy** เป็นประตูเดียวที่เปิดออกอินเทอร์เน็ต (HTTPS อัตโนมัติ)
ไฟล์เอกสาร (บัตรประชาชน, สัญญา ฯลฯ) และ backup ที่เข้ารหัสแล้วเก็บใน **AWS S3 สิงคโปร์**

```
พนักงาน ──HTTPS──► Caddy ─► web (React)
                       └──► api (NestJS) ─► Postgres, Redis  (ภายในเครื่องเท่านั้น)
                                         └► S3: documents/   (private, เข้ารหัส)
backup ทุกคืน 02:00 ─► เข้ารหัส AES-256 ─► S3: backups/daily|monthly|yearly
```

---

## 1. AWS S3 (ทำบนเว็บ AWS Console ~20 นาที)

1. สมัคร AWS แล้ว **เปิด MFA ให้ root account ทันที** (IAM → Security credentials)
2. S3 → **Create bucket**
   - ชื่อ: เช่น `companyname-workhq-prod` (ห้ามซ้ำกับใครในโลก)
   - Region: **Asia Pacific (Singapore) ap-southeast-1**
   - **Block all public access: เปิดไว้ (ค่าเริ่มต้น)** ห้ามปิด
   - **Bucket Versioning: Enable** (กันไฟล์โดนลบ/เขียนทับ)
   - Default encryption: SSE-S3 (ค่าเริ่มต้น)
3. Bucket → Management → **Lifecycle rules** ตั้งตาม `docs/s3-lifecycle.json`
   (หรือให้ผมรันคำสั่ง `aws s3api put-bucket-lifecycle-configuration` ให้)
   - backup รายวันเก็บ 30 วัน / รายเดือน 400 วัน / รายปี 7 ปี
4. IAM → Users → **Create user** ชื่อ `workhq-server` (ไม่ต้องให้เข้า Console)
   - Permissions → Create inline policy → JSON → วาง `docs/s3-iam-policy.json`
     แล้วแก้ `REPLACE_WITH_BUCKET_NAME` เป็นชื่อ bucket
   - Security credentials → **Create access key** → เก็บ Access key + Secret ไว้ใส่ `.env`

> key นี้ทำได้แค่ อ่าน/เขียนไฟล์ใน `documents/` กับ `backups/` ของ bucket นี้เท่านั้น
> ลบถาวรไม่ได้ (เพราะเปิด versioning) — ถ้า key หลุด ข้อมูลเก่ายังกู้คืนได้

## 2. Hostinger VPS

- แพ็กเกจ **KVM 2** (2 vCPU / 8GB), Datacenter ที่ใกล้ไทยที่สุดที่มีให้เลือก
- OS: **Ubuntu 24.04** (แบบเปล่าก็ได้ สคริปต์ติดตั้ง Docker ให้)
- ตอนสร้าง: **ใส่ SSH public key ของคุณ** (ไม่ใช้รหัสผ่าน)
- เปิด **Automatic backups/snapshots** ของ Hostinger ด้วย (ชั้นที่ 2)

## 3. โดเมน

ตั้ง DNS **A record**: `hr.บริษัท.com → IP ของ VPS` (รอ DNS อัปเดต 5–30 นาที)

## 4. ตั้งค่าเครื่อง (รันครั้งเดียว)

```bash
ssh root@<IP>
curl -fsSL https://raw.githubusercontent.com/parewmacharoen-png/HR-workhq/main/scripts/vps/setup-server.sh -o setup-server.sh
DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-deploy" bash setup-server.sh
```

สคริปต์จะ: อัปเดตความปลอดภัยอัตโนมัติ, ติดตั้ง Docker, เปิด firewall เฉพาะ 22/80/443,
ปิดล็อกอินด้วยรหัสผ่าน, ติดตั้ง fail2ban, สร้าง user `deploy`, clone โค้ดไว้ที่ `/srv/workhq`

จากนั้นกรอกค่าลับ:

```bash
nano /srv/workhq/.env        # ดูคำอธิบายแต่ละค่าในไฟล์
```

สร้างรหัสสุ่มด้วย `openssl rand -hex 32` — **เก็บสำเนา `.env` ไว้ในที่ปลอดภัยนอกเครื่อง**
(โดยเฉพาะ `BACKUP_ENCRYPTION_PASSPHRASE` — ถ้าหาย backup ทั้งหมดจะเปิดไม่ได้)

## 5. ย้ายข้อมูลจาก Neon (ทำพร้อมผม)

ลำดับสำคัญ: ปิดรับข้อมูลชั่วคราว → dump จาก Neon → restore → เปิดระบบใหม่

```bash
cd /srv/workhq
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C build
$C up -d postgres redis
# dump จาก Neon (ใช้ pg_dump เวอร์ชันเดียวกับ Neon — เช็คก่อนด้วย SELECT version())
# restore ด้วย workhq-restore.sh ในคอนเทนเนอร์ backup-cron
$C run --rm migrate          # apply migration ที่ใหม่กว่า (ถ้ามี)
$C up -d                     # เปิดทั้งระบบ — API จะตั้ง Telegram webhook มาที่โดเมนใหม่เอง
```

ทดสอบ: เปิด `https://hr.บริษัท.com`, ล็อกอิน, อัปโหลดเอกสารทดสอบ, กดเปิดดู, ลอง `/status` ในบอท

## 6. Deploy อัตโนมัติจาก GitHub

GitHub repo → Settings → Secrets and variables → Actions

| ชนิด | ชื่อ | ค่า |
|---|---|---|
| Variable | `DEPLOY_ENABLED` | `true` |
| Variable | `WORKHQ_DOMAIN` | `hr.บริษัท.com` |
| Secret | `DEPLOY_HOST` | IP ของ VPS |
| Secret | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | private key คู่กับ `DEPLOY_PUBKEY` |
| Secret | `DEPLOY_DIR` | `/srv/workhq` |

หลังจากนี้ push ขึ้น `main` → เครื่อง build + migrate + restart + ตรวจสุขภาพให้เอง

## 7. เฝ้าระบบ

- **UptimeRobot** (ฟรี): monitor `https://hr.บริษัท.com/api/v1/health/live` ทุก 5 นาที → แจ้งเตือนทาง email/LINE
- ดู log: `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api`
- ดู backup ล่าสุด: `ls -lh /srv/workhq/backups` และใน S3 `backups/daily/`

## 8. ซ้อมกู้ข้อมูล (ทุก 3 เดือน)

backup ที่ไม่เคยลองกู้ = ไม่มี backup

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C exec backup-cron bash -c 'aws s3 ls s3://$BACKUP_S3_BUCKET/backups/daily/ | tail -3'
# ดาวน์โหลดไฟล์ล่าสุด แล้ว restore เข้า database ทดสอบ (ไม่ใช่ตัวจริง):
$C exec backup-cron workhq-restore.sh /backups/<ไฟล์>.dump.enc postgresql://workhq:<pw>@postgres:5432/restore_test
```

## ถ้าเกิดเหตุ

| อาการ | ทำอะไร |
|---|---|
| เว็บเข้าไม่ได้ | `$C ps` ดูว่าตัวไหนล่ม → `$C up -d` |
| VPS พังทั้งเครื่อง | สร้าง VPS ใหม่ → ทำข้อ 4 → restore backup ล่าสุดจาก S3 → ไฟล์เอกสารอยู่ใน S3 อยู่แล้ว |
| ไฟล์โดนลบ/เขียนทับ | S3 Console → bucket → Show versions → กู้เวอร์ชันก่อนหน้า |
| key AWS หลุด | IAM → ปิด access key เดิม สร้างใหม่ ใส่ `.env` แล้ว `$C up -d` |
