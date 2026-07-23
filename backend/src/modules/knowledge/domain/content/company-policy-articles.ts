// ============================================================================
// Official company policy KB articles — one article per major section.
// Used by seed and unit tests.
// ============================================================================

export type CompanyPolicyTag =
  | 'handbook'
  | 'commission'
  | 'marketing'
  | 'admin'
  | 'referral'
  | 'leave'
  | 'hr';

export interface CompanyPolicyArticle {
  slug: string;
  title: string;
  category: string;
  tags: CompanyPolicyTag[];
  body: string;
}

export const COMPANY_POLICY_ARTICLES: readonly CompanyPolicyArticle[] = [
  // ── Employee Handbook ─────────────────────────────────────────────────────
  {
    slug: 'handbook-welcome-culture',
    title: 'คู่มือพนักงาน — ยินดีต้อนรับและวัฒนธรรมองค์กร',
    category: 'handbook',
    tags: ['handbook', 'hr'],
    body: `## ยินดีต้อนรับสู่ WorkHQ

คู่มือพนักงานฉบับนี้เป็นแหล่งอ้างอิงอย่างเป็นทางการสำหรับนโยบายและแนวปฏิบัติของบริษัท
พนักงานทุกคนต้องศึกษาและปฏิบัติตามคู่มือนี้

### ค่านิยมหลัก
- ความซื่อสัตย์และความโปร่งใส
- การให้บริการที่เป็นเลิศ
- การทำงานเป็นทีมและเคารพซึ่งกันและกัน
- การพัฒนาตนเองอย่างต่อเนื่อง`,
  },
  {
    slug: 'handbook-attendance-punctuality',
    title: 'คู่มือพนักงาน — การเข้างานและความตรงต่อเวลา',
    category: 'handbook',
    tags: ['handbook', 'hr'],
    body: `## การเข้างานและความตรงต่อเวลา

พนักงานต้องลงเวลาเข้า-ออกงานผ่านระบบ WorkHQ ทุกวันทำการ
มาสายเกิน 15 นาทีโดยไม่แจ้งล่วงหน้าอาจถูกบันทึกเป็นความผิดทางวินัย
การขาดงานโดยไม่ได้รับอนุมัติถือเป็นการลาออกโดยมิชอบ

### การทำงานล่วงเวลา (OT)
OT วันทำงานปกติคิดอัตรา 1.5 เท่าของค่าแรงต่อชั่วโมงเมื่อทำงานเกิน 8 ชั่วโมง
OT วันหยุดประจำสัปดาห์คิดอัตรา 1.5 เท่า
OT วันหยุดนักขัตฤกษ์คิดอัตรา 2 เท่า
ต้องขออนุมัติจากหัวหน้างานก่อนเริ่ม OT ทุกครั้ง`,
  },
  {
    slug: 'handbook-code-of-conduct',
    title: 'คู่มือพนักงาน — จรรยาบรรณและวินัย',
    category: 'handbook',
    tags: ['handbook', 'hr'],
    body: `## จรรยาบรรณและวินัย

พนักงานต้องไม่เปิดเผยข้อมูลลับของบริษัทและลูกค้า
ห้ามใช้ทรัพย์สินของบริษัทเพื่อประโยชน์ส่วนตัว
ห้ามล่วงละเมิด คุกคาม หรือเลือกปฏิบัติต่อผู้อื่น

### การลงโทษทางวินี
การกระทำผิดอาจได้รับการตักเตือนด้วยวาจา ตักเตือนเป็นลายลักษณ์อักษร ลดเงินเดือน หรือเลิกจ้าง
ตามความรุนแรงของความผิดและประวัติการทำงาน`,
  },
  {
    slug: 'handbook-leave-benefits',
    title: 'คู่มือพนักงาน — สิทธิลาและสวัสดิการ',
    category: 'handbook',
    tags: ['handbook', 'hr', 'leave'],
    body: `## สิทธิลาและสวัสดิการ

### ลากิจส่วนตัว
พนักงานมีสิทธิลากิจส่วนตัว 3 วันต่อปี
ลากิจต้องขอล่วงหน้าอย่างน้อย 1 วันทำการ
หากลาเกิน 3 วันต้องได้รับอนุมัติจากหัวหน้างานและ HR

### เงินเดือนและสวัสดิการ
รอบเงินเดือน: วันที่ 25 ถึง 24 ของเดือนถัดไป
พนักงานสามารถตรวจสอบสลิปเงินเดือนและสวัสดิการผ่านเมนู Payroll ใน WorkHQ`,
  },
  {
    slug: 'handbook-grievance-process',
    title: 'คู่มือพนักงาน — การร้องเรียนและข้อพิพาท',
    category: 'handbook',
    tags: ['handbook', 'hr'],
    body: `## การร้องเรียนและข้อพิพาท

พนักงานสามารถยื่นข้อร้องเรียนผ่าน HR หรือหัวหน้างานโดยตรง
บริษัทจะรักษาความลับของผู้ร้องเรียนและดำเนินการสอบสวนภายใน 14 วันทำการ
หากไม่พอใจผลการพิจารณา สามารถอุทธรณ์ต่อ HR Director ได้ภายใน 7 วัน`,
  },

  // ── Marketing Commission Rule Book ────────────────────────────────────────
  {
    slug: 'marketing-commission-pool-structure',
    title: 'กฎคอมมิชชั่น Marketing — โครงสร้าง Pool (COM-MKT-001)',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## โครงสร้าง Pool คอมมิชชั่น Marketing

Marketing Commission ใช้ Team Pool อัตรา 10% ของ Net Profit (COM-MKT-001)
Net Profit หลังหัก Team Pool คือ Leader Base สำหรับคำนวณ Big Leader Bonus
Big Leader ได้รับ 5% ของ Leader Base (COM-MKT-012)

### สมาชิกใน Pool
เฉพาะสมาชิกทีม Marketing ที่ enroll ใน Team Pool เท่านั้นที่ได้รับส่วนแบ่ง
Big Leader ของบริษัทที่ไม่ enroll จะไม่เข้าร่วม Team Pool`,
  },
  {
    slug: 'marketing-commission-net-profit',
    title: 'กฎคอมมิชชั่น Marketing — สูตร Net Profit (COM-MKT-002)',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## สูตรคำนวณ Net Profit สำหรับ Marketing Commission

Net Profit = Gross Profit
  − ค่าใช้จ่ายเงินเดือนพนักงาน
  − ค่าใช้จ่าย Marketing
  − ค่าใช้จ่าย Line
  − ค่าใช้จ่าย Telesales
  − ค่าใช้จ่าย Promotion (เฉพาะเมื่อ Gross Profit > 500,000 บาท)
  − หัก Company Head 40% จากกำไรหลังหักค่าใช้จ่าย

Promotion Expense จะไม่ถูกหักหาก Gross Profit ไม่เกิน 500,000 บาท`,
  },
  {
    slug: 'marketing-commission-kpi-target',
    title: 'กฎคอมมิชชั่น Marketing — KPI 24 คน (COM-MKT-006)',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## KPI เป้าหมาย 24 Candidates

พนักงาน Marketing ต้องทำได้อย่างน้อย 24 candidates ต่อรอบเพื่อ qualified KPI (COM-MKT-006)
Big Leader ได้รับการยกเว้น KPI (kpiExempt) ตาม COM-MKT-007

### Carry Forward
หาก ramp ครบ 100% แต่ KPI ไม่ถึง 24 คน เงินส่วนแบ่งจะ carry forward ไปรอบถัดไป
หาก carry forward หมดอายุในรอบที่ KPI ไม่ถึง เงินจะถูก redistribute ให้สมาชิกที่ KPI qualified`,
  },
  {
    slug: 'marketing-commission-ramp-schedule',
    title: 'กฎคอมมิชชั่น Marketing — Ramp พนักงานใหม่ (COM-MKT-004)',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## ตาราง Ramp สำหรับพนักงาน Marketing ใหม่

| เดือนที่ทำงาน | สัดส่วน Pool |
|-------------|-------------|
| เดือนที่ 1 | 0% |
| เดือน 2–3 | 20% |
| เดือน 4 | 30% |
| เดือน 5 | 40% |
| เดือน 6 ขึ้นไป | 100% |

ส่วนต่าง Ramp ที่ยังไม่ครบ 100% จะ redistribute ให้สมาชิกที่ ramp ครบแล้ว (COM-MKT-005)
HR สามารถ override ramp เป็นเปอร์เซ็นต์พิเศษได้`,
  },
  {
    slug: 'marketing-commission-carry-forward',
    title: 'กฎคอมมิชชั่น Marketing — Carry Forward และ Payout',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## Carry Forward และการจ่าย Marketing Commission

เมื่อ KPI qualified และ ramp ครบ 100% จะได้รับ pool payout + carry forward ที่ค้าง
สถานะ carried_forward หมายถึงเงินถูก carry ไปรอบถัดไป
สถานะ pending_pay หมายถึงพร้อมจ่ายในรอบเงินเดือนถัดไป

รอบเงินเดือน: วันที่ 25 ถึง 24 ของเดือนถัดไป
Commission ที่ status hold จะไม่ถูกจ่ายจนกว่าจะได้รับการปลด hold จาก HR`,
  },
  {
    slug: 'marketing-commission-big-leader',
    title: 'กฎคอมมิชชั่น Marketing — Big Leader Bonus (COM-MKT-012)',
    category: 'commission',
    tags: ['commission', 'marketing'],
    body: `## Big Leader Commission

Big Leader ได้รับ 5% ของ Leader Base (Net Profit หลังหัก Team Pool 10%)
Big Leader Bonus แยกจาก Team Pool และไม่นับรวมใน base share ของสมาชิกทีม
Big Leader ได้รับการยกเว้น KPI 24 candidates`,
  },

  // ── Admin Commission Rule Book ────────────────────────────────────────────
  {
    slug: 'admin-commission-pool-overview',
    title: 'กฎคอมมิชชั่น Admin — ภาพรวม Pool 2% (COM-ADM-001)',
    category: 'commission',
    tags: ['commission', 'admin'],
    body: `## ภาพรวม Admin Commission Pool

Admin Commission Pool = 2% ของ Net Profit (COM-ADM-001)
แบ่งเป็น Pool A 1% และ Pool B 1% ของ Net Profit

### การแบ่ง Pool
Pool A (1%): แบ่งเท่าๆ กันในหมู่ Admin ทั้ง Front Office และ Back Office
Pool B (1%): แบ่งเท่าๆ กันเฉพาะ Front Office เท่านั้น`,
  },
  {
    slug: 'admin-commission-pool-a-b',
    title: 'กฎคอมมิชชั่น Admin — Pool A และ Pool B (COM-ADM-002)',
    category: 'commission',
    tags: ['commission', 'admin'],
    body: `## รายละเอียด Pool A และ Pool B

Pool A Share = Pool A ÷ จำนวน Admin ทั้ง Front และ Back Office
Pool B Share = Pool B ÷ จำนวน Front Office เท่านั้น

Back Office ได้รับเฉพาะ Pool A ไม่ได้รับ Pool B
Front Office ได้รับทั้ง Pool A และ Pool B

Base Pool Amount ของแต่ละคน = Pool A Share + Pool B Share (ถ้าเป็น Front Office)`,
  },
  {
    slug: 'admin-commission-leave-penalties',
    title: 'กฎคอมมิชชั่น Admin — หักลาเกิน (COM-ADM-009)',
    category: 'commission',
    tags: ['commission', 'admin', 'leave'],
    body: `## การหักคอมมิชชั่นเมื่อลาเกิน

Admin มีวันหยุดปกติ 4 วันต่อเดือน (COM-ADM-008)
Extra Leave Days = วันลาที่ใช้เกิน 4 วันในรอบ

### อัตราหักตาม Extra Leave Days
| ลาเกิน (วัน) | อัตราหัก |
|-------------|---------|
| 2 | 30% |
| 3 | 40% |
| 6 | 50% |
| 7 | 60% |
| 8 | 70% |
| 9 | 80% |
| 10+ | 100% |

ใช้อัตรา tier ที่ต่ำกว่าหรือเท่ากับ extra leave days (nearest lower tier)`,
  },
  {
    slug: 'admin-commission-shift-transfer',
    title: 'กฎคอมมิชชั่น Admin — โอน Shift และ Redistribution (COM-ADM-010)',
    category: 'commission',
    tags: ['commission', 'admin'],
    body: `## การโอน Shift และ Redistribution

Admin ที่ทำงานทั้งกะ Day และ Night ในรอบเดียวกัน จะคำนวณแยกตาม shift segment
เมื่อมีการหัก penalty ใน shift ใด shift หนึ่ง เงินที่ถูกหักจะ redistribute ให้สมาชิก shift เดียวกันที่ไม่ถูกหัก

การ redistribute แยกตาม shift: Day กับ Night ไม่ปนกัน`,
  },
  {
    slug: 'admin-commission-payout-rules',
    title: 'กฎคอมมิชชั่น Admin — สิทธิรับและการจ่าย (COM-ADM-011)',
    category: 'commission',
    tags: ['commission', 'admin'],
    body: `## สิทธิรับและการจ่าย Admin Commission

Admin ที่ลาออกก่อนวันจ่าย (resignedBeforePayout) จะไม่ได้รับคอมมิชชั่น
Base Pool จะถูก prorate ตาม daysWorkedInCycle ÷ cycleDays

สถานะ pending_pay = พร้อมจ่ายในรอบเงินเดือนถัดไป
รอบเงินเดือน: วันที่ 25 ถึง 24 ของเดือนถัดไป`,
  },

  // ── Referral Reward Policy ──────────────────────────────────────────────────
  {
    slug: 'referral-program-overview',
    title: 'นโยบาย Referral — ภาพรวมโปรแกรม',
    category: 'referral',
    tags: ['referral', 'commission'],
    body: `## โปรแกรม Referral Reward

พนักงานที่แนะนำเพื่อนมาทำงานจะได้รับ Referral Reward เมื่อผู้ถูกแนะนำ qualified
หนึ่งพนักงานถูกแนะนำได้เพียง 1 referral ต่อคน (partial unique index)
ห้ามแนะนำตนเอง (Self Referral)`,
  },
  {
    slug: 'referral-eligibility-conditions',
    title: 'นโยบาย Referral — เงื่อนไขการ Qualified',
    category: 'referral',
    tags: ['referral', 'hr'],
    body: `## เงื่อนไขการ Qualified Referral

ผู้ถูกแนะนำ qualified เมื่อผ่านเงื่อนไขใดเงื่อนไขหนึ่ง:
1. ผ่าน probation (employmentStatus = active และ probationEndDate ครบแล้ว) — condition: probation_pass
2. ทำงานครบ 3 เดือน (แม้ยังอยู่ probation) — condition: three_months

พนักงานที่ถูก terminate ไม่สามารถ qualified ได้`,
  },
  {
    slug: 'referral-reward-amount',
    title: 'นโยบาย Referral — จำนวนเงินรางวัล',
    category: 'referral',
    tags: ['referral', 'commission'],
    body: `## จำนวนเงิน Referral Reward

Referral Reward = 2,000 บาท ต่อ 1 referral ที่ qualified
จำนวนเงินถูกกำหนดตอนสร้าง referral และไม่เปลี่ยนแปลงหลัง qualified

สถานะ lifecycle: pending → qualified → paid | rejected`,
  },
  {
    slug: 'referral-duplicate-and-payment',
    title: 'นโยบาย Referral — Duplicate และการจ่ายเงิน',
    category: 'referral',
    tags: ['referral', 'commission', 'hr'],
    body: `## Duplicate Check และการจ่ายเงิน

ระบบตรวจสอบ duplicate ก่อน qualify อัตโนมัติ
HR/Owner สามารถ override duplicate block ได้ด้วย overrideDuplicateBlock=true

### การจ่ายเงิน
Referral ที่ qualified จะถูกจ่ายในรอบเงินเดือนถัดไปผ่าน Payroll
ต้อง mark paid หลังจากสร้าง payroll item แล้วเท่านั้น`,
  },

  // ── Leave Reschedule Policy ─────────────────────────────────────────────────
  {
    slug: 'leave-reschedule-policy',
    title: 'นโยบายเลื่อนวันลา — หลักการ',
    category: 'leave',
    tags: ['leave', 'hr'],
    body: `## การเลื่อนวันลา — หลักการ

พนักงานสามารถเลื่อนวันลาที่อนุมัติแล้วได้ 1 ครั้งต่อ 1 คำขอ
ต้องยื่นคำขอก่อนวันลาเดิมอย่างน้อย 7 วัน (ยกเว้นกรณีฉุกเฉิน is_emergency)
จำนวนวันลาหลังเลื่อนต้องเท่าเดิม (new_days = original_days)
วันลาใหม่ต้องอยู่หลังวันลาเดิม (new_start_date หลัง original_end_date)
เหตุผลต้องมีความยาวอย่างน้อย 10 ตัวอักษร`,
  },
  {
    slug: 'leave-reschedule-eligibility',
    title: 'นโยบายเลื่อนวันลา — สิทธิและข้อจำกัด',
    category: 'leave',
    tags: ['leave', 'hr'],
    body: `## สิทธิและข้อจำกัดการเลื่อนวันลา

เลื่อนได้เฉพาะ leave request ที่ได้รับอนุมัติแล้วเท่านั้น
ระบบบันทึก reschedule_count ต่อ leave request
สถานะคำขอเลื่อน: pending → approved | rejected

กรณีฉุกเฉิน (is_emergency=true) สามารถยื่นได้แม้ไม่ครบ 7 วันล่วงหน้า แต่ต้องได้รับอนุมัติจาก HR`,
  },
  {
    slug: 'leave-reschedule-procedure',
    title: 'นโยบายเลื่อนวันลา — ขั้นตอนการยื่นคำขอ',
    category: 'leave',
    tags: ['leave', 'hr'],
    body: `## ขั้นตอนการยื่นคำขอเลื่อนวันลา

1. เปิดคำขอ leave ที่อนุมัติแล้วใน WorkHQ
2. เลือกวันลาใหม่ (new_start_date และ new_end_date)
3. ระบุเหตุผลอย่างน้อย 10 ตัวอักษร
4. ส่ง workflow ให้หัวหน้างานและ HR อนุมัติ
5. เมื่อ approved ระบบอัปเดตวันลาเดิมเป็นวันใหม่โดยอัตโนมัติ`,
  },
] as const;

export const COMPANY_POLICY_SLUGS = COMPANY_POLICY_ARTICLES.map((a) => a.slug);

export const REQUIRED_POLICY_TAGS: CompanyPolicyTag[] = [
  'handbook',
  'commission',
  'marketing',
  'admin',
  'referral',
  'leave',
  'hr',
];
