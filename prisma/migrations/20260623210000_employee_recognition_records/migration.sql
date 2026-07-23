-- HR-013c — EmployeeRecognition records replace gift columns on employees

CREATE TYPE "employee"."employee_recognition_type" AS ENUM (
  'BIRTHDAY_GIFT',
  'WORK_ANNIVERSARY_GIFT',
  'EMPLOYEE_OF_MONTH',
  'SPECIAL_REWARD'
);

CREATE TABLE "employee"."employee_recognitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "recognition_type" "employee"."employee_recognition_type" NOT NULL,
  "recognition_date" DATE NOT NULL,
  "notes" TEXT,
  "recorded_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  "deleted_by" UUID,
  CONSTRAINT "employee_recognitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_recognitions_employee_id_recognition_date_idx"
  ON "employee"."employee_recognitions" ("employee_id", "recognition_date");
CREATE INDEX "employee_recognitions_company_id_recognition_type_recognition_date_idx"
  ON "employee"."employee_recognitions" ("company_id", "recognition_type", "recognition_date");

ALTER TABLE "employee"."employee_recognitions"
  ADD CONSTRAINT "employee_recognitions_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."employee_recognitions"
  ADD CONSTRAINT "employee_recognitions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill legacy gift columns into recognition records (if present)
INSERT INTO "employee"."employee_recognitions" (
  "employee_id",
  "company_id",
  "recognition_type",
  "recognition_date",
  "notes",
  "recorded_by"
)
SELECT
  e."id",
  ea."company_id",
  'BIRTHDAY_GIFT'::"employee"."employee_recognition_type",
  COALESCE(e."birthday_gift_date", CURRENT_DATE),
  'Migrated from legacy birthday_gift_given',
  COALESCE(e."updated_by", e."created_by", '00000000-0000-0000-0000-000000000000')
FROM "employee"."employees" e
JOIN LATERAL (
  SELECT ea2."company_id"
  FROM "employee"."employee_assignments" ea2
  WHERE ea2."employee_id" = e."id"
    AND ea2."deleted_at" IS NULL
    AND ea2."effective_to" IS NULL
  ORDER BY ea2."is_primary_company" DESC
  LIMIT 1
) ea ON TRUE
WHERE e."deleted_at" IS NULL
  AND e."birthday_gift_given" IS TRUE;

INSERT INTO "employee"."employee_recognitions" (
  "employee_id",
  "company_id",
  "recognition_type",
  "recognition_date",
  "notes",
  "recorded_by"
)
SELECT
  e."id",
  ea."company_id",
  'WORK_ANNIVERSARY_GIFT'::"employee"."employee_recognition_type",
  COALESCE(e."anniversary_gift_date", CURRENT_DATE),
  'Migrated from legacy anniversary_gift_given',
  COALESCE(e."updated_by", e."created_by", '00000000-0000-0000-0000-000000000000')
FROM "employee"."employees" e
JOIN LATERAL (
  SELECT ea2."company_id"
  FROM "employee"."employee_assignments" ea2
  WHERE ea2."employee_id" = e."id"
    AND ea2."deleted_at" IS NULL
    AND ea2."effective_to" IS NULL
  ORDER BY ea2."is_primary_company" DESC
  LIMIT 1
) ea ON TRUE
WHERE e."deleted_at" IS NULL
  AND e."anniversary_gift_given" IS TRUE;

ALTER TABLE "employee"."employees"
  DROP COLUMN IF EXISTS "birthday_gift_given",
  DROP COLUMN IF EXISTS "birthday_gift_date",
  DROP COLUMN IF EXISTS "anniversary_gift_given",
  DROP COLUMN IF EXISTS "anniversary_gift_date";
