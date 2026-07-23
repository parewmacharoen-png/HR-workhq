-- Hardening sprint: document versioning, announcement reminders

ALTER TABLE "employee"."employee_documents"
  ADD COLUMN IF NOT EXISTS "current_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "employee"."employee_document_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "mime_type" VARCHAR(120),
  "size_bytes" INTEGER,
  "checksum" VARCHAR(128),
  "notes" VARCHAR(500),
  "uploaded_by" UUID,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "employee_document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_document_versions_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "employee"."employee_documents"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_document_versions_document_id_version_number_key"
  ON "employee"."employee_document_versions"("document_id", "version_number");
CREATE INDEX IF NOT EXISTS "employee_document_versions_document_id_idx"
  ON "employee"."employee_document_versions"("document_id");

ALTER TABLE "telegram"."announcements"
  ADD COLUMN IF NOT EXISTS "must_acknowledge" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "telegram"."announcement_deliveries"
  ADD COLUMN IF NOT EXISTS "opened_reminder_sent_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ack_reminder_sent_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "acknowledged_from_reminder" BOOLEAN NOT NULL DEFAULT false;
