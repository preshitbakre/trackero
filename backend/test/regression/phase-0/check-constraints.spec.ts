/**
 * T0.2 — restoration of CHECK constraints on work_items / work_item_associations.
 *
 * Migration 14 (`AssociationsRedesign`) declared chk_link_type,
 * chk_no_self_link, and chk_item_type. The audit observed them missing
 * from drifted dev databases — synchronize would create the table but
 * sometimes lose the constraints across schema edits. Migration 025
 * restores them idempotently.
 *
 * The two tests below cover:
 *   1. Fresh-DB happy path: all three constraints exist after the full
 *      migration run, and reject every illegal value documented in the
 *      audit.
 *   2. Drift recovery: schema is in place but the constraints are gone;
 *      running migration 025 alone puts them back.
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
];

function uniqueDbName(): string {
  return `trackero_chk_test_${randomBytes(6).toString('hex')}`;
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

function buildDataSource(
  dbName: string,
  migrations: MixedList<new () => MigrationInterface>,
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
    synchronize: false,
    migrationsRun: false,
  });
}

async function seedMinimalFixture(ds: DataSource) {
  // Smallest legal graph that lets us probe both work_items and
  // work_item_associations: one user, one project, one default status.
  const [{ id: userId }]: Array<{ id: number }> = await ds.query(
    `INSERT INTO users (email, password_hash, display_name, role, is_active)
     VALUES ('chk@test', 'x', 'Chk', 'admin', true)
     RETURNING id`,
  );
  const [{ id: projectId }]: Array<{ id: number }> = await ds.query(
    `INSERT INTO projects (name, prefix, lead_id) VALUES ('CHK','CHK',$1) RETURNING id`,
    [userId],
  );
  const [{ id: statusId }]: Array<{ id: number }> = await ds.query(
    `INSERT INTO project_statuses (project_id, name, category, sort_order)
     VALUES ($1, 'Open', 'backlog', 0) RETURNING id`,
    [projectId],
  );
  return { userId, projectId, statusId };
}

describe('CHECK constraints (T0.2)', () => {
  it('fresh DB carries all three constraints and rejects illegal values', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDataSource(dbName, ALL);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const constraints: Array<{ conname: string }> = await ds.query(
        `SELECT conname FROM pg_constraint
         WHERE conrelid IN ('work_items'::regclass, 'work_item_associations'::regclass)
           AND contype = 'c'
           AND conname IN ('chk_link_type', 'chk_no_self_link', 'chk_item_type')
         ORDER BY conname`,
      );
      const names = constraints.map((c) => c.conname);
      expect(names).toContain('chk_link_type');
      expect(names).toContain('chk_no_self_link');
      expect(names).toContain('chk_item_type');

      const { userId, projectId, statusId } = await seedMinimalFixture(ds);

      // chk_item_type rejects unknown item_type values.
      await expect(
        ds.query(
          `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
           VALUES ($1, 'rogue', 1, 'rogue type', $2, $3, '0')`,
          [projectId, statusId, userId],
        ),
      ).rejects.toThrow(/chk_item_type/);

      // Insert two valid items so the association FK targets resolve.
      const [a]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
         VALUES ($1, 'task', 1, 'a', $2, $3, '0') RETURNING id`,
        [projectId, statusId, userId],
      );
      const [b]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
         VALUES ($1, 'task', 2, 'b', $2, $3, '0') RETURNING id`,
        [projectId, statusId, userId],
      );

      // chk_no_self_link rejects an item linking to itself.
      await expect(
        ds.query(
          `INSERT INTO work_item_associations (item_id, linked_item_id, link_type, created_by)
           VALUES ($1, $1, 'blocks', $2)`,
          [a.id, userId],
        ),
      ).rejects.toThrow(/chk_no_self_link/);

      // chk_link_type rejects unknown link_type values.
      await expect(
        ds.query(
          `INSERT INTO work_item_associations (item_id, linked_item_id, link_type, created_by)
           VALUES ($1, $2, 'invented', $3)`,
          [a.id, b.id, userId],
        ),
      ).rejects.toThrow(/chk_link_type/);

      // Sanity: a valid link goes through.
      await ds.query(
        `INSERT INTO work_item_associations (item_id, linked_item_id, link_type, created_by)
         VALUES ($1, $2, 'blocks', $3)`,
        [a.id, b.id, userId],
      );
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('drift recovery: dropped constraints come back after running migration 025', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDataSource(dbName, ALL);
    try {
      await ds.initialize();
      await ds.runMigrations();

      // Simulate the audited drift: constraints were removed by a long-ago
      // schema edit that never made it into a migration.
      await ds.query(`ALTER TABLE work_items DROP CONSTRAINT IF EXISTS chk_item_type`);
      await ds.query(
        `ALTER TABLE work_item_associations DROP CONSTRAINT IF EXISTS chk_link_type`,
      );
      await ds.query(
        `ALTER TABLE work_item_associations DROP CONSTRAINT IF EXISTS chk_no_self_link`,
      );
      await ds.query(
        `DELETE FROM migrations WHERE name = 'RestoreCheckConstraints1716000025000'`,
      );
      await ds.destroy();

      // Re-run only migration 025; it must reinstate the constraints.
      const dsAgain = buildDataSource(dbName, [RestoreCheckConstraints1716000025000]);
      try {
        await dsAgain.initialize();
        await dsAgain.runMigrations();
        const names: Array<{ conname: string }> = await dsAgain.query(
          `SELECT conname FROM pg_constraint
           WHERE conrelid IN ('work_items'::regclass, 'work_item_associations'::regclass)
             AND contype = 'c'
             AND conname IN ('chk_link_type', 'chk_no_self_link', 'chk_item_type')`,
        );
        const set = names.map((c) => c.conname).sort();
        expect(set).toEqual(['chk_item_type', 'chk_link_type', 'chk_no_self_link']);
      } finally {
        if (dsAgain.isInitialized) await dsAgain.destroy();
      }
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
