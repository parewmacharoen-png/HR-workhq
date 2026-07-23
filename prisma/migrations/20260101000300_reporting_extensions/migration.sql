-- ============================================================================
-- WorkHQ - Reporting module extensions
-- Adds three new snapshot_type enum values required by the new dashboards:
--   * owner           — Owner dashboard (cross-company aggregate)
--   * company         — Per-company company dashboard
--   * pending_approval — Pending approvals snapshot
--
-- PostgreSQL ALTER TYPE ... ADD VALUE is transactional in PG 12+ but cannot
-- be rolled back within the same transaction. It is therefore run outside an
-- explicit transaction here (Prisma's migrate engine handles the connection).
-- Apply AFTER 20260101000200_finance_extensions.
-- ============================================================================

ALTER TYPE reporting.snapshot_type ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE reporting.snapshot_type ADD VALUE IF NOT EXISTS 'company';
ALTER TYPE reporting.snapshot_type ADD VALUE IF NOT EXISTS 'pending_approval';
