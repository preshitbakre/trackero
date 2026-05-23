/**
 * T0.1 — migration bookkeeping reconciliation.
 *
 * The repo carries 25 numbered migration files (000…024). The bookkeeping
 * table on a fresh DB should record every one of them after
 * `runMigrations()`. The drift scenario the audit caught was synchronize
 * silently creating the schema for migrations 15–23 without inserting
 * bookkeeping rows. Migration 024 inserts those rows back idempotently.
 *
 * Migration classes are imported explicitly (rather than discovered via
 * the on-disk glob) because TypeORM's runtime loader can't parse `.ts`
 * source files; vitest/swc transforms the imports listed below.
 */
import { DataSource, type MigrationInterface, type MixedList } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

import { AuthTables1716000000000 } from '../../../migrations/1716000000000-auth-tables';
import { ProjectsTables1716000001000 } from '../../../migrations/1716000001000-projects-tables';
import { EpicsSprintsTasks1716000002000 } from '../../../migrations/1716000002000-epics-sprints-tasks';
import { ChecklistDependencies1716000003000 } from '../../../migrations/1716000003000-checklist-dependencies';
import { TaskSearchVector1716000004000 } from '../../../migrations/1716000004000-task-search-vector';
import { TaskLabels1716000005000 } from '../../../migrations/1716000005000-task-labels';
import { PasswordResets1716000006000 } from '../../../migrations/1716000006000-password-resets';
import { CommentsAttachmentsActivity1716000007000 } from '../../../migrations/1716000007000-comments-attachments-activity';
import { Notifications1716000008000 } from '../../../migrations/1716000008000-notifications';
import { NotificationProjectId1716000009000 } from '../../../migrations/1716000009000-notification-project-id';
import { RetroTables1716000010000 } from '../../../migrations/1716000010000-retro-tables';
import { SettingsTable1716000011000 } from '../../../migrations/1716000011000-settings-table';
import { HierarchyMigration1716000012000 } from '../../../migrations/1716000012000-hierarchy-migration';
import { DateFieldsRename1716000013000 } from '../../../migrations/1716000013000-date-fields-rename';
import { AssociationsRedesign1716000014000 } from '../../../migrations/1716000014000-associations-redesign';
import { SprintOneActivePerProject1716000015000 } from '../../../migrations/1716000015000-sprint-one-active-per-project';
import { SprintNumberUniquePerProject1716000016000 } from '../../../migrations/1716000016000-sprint-number-unique-per-project';
import { InvitationPendingEmailUnique1716000017000 } from '../../../migrations/1716000017000-invitation-pending-email-unique';
import { NotificationDailyDedupUnique1716000018000 } from '../../../migrations/1716000018000-notification-daily-dedup-unique';
import { WorkItemSearchVector1716000019000 } from '../../../migrations/1716000019000-work-item-search-vector';
import { StatusFixedWipEstimation1716000020000 } from '../../../migrations/1716000020000-status-fixed-wip-estimation';
import { FkRestrictOnUserDelete1716000021000 } from '../../../migrations/1716000021000-fk-restrict-on-user-delete';
import { AssociationsCreatedByFk1716000022000 } from '../../../migrations/1716000022000-associations-created-by-fk';
import { AlignColumnLengths1716000023000 } from '../../../migrations/1716000023000-align-column-lengths';
import { ReconcileMigrationsTable1716000024000 } from '../../../migrations/1716000024000-reconcile-migrations-table';
import { RestoreCheckConstraints1716000025000 } from '../../../migrations/1716000025000-restore-check-constraints';
import { AssocCreatedBySetNull1716000026000 } from '../../../migrations/1716000026000-assoc-created-by-set-null';
import { AddMissingForeignKeys1716000027000 } from '../../../migrations/1716000027000-add-missing-foreign-keys';
import { AddMissingFkIndexes1716000028000 } from '../../../migrations/1716000028000-add-missing-fk-indexes';
import { DropLegacyTables1716000029000 } from '../../../migrations/1716000029000-drop-legacy-tables';
import { ActivityGranularity1716000030000 } from '../../../migrations/1716000030000-activity-granularity';
import { ProjectsActivityArchiveColumns1716000031000 } from '../../../migrations/1716000031000-projects-activity-archive-columns';
import { PinnedProjectsAndVisits1716000032000 } from '../../../migrations/1716000032000-pinned-projects-and-visits';
import { SearchPeopleProjects1716000033000 } from '../../../migrations/1716000033000-search-people-projects';
import { SprintDailySnapshots1716000034000 } from '../../../migrations/1716000034000-sprint-daily-snapshots';
import { EXPECTED_MIGRATION_NAMES } from '../../../src/database/migrations-registry';

const ALL_MIGRATIONS: MixedList<new () => MigrationInterface> = [
  AuthTables1716000000000,
  ProjectsTables1716000001000,
  EpicsSprintsTasks1716000002000,
  ChecklistDependencies1716000003000,
  TaskSearchVector1716000004000,
  TaskLabels1716000005000,
  PasswordResets1716000006000,
  CommentsAttachmentsActivity1716000007000,
  Notifications1716000008000,
  NotificationProjectId1716000009000,
  RetroTables1716000010000,
  SettingsTable1716000011000,
  HierarchyMigration1716000012000,
  DateFieldsRename1716000013000,
  AssociationsRedesign1716000014000,
  SprintOneActivePerProject1716000015000,
  SprintNumberUniquePerProject1716000016000,
  InvitationPendingEmailUnique1716000017000,
  NotificationDailyDedupUnique1716000018000,
  WorkItemSearchVector1716000019000,
  StatusFixedWipEstimation1716000020000,
  FkRestrictOnUserDelete1716000021000,
  AssociationsCreatedByFk1716000022000,
  AlignColumnLengths1716000023000,
  ReconcileMigrationsTable1716000024000,
  RestoreCheckConstraints1716000025000,
  AssocCreatedBySetNull1716000026000,
  AddMissingForeignKeys1716000027000,
  AddMissingFkIndexes1716000028000,
  DropLegacyTables1716000029000,
  ActivityGranularity1716000030000,
  ProjectsActivityArchiveColumns1716000031000,
  PinnedProjectsAndVisits1716000032000,
  SearchPeopleProjects1716000033000,
  SprintDailySnapshots1716000034000,
];

