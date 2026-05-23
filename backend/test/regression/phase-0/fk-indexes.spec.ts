/**
 * T0.5 — 15 FK indexes added, 1 duplicate dropped.
 *
 * Test asserts the post-migration index catalog matches the spec and
 * does one EXPLAIN check on the composite (project_id, created_at DESC)
 * index that the Today aggregator (Phase 2) will lean on.
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
];

const EXPECTED_NEW_INDEXES = [
  'IDX_activity_logs_work_item_id',
  'IDX_activity_logs_user_id',
  'IDX_activity_logs_project_created',
  'IDX_notifications_project_id',
  'IDX_notifications_user_unread',
  'IDX_invitations_project_id',
  'IDX_invitations_invited_by',
  'IDX_projects_default_assignee',
  'IDX_retro_created_by',
  'IDX_sprints_created_by',
  'IDX_project_members_added_by',
  'IDX_sprint_scope_changes_work_item',
  'IDX_comments_work_item_created',
  'IDX_comments_author',
  'IDX_attachments_uploaded_by',
];

function uniqueDbName(): string {
  return `trackero_idx_${randomBytes(6).toString('hex')}`;
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
    migrationsTransactionMode: 'each',
    synchronize: false,
    migrationsRun: false,
  });
}

describe('FK indexes (T0.5)', () => {
  it('creates 15 new indexes and drops IDX_retro_sprint', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const rows: Array<{ indexname: string }> = await ds.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (${EXPECTED_NEW_INDEXES.map((_, i) => `$${i + 1}`).join(',')})`,
        EXPECTED_NEW_INDEXES,
      );
      const present = new Set(rows.map((r) => r.indexname));
      for (const name of EXPECTED_NEW_INDEXES) {
        expect(present.has(name), `expected index ${name}`).toBe(true);
      }

      const [retroDup]: Array<{ indexname: string } | undefined> = await ds.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'IDX_retro_sprint'`,
      );
      expect(retroDup).toBeUndefined();
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('activity feed query plan uses IDX_activity_logs_project_created', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      // Seed several projects with mixed activity so project_id has
      // meaningful selectivity — otherwise the planner picks the older
      // single-column IDX_activity_created since the filter matches
      // every row in a single-project fixture. ANALYZE then updates
      // statistics so the plan reflects the seeded distribution.
      const [u]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('idx@t','x','I') RETURNING id`,
      );
      const projectIds: number[] = [];
      for (let p = 0; p < 8; p += 1) {
        const [row]: Array<{ id: number }> = await ds.query(
          `INSERT INTO projects (name, prefix) VALUES ($1, $2) RETURNING id`,
          [`IDX${p}`, `IDX${p}`],
        );
        projectIds.push(row.id);
      }
      for (let i = 0; i < 2000; i += 1) {
        const proj = projectIds[i % projectIds.length];
        await ds.query(
          `INSERT INTO activity_logs (project_id, user_id, action, field_changed)
           VALUES ($1, $2, 'updated', 'title')`,
          [proj, u.id],
        );
      }
      await ds.query(`ANALYZE activity_logs`);

      const plan: Array<{ 'QUERY PLAN': string }> = await ds.query(
        `EXPLAIN (FORMAT TEXT)
         SELECT * FROM activity_logs
          WHERE project_id = $1
          ORDER BY created_at DESC
          LIMIT 50`,
        [projectIds[0]],
      );
      const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
      expect(planText).not.toMatch(/Seq Scan on activity_logs/);
      expect(planText).toMatch(/IDX_activity_logs_project_created/);
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
