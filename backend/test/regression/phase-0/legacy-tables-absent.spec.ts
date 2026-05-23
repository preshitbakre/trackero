/**
 * T0.6 — six legacy tables must not exist after the consolidation.
 *
 * Migrations 12 and 14 already drop them with IF EXISTS; this
 * migration is a paranoid "make sure they're really gone" pass for
 * drifted databases where synchronize might have re-introduced them.
 *
 * Test plan:
 *   1. Fresh DB → after the full migration run the tables don't exist.
 *   2. Drift simulation → recreate one of the tables empty, run only
 *      migration 029, confirm it's dropped without raising.
 *   3. Refusal → recreate one of the tables non-empty and assert
 *      migration 029 raises with the expected message so an operator
 *      sees the data before it's lost.
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

const ALL: MixedList<new () => MigrationInterface> = [
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
];

const LEGACY_TABLES = [
  'epics',
  'tasks',
  'task_types',
  'task_dependencies',
  'task_labels',
  'work_item_dependencies',
] as const;

function uniqueDbName(): string {
  return `trackero_legacy_${randomBytes(6).toString('hex')}`;
}

function admin() {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
    database: 'postgres',
  };
}

async function createDb(name: string) {
  const c = new Client(admin());
  await c.connect();
  try {
    await c.query(`CREATE DATABASE "${name}"`);
  } finally {
    await c.end();
  }
}

async function dropDb(name: string) {
  const c = new Client(admin());
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

function buildDs(
  dbName: string,
  migrations: MixedList<new () => MigrationInterface> = ALL,
): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || '',
    database: dbName,
    entities: [],
    migrations,
    migrationsTransactionMode: 'each',
    synchronize: false,
    migrationsRun: false,
  });
}

describe('legacy tables dropped (T0.6)', () => {
  it('fresh DB has none of the six legacy tables', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const rows: Array<{ tablename: string }> = await ds.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
        [LEGACY_TABLES],
      );
      expect(rows).toEqual([]);
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('drift: a recreated empty `epics` table is removed by migration 029', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      // Simulate the drift: someone (or an old synchronize run) put
      // the table back. Empty, so the migration must silently drop it.
      await ds.query(`CREATE TABLE epics (id int PRIMARY KEY)`);
      await ds.query(
        `DELETE FROM migrations WHERE name = 'DropLegacyTables1716000029000'`,
      );
      await ds.destroy();

      const dsAgain = buildDs(dbName, [DropLegacyTables1716000029000]);
      try {
        await dsAgain.initialize();
        await dsAgain.runMigrations();
        const rows: Array<{ tablename: string }> = await dsAgain.query(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'epics'`,
        );
        expect(rows).toEqual([]);
      } finally {
        if (dsAgain.isInitialized) await dsAgain.destroy();
      }
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('refusal: a recreated non-empty `epics` table raises with row count', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      await ds.query(`CREATE TABLE epics (id int PRIMARY KEY)`);
      await ds.query(`INSERT INTO epics (id) VALUES (1), (2)`);
      await ds.query(
        `DELETE FROM migrations WHERE name = 'DropLegacyTables1716000029000'`,
      );
      await ds.destroy();

      const dsAgain = buildDs(dbName, [DropLegacyTables1716000029000]);
      try {
        await dsAgain.initialize();
        await expect(dsAgain.runMigrations()).rejects.toThrow(/epics.*2/);
      } finally {
        if (dsAgain.isInitialized) await dsAgain.destroy();
      }
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
