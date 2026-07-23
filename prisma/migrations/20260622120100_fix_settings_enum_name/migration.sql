-- Rename legacy snake_case enum when HR-11A migration was applied before the naming fix.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'system'
      AND t.typname = 'setting_category'
  ) THEN
    ALTER TYPE "system"."setting_category" RENAME TO "SettingCategory";
  END IF;
END $$;
