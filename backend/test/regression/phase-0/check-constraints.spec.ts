/**
 * T0.2 — restoration of CHECK constraints on work_items / work_item_associations.
 *
 * Migration 14 (`AssociationsRedesign`) declared chk_link_type,
 * chk_no_self_link, and chk_item_type; migration 025 restored them
 * idempotently. Both are now folded into the squashed Baseline migration.
 *
 * Fresh-DB happy path: all three constraints exist after the full migration
 * run, and reject every illegal value documented in the audit. (The former
 * drift-recovery test re-ran the standalone migration 025, which no longer
 * exists post-squash, so it was removed.)
 */
import { DataSource, type MigrationInterface, type MixedList } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

import { Baseline1780382923512 } from '../../../migrations/1780382923512-Baseline';
import { AddMustChangePassword1781349329957 } from '../../../migrations/1781349329957-AddMustChangePassword';
import { AddProjectMethodology1781439447500 } from '../../../migrations/1781439447500-AddProjectMethodology';
import { InstanceSettingsValueJsonb1781500000000 } from '../../../migrations/1781500000000-InstanceSettingsValueJsonb';
import { RestoreAuditHardening1781600000000 } from '../../../migrations/1781600000000-RestoreAuditHardening';

// The pre-1.0 numbered migrations (including 025, which restored these CHECK
// constraints) were squashed into a single Baseline migration. The hardening
// 025 carried lived only in raw SQL, so the entity-generated Baseline lost it;
// RestoreAuditHardening re-applies it. This spec runs the post-squash set and
// asserts the resulting final schema.
const ALL: MixedList<new () => MigrationInterface> = [
  Baseline1780382923512,
  AddMustChangePassword1781349329957,
  AddProjectMethodology1781439447500,
  InstanceSettingsValueJsonb1781500000000,
  RestoreAuditHardening1781600000000,
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
});