function uniqueDbName(): string {
  return `trackero_mig_test_${randomBytes(6).toString('hex')}`;
}

function adminConfig() {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
    database: 'postgres',
  };
}

async function createDb(name: string) {
  const c = new Client(adminConfig());
  await c.connect();
  try {
    await c.query(`CREATE DATABASE "${name}"`);
  } finally {
    await c.end();
  }
}

async function dropDb(name: string) {
  const c = new Client(adminConfig());
  await c.connect();
  try {
    await c.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await c.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await c.end();
  }
}

function buildDataSource(dbName: string): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || '',
    database: dbName,
    // Migrations operate on raw SQL — they don't need entity metadata, so we
    // skip the .ts entity glob (which TypeORM's runtime loader can't parse).
    entities: [],
    migrations: ALL_MIGRATIONS,
    // Migration 028 declares `transaction = false` (CREATE INDEX
    // CONCURRENTLY); 'each' permits per-migration overrides.
    migrationsTransactionMode: 'each',
    synchronize: false,
    migrationsRun: false,
  });
}

describe('migrations bookkeeping (T0.1)', () => {
  it('EXPECTED_MIGRATION_NAMES registry matches the actual class names', () => {
    // The registry is a hand-maintained string list because nest build
    // forbids imports from outside src/. This check guards against the
    // strings drifting from the actual migration class names.
    const expectedFromClasses = (ALL_MIGRATIONS as Array<new () => MigrationInterface>)
      .map((m) => m.name)
      .sort();
    expect([...EXPECTED_MIGRATION_NAMES].sort()).toEqual(expectedFromClasses);
  });

  it('records every numbered migration on a fresh DB', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDataSource(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();
      const rows: Array<{ name: string }> = await ds.query(
        'SELECT name FROM migrations ORDER BY id',
      );
      const expected = ds.migrations.map((m) => m.constructor.name).sort();
      const actual = rows.map((r) => r.name).sort();
      expect(actual).toEqual(expected);
      expect(actual).toContain('ReconcileMigrationsTable1716000024000');
      expect(actual).toContain('SprintOneActivePerProject1716000015000');
      expect(actual).toContain('AlignColumnLengths1716000023000');
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('recovers drift when bookkeeping rows 15–23 go missing', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDataSource(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      // Simulate the audited drift: schema for migrations 15–23 is in place
      // but bookkeeping rows are gone. Delete row 024 too so re-running it
      // produces a fresh bookkeeping pass.
      await ds.query(
        `DELETE FROM migrations WHERE name IN (
          'SprintOneActivePerProject1716000015000',
          'SprintNumberUniquePerProject1716000016000',
          'InvitationPendingEmailUnique1716000017000',
          'NotificationDailyDedupUnique1716000018000',
          'WorkItemSearchVector1716000019000',
          'StatusFixedWipEstimation1716000020000',
          'FkRestrictOnUserDelete1716000021000',
          'AssociationsCreatedByFk1716000022000',
          'AlignColumnLengths1716000023000',
          'ReconcileMigrationsTable1716000024000'
        )`,
      );

      // Re-run migrations. TypeORM will see migrations 15–24 missing from
      // bookkeeping and try to re-execute them. Migrations 15–23's bodies
      // are not all idempotent on their own — but the test's goal is that
      // 024's idempotent insert leaves the bookkeeping consistent.
      //
      // To isolate the drift-recovery test from the (separate) question of
      // "are individual migration up()s idempotent?", we narrow the data
      // source to only contain the bookkeeping migration. That mirrors the
      // production runbook: operator manually marks 15–23 as run, then runs
      // migrations — leaving only 024 to execute.
      await ds.destroy();
      const dsBookkeepingOnly = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD || '',
        database: dbName,
        entities: [],
        migrations: [ReconcileMigrationsTable1716000024000],
        synchronize: false,
        migrationsRun: false,
      });
      try {
        await dsBookkeepingOnly.initialize();
        await dsBookkeepingOnly.runMigrations();

        const after: Array<{ name: string }> = await dsBookkeepingOnly.query(
          'SELECT name FROM migrations ORDER BY id',
        );
        const actualNames = after.map((r) => r.name).sort();

        // Migrations 15–23 are restored by 024; 024 itself is recorded by
        // TypeORM's normal mechanism when it runs. Migrations 0–14 stayed
        // in the table from the original run and remain.
        expect(actualNames).toContain('SprintOneActivePerProject1716000015000');
        expect(actualNames).toContain('AlignColumnLengths1716000023000');
        expect(actualNames).toContain('ReconcileMigrationsTable1716000024000');
        // Sanity: total recorded migrations equals what the full set
        // contains, no duplicates introduced.
        const distinct = new Set(actualNames);
        expect(distinct.size).toBe(actualNames.length);
        expect(actualNames.length).toBe(ALL_MIGRATIONS.length);
      } finally {
        if (dsBookkeepingOnly.isInitialized) await dsBookkeepingOnly.destroy();
      }
    } finally {
      // ds may already be destroyed; guard.
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
