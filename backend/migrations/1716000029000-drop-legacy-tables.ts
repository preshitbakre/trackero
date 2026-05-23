import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.6 — Drop the six legacy tables superseded by work_items.
 *
 * Migrations 12 and 14 already drop these with IF EXISTS as part of the
 * hierarchy consolidation. On a drifted DB where synchronize may have
 * silently re-created them (an entity decorator the audit overlooked,
 * a long-stale repository hand-edit, etc.), this migration is the
 * belt-and-braces second pass: count rows first, raise if any data
 * survives so an operator can export, otherwise drop.
 *
 * The Phase 0 DECISIONS.md choice is "immediate drop" because the
 * audit confirmed every row had been migrated to the new schema. The
 * pre-flight count is a defence in depth: if the audit was wrong on
 * any one row, the migration refuses instead of losing data.
 *
 * down() is a no-op. Re-creating a dropped legacy table is not
 * something to automate — if a future feature needs it back, write a
 * new migration with the right shape.
 */
export class DropLegacyTables1716000029000 implements MigrationInterface {
  name = 'DropLegacyTables1716000029000';

  private readonly tables = [
    // Order matters for FK-safe drops: children before parents.
    'task_labels',
    'task_dependencies',
    'work_item_dependencies',
    'task_types',
    'tasks',
    'epics',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        DO $$
        DECLARE n bigint;
        BEGIN
          IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = '${table}') THEN
            EXECUTE format('SELECT count(*) FROM %I', '${table}') INTO n;
            IF n > 0 THEN
              RAISE EXCEPTION 'T0.6: refusing to drop legacy table %; % rows survive — export before re-running', '${table}', n;
            END IF;
            EXECUTE format('DROP TABLE %I CASCADE', '${table}');
            RAISE NOTICE 'T0.6: dropped legacy table %', '${table}';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // No-op: re-creating a dropped legacy table is out of scope.
    // If a downstream rollback genuinely needs them back, restore from
    // the pre-migration database backup instead.
  }
}
