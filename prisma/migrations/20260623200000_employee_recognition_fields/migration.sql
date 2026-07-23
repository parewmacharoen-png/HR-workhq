-- EMP-006 / EMP-007 — optional future gift tracking fields
ALTER TABLE "employee"."employees"
  ADD COLUMN IF NOT EXISTS "birthday_gift_given" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "birthday_gift_date" DATE,
  ADD COLUMN IF NOT EXISTS "anniversary_gift_given" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "anniversary_gift_date" DATE;
