-- Phase 0 — operator baseline seed.
--
-- Run this once against a dev/prod database that was built by
-- `synchronize: true` before the v1.1.0-fixforward release. It marks
-- migrations 14-23 as already applied so boot-time auto-migration
-- (migrationsRun: true) skips them and picks up 24+ cleanly.
--
-- The WHERE NOT EXISTS pattern is idempotent: re-running on a DB that
-- already has the rows is a no-op. Safe to apply more than once.
--
-- Usage:
--   psql -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USERNAME \
--        -d $DATABASE_NAME -f docs/operator/seed-migrations-baseline.sql

INSERT INTO migrations ("timestamp", name)
SELECT v.ts, v.name FROM (VALUES
  (1716000014000::bigint, 'AssociationsRedesign1716000014000'),
  (1716000015000::bigint, 'SprintOneActivePerProject1716000015000'),
  (1716000016000::bigint, 'SprintNumberUniquePerProject1716000016000'),
  (1716000017000::bigint, 'InvitationPendingEmailUnique1716000017000'),
  (1716000018000::bigint, 'NotificationDailyDedupUnique1716000018000'),
  (1716000019000::bigint, 'WorkItemSearchVector1716000019000'),
  (1716000020000::bigint, 'StatusFixedWipEstimation1716000020000'),
  (1716000021000::bigint, 'FkRestrictOnUserDelete1716000021000'),
  (1716000022000::bigint, 'AssociationsCreatedByFk1716000022000'),
  (1716000023000::bigint, 'AlignColumnLengths1716000023000')
) AS v(ts, name)
WHERE NOT EXISTS (SELECT 1 FROM migrations WHERE name = v.name);

-- If migration 029 (DropLegacyTables) refuses to run on the next boot
-- with "N rows survive", inspect the named table. For the audit-target
-- and observed dev DBs the only survivors were built-in seeds in
-- task_types (the Task/Bug defaults the old hierarchy seeded per
-- project); these are functionally inert and safe to clear:
--
--   TRUNCATE task_types RESTART IDENTITY CASCADE;
--
-- Don't blanket-truncate epics / tasks / task_dependencies /
-- task_labels / work_item_dependencies without inspecting first — the
-- consolidation in migration 12 migrated their data to work_items, so
-- empty tables are expected, but a non-empty one means something
-- unique is in there.

SELECT count(*) AS migration_rows FROM migrations;
