/**
 * T0.3 — FK_assoc_created_by switches to ON DELETE SET NULL.
 *
 * Migration 22 added the FK with ON DELETE RESTRICT so that deleting a
 * user with any authored associations was blocked at the DB layer.
 * Phase 0 DECISIONS.md elevates "audit trail survives user deletion" as
 * the rule for every user-attribution column: the audit row stays, the
 * attribution column goes null.
 *
 * Migration 026 drops the existing FK, makes work_item_associations.created_by
 * nullable, and re-adds the FK with SET NULL semantics.
 *
 * Test plan:
 *   1. Fresh DB, all migrations through 026 applied.
 *   2. pg_constraint shows FK_assoc_created_by exists.
 *   3. The pg_attribute row for created_by reports nullable=true.
 *   4. The information_schema referential_constraints reports
 *      delete_rule = 'SET NULL'.
 *   5. Functional check: with one user as reporter and a second user as
 *      association creator, deleting the second user nulls the
 *      association's created_by without losing the row.
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
];

function uniqueDbName(): string {
  return `trackero_fk_assoc_${randomBytes(6).toString('hex')}`;
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

function buildDs(dbName: string): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD || '',
    database: dbName,
    entities: [],
    migrations: ALL,
    synchronize: false,
    migrationsRun: false,
  });
}

describe('FK_assoc_created_by — SET NULL semantics (T0.3)', () => {
  it('records SET NULL delete rule and a nullable created_by column', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const [fk]: Array<{ delete_rule: string }> = await ds.query(
        `SELECT rc.delete_rule
           FROM information_schema.referential_constraints rc
          WHERE rc.constraint_name = 'FK_assoc_created_by'`,
      );
      expect(fk).toBeDefined();
      expect(fk.delete_rule).toBe('SET NULL');

      const [col]: Array<{ is_nullable: string }> = await ds.query(
        `SELECT is_nullable
           FROM information_schema.columns
          WHERE table_name = 'work_item_associations'
            AND column_name = 'created_by'`,
      );
      expect(col.is_nullable).toBe('YES');
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('nulls created_by when an associating user is deleted; rows survive', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      // Two users: reporter (cannot be deleted — pinned by FK_wi_reporter
      // RESTRICT) and linker (the one whose deletion we test).
      const [reporter]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('rep@t', 'x', 'Rep') RETURNING id`,
      );
      const [linker]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('link@t', 'x', 'Link') RETURNING id`,
      );
      const [proj]: Array<{ id: number }> = await ds.query(
        `INSERT INTO projects (name, prefix) VALUES ('AC','AC') RETURNING id`,
      );
      const [status]: Array<{ id: number }> = await ds.query(
        `INSERT INTO project_statuses (project_id, name, category, sort_order)
         VALUES ($1, 'Open', 'backlog', 0) RETURNING id`,
        [proj.id],
      );
      const [a]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
         VALUES ($1,'task',1,'a',$2,$3,'0') RETURNING id`,
        [proj.id, status.id, reporter.id],
      );
      const [b]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
         VALUES ($1,'task',2,'b',$2,$3,'0') RETURNING id`,
        [proj.id, status.id, reporter.id],
      );
      const [assoc]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_item_associations (item_id, linked_item_id, link_type, created_by)
         VALUES ($1, $2, 'blocks', $3) RETURNING id`,
        [a.id, b.id, linker.id],
      );

      // Delete the linker; the FK should null the association's
      // created_by without removing the row.
      await ds.query(`DELETE FROM users WHERE id = $1`, [linker.id]);

      const [row]: Array<{ id: number; created_by: number | null }> = await ds.query(
        `SELECT id, created_by FROM work_item_associations WHERE id = $1`,
        [assoc.id],
      );
      expect(row).toBeDefined();
      expect(row.created_by).toBeNull();
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
