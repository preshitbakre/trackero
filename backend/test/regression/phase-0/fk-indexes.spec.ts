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

import { Baseline1780382923512 } from '../../../migrations/1780382923512-Baseline';
import { AddMustChangePassword1781349329957 } from '../../../migrations/1781349329957-AddMustChangePassword';
import { AddProjectMethodology1781439447500 } from '../../../migrations/1781439447500-AddProjectMethodology';
import { InstanceSettingsValueJsonb1781500000000 } from '../../../migrations/1781500000000-InstanceSettingsValueJsonb';
import { RestoreAuditHardening1781600000000 } from '../../../migrations/1781600000000-RestoreAuditHardening';

// The pre-1.0 numbered migrations (including 028, which added these FK
// indexes) were squashed into a single Baseline migration. The indexes 028
// added lived only in raw SQL, so the entity-generated Baseline lost them;
// RestoreAuditHardening re-applies them. This spec runs the post-squash set
// and asserts the resulting final schema.
const ALL: MixedList<new () => MigrationInterface> = [
  Baseline1780382923512,
  AddMustChangePassword1781349329957,
  AddProjectMethodology1781439447500,
  InstanceSettingsValueJsonb1781500000000,
  RestoreAuditHardening1781600000000,
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
