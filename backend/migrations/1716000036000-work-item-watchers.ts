import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — explicit watcher list for work items.
 *
 * Until now, notifications for comments/assignments fanned out to a hard-
 * coded "assignee + reporter" pair. Watchers makes the set first-class so
 * stakeholders can opt in / out without changing assignment.
 *
 * Composite PK (work_item_id, user_id) gives us the natural uniqueness
 * constraint AND a covering index; CASCADE on both FK sides keeps the
 * table clean when the parent task or user is removed.
 */
export class WorkItemWatchers1716000036000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_item_watchers (
        work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (work_item_id, user_id)
      )
    `);

    // Index the user-side lookup ("which items am I watching?") since the
    // composite PK is leading with work_item_id.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_work_item_watchers_user"
      ON work_item_watchers (user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS work_item_watchers`);
  }
}
