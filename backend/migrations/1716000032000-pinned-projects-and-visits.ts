import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 — two pivot tables behind the sidebar project switcher
 * (frame-02) and the directory's pinned ordering:
 *
 *   - pinned_projects: per-user pinned projects. Composite PK
 *     (user_id, project_id). Sorted in the sidebar by pinned_at DESC.
 *   - project_visits: per-user last-visited timestamp. UPSERTed on
 *     every project route mount; drives the "Recent" section.
 *
 * Both cascade on either side because they're purely UI ordering data;
 * losing them when the user or project goes is the correct behaviour.
 */
export class PinnedProjectsAndVisits1716000032000 implements MigrationInterface {
  name = 'PinnedProjectsAndVisits1716000032000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pinned_projects" (
        "user_id" int NOT NULL,
        "project_id" int NOT NULL,
        "pinned_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pinned_projects" PRIMARY KEY ("user_id", "project_id"),
        CONSTRAINT "FK_pinned_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pinned_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pinned_user_pinned_at"
        ON "pinned_projects" ("user_id", "pinned_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_visits" (
        "user_id" int NOT NULL,
        "project_id" int NOT NULL,
        "visited_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_visits" PRIMARY KEY ("user_id", "project_id"),
        CONSTRAINT "FK_visit_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_visit_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_visit_user_visited_at"
        ON "project_visits" ("user_id", "visited_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_visits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pinned_projects"`);
  }
}
