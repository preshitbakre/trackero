/**
 * T0.4 — eight foreign keys that should always exist.
 *
 * Each row in the table below must be backed by a constraint after
 * migration 027. The cascade policy follows Phase 0 DECISIONS.md:
 *
 *   - User-attribution columns          → ON DELETE SET NULL
 *   - Project-owned data + work_item    → ON DELETE CASCADE
 *
 * Two functional checks supplement the catalog assertions:
 *   - retrospectives.created_by goes NULL when the creating user is
 *     deleted (SET NULL spot check).
 *   - activity_logs.work_item_id rows disappear when the referenced
 *     work item is deleted (CASCADE spot check).
 *
 * FK #8 (sprint_scope_changes.work_item_id) was already added by
 * migration 12 with the matching cascade policy; the assertion below
 * confirms it survives migration 027 as a no-op.
 */
import { DataSource, type MigrationInterface, type MixedList } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

import { Baseline1780382923512 } from '../../../migrations/1780382923512-Baseline';
import { AddMustChangePassword1781349329957 } from '../../../migrations/1781349329957-AddMustChangePassword';
import { AddProjectMethodology1781439447500 } from '../../../migrations/1781439447500-AddProjectMethodology';
import { InstanceSettingsValueJsonb1781500000000 } from '../../../migrations/1781500000000-InstanceSettingsValueJsonb';
import { RestoreAuditHardening1781600000000 } from '../../../migrations/1781600000000-RestoreAuditHardening';

// The pre-1.0 numbered migrations (including 027, which added these FKs) were
// squashed into a single Baseline migration. The FKs 027 added lived only in
// raw SQL, so the entity-generated Baseline lost them; RestoreAuditHardening
// re-applies them. This spec runs the post-squash set and asserts the
// resulting final schema.
const ALL: MixedList<new () => MigrationInterface> = [
  Baseline1780382923512,
  AddMustChangePassword1781349329957,
  AddProjectMethodology1781439447500,
  InstanceSettingsValueJsonb1781500000000,
  RestoreAuditHardening1781600000000,
];

interface FkSpec {
  table: string;
  column: string;
  refTable: string;
  constraintName: string;
  deleteRule: 'CASCADE' | 'SET NULL';
}

const SPECS: ReadonlyArray<FkSpec> = [
  { table: 'activity_logs',         column: 'work_item_id',          refTable: 'work_items', constraintName: 'FK_activity_work_item',     deleteRule: 'CASCADE' },
  { table: 'notifications',         column: 'project_id',            refTable: 'projects',   constraintName: 'FK_notif_project',          deleteRule: 'CASCADE' },
  { table: 'invitations',           column: 'project_id',            refTable: 'projects',   constraintName: 'FK_invitation_project',     deleteRule: 'CASCADE' },
  { table: 'projects',              column: 'default_assignee_id',   refTable: 'users',      constraintName: 'FK_project_default_assignee', deleteRule: 'SET NULL' },
  { table: 'retrospectives',        column: 'created_by',            refTable: 'users',      constraintName: 'FK_retro_created_by',       deleteRule: 'SET NULL' },
  { table: 'sprints',               column: 'created_by',            refTable: 'users',      constraintName: 'FK_sprint_created_by',      deleteRule: 'SET NULL' },
  { table: 'project_members',       column: 'added_by',              refTable: 'users',      constraintName: 'FK_project_member_added_by', deleteRule: 'SET NULL' },
  { table: 'sprint_scope_changes',  column: 'work_item_id',          refTable: 'work_items', constraintName: 'FK_scope_work_item',        deleteRule: 'CASCADE' },
];

