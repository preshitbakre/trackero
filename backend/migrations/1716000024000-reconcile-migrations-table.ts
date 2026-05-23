import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T0.1 — Reconcile the `migrations` bookkeeping table.
 *
 * Before this point, the app ran with `synchronize: true` outside of
 * production. Synchronize keeps the schema in lockstep with the entity
 * decorators every boot but never touches the `migrations` table — so a
 * dev DB whose schema was provisioned by synchronize is missing
 * bookkeeping rows for every migration whose DDL synchronize had already
 * built. The repair shipped together with T0.1 disables synchronize
 * outside test (see `backend/src/config/database.config.ts`); once the
 * app starts running migrations, every migration whose effects synchronize
 * already created must have a bookkeeping row, otherwise TypeORM will
 * try to re-execute it and crash on the duplicate DDL.
 *
 * This migration inserts the bookkeeping rows for migrations 15-23
 * idempotently. `WHERE NOT EXISTS` makes it safe on both fresh DBs
 * (where every migration ran in sequence and the rows are already
 * present) and drifted DBs (where synchronize did the schema work and
 * the rows are missing).
 *
 * The `migrations` table has no unique constraint on `name` or
 * `timestamp`, so we cannot use `ON CONFLICT`. The per-row
 * `INSERT ... SELECT ... WHERE NOT EXISTS` pattern is the safest
 * idempotent shape.
 *
 * `down()` is intentionally empty: undoing a bookkeeping insert is not
 * meaningful. If you need to re-run migrations 15-23 from scratch you do
 * it against a fresh DB.
 */
export class ReconcileMigrationsTable1716000024000
  implements MigrationInterface
{
  name = 'ReconcileMigrationsTable1716000024000';

  // (timestamp, class-name) tuples for every migration whose schema may
  // have been produced by synchronize. Class names match the actual
  // exports in `backend/migrations/` — TypeORM identifies a recorded
  // migration by the class name written to `migrations.name`.
  private readonly entries: ReadonlyArray<{ ts: number; name: string }> = [
    { ts: 1716000015000, name: 'SprintOneActivePerProject1716000015000' },
    { ts: 1716000016000, name: 'SprintNumberUniquePerProject1716000016000' },
    { ts: 1716000017000, name: 'InvitationPendingEmailUnique1716000017000' },
    { ts: 1716000018000, name: 'NotificationDailyDedupUnique1716000018000' },
    { ts: 1716000019000, name: 'WorkItemSearchVector1716000019000' },
    { ts: 1716000020000, name: 'StatusFixedWipEstimation1716000020000' },
    { ts: 1716000021000, name: 'FkRestrictOnUserDelete1716000021000' },
    { ts: 1716000022000, name: 'AssociationsCreatedByFk1716000022000' },
    { ts: 1716000023000, name: 'AlignColumnLengths1716000023000' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { ts, name } of this.entries) {
      await queryRunner.query(
        `INSERT INTO migrations (timestamp, name)
         SELECT $1::bigint, $2::varchar
         WHERE NOT EXISTS (
           SELECT 1 FROM migrations WHERE name = $2
         )`,
        [ts, name],
      );
    }
  }

  public async down(): Promise<void> {
    // No-op: bookkeeping inserts are not meant to be reversed. Removing
    // these rows would tell TypeORM to re-run migrations whose DDL is
    // already in place, which would fail on the duplicate objects.
  }
}