function uniqueDbName(): string {
  return `trackero_fks_${randomBytes(6).toString('hex')}`;
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

describe('missing FKs added by migration 027 (T0.4)', () => {
  it('records every expected FK with the spec delete_rule', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      for (const spec of SPECS) {
        const [row]: Array<{ delete_rule: string }> = await ds.query(
          `SELECT rc.delete_rule
             FROM information_schema.referential_constraints rc
            WHERE rc.constraint_name = $1`,
          [spec.constraintName],
        );
        expect(
          row,
          `expected constraint ${spec.constraintName} on ${spec.table}(${spec.column})`,
        ).toBeDefined();
        expect(
          row.delete_rule,
          `${spec.constraintName} delete_rule`,
        ).toBe(spec.deleteRule);
      }
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('SET NULL spot check: deleting a user nulls retrospectives.created_by', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const [rep]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('rep@t', 'x', 'Rep') RETURNING id`,
      );
      const [creator]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('creator@t', 'x', 'Creator') RETURNING id`,
      );
      const [proj]: Array<{ id: number }> = await ds.query(
        `INSERT INTO projects (name, prefix) VALUES ('FK','FK') RETURNING id`,
      );
      // Retros need a sprint to attach to.
      const [sprint]: Array<{ id: number }> = await ds.query(
        `INSERT INTO sprints (project_id, name, sprint_number, status, created_by)
         VALUES ($1, 'S1', 1, 'completed', $2) RETURNING id`,
        [proj.id, rep.id],
      );
      const [retro]: Array<{ id: number }> = await ds.query(
        `INSERT INTO retrospectives (sprint_id, project_id, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [sprint.id, proj.id, creator.id],
      );

      // Re-point sprint.created_by to keep that FK from blocking the
      // user deletion via its own SET NULL (which would still work, but
      // we keep the test focused on retrospectives).
      await ds.query(`UPDATE sprints SET created_by = $1 WHERE id = $2`, [rep.id, sprint.id]);

      await ds.query(`DELETE FROM users WHERE id = $1`, [creator.id]);

      const [row]: Array<{ created_by: number | null }> = await ds.query(
        `SELECT created_by FROM retrospectives WHERE id = $1`,
        [retro.id],
      );
      expect(row).toBeDefined();
      expect(row.created_by).toBeNull();
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });

  it('CASCADE spot check: deleting a work item nukes its activity_logs rows', async () => {
    const dbName = uniqueDbName();
    await createDb(dbName);
    const ds = buildDs(dbName);
    try {
      await ds.initialize();
      await ds.runMigrations();

      const [u]: Array<{ id: number }> = await ds.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ('u@t', 'x', 'U') RETURNING id`,
      );
      const [p]: Array<{ id: number }> = await ds.query(
        `INSERT INTO projects (name, prefix) VALUES ('CAS','CAS') RETURNING id`,
      );
      const [s]: Array<{ id: number }> = await ds.query(
        `INSERT INTO project_statuses (project_id, name, category, sort_order)
         VALUES ($1, 'Open', 'backlog', 0) RETURNING id`,
        [p.id],
      );
      const [w]: Array<{ id: number }> = await ds.query(
        `INSERT INTO work_items (project_id, item_type, item_number, title, status_id, reporter_id, sort_order)
         VALUES ($1,'task',1,'cas',$2,$3,'0') RETURNING id`,
        [p.id, s.id, u.id],
      );
      await ds.query(
        `INSERT INTO activity_logs (project_id, work_item_id, user_id, action, field_changed)
         VALUES ($1, $2, $3, 'updated', 'title')`,
        [p.id, w.id, u.id],
      );

      const beforeRows: Array<{ count: string }> = await ds.query(
        `SELECT count(*)::text AS count FROM activity_logs WHERE work_item_id = $1`,
        [w.id],
      );
      expect(parseInt(beforeRows[0].count, 10)).toBe(1);

      await ds.query(`DELETE FROM work_items WHERE id = $1`, [w.id]);

      const afterRows: Array<{ count: string }> = await ds.query(
        `SELECT count(*)::text AS count FROM activity_logs WHERE work_item_id = $1`,
        [w.id],
      );
      expect(parseInt(afterRows[0].count, 10)).toBe(0);
    } finally {
      if (ds.isInitialized) await ds.destroy();
      await dropDb(dbName);
    }
  });
});
