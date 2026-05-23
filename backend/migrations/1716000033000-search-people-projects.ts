import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — extend search to people + projects.
 *
 * Adds the `pg_trgm` extension and GIN trigram indexes on users.display_name,
 * users.email, and projects.name. Lets people / project search rank by
 * trigram similarity rather than substring LIKE, so "alse" finds "Alice"
 * and similar typo / fragment matches.
 *
 * Idempotent on re-run (CREATE EXTENSION / INDEX IF NOT EXISTS) so the
 * dev / staging / prod schemas converge cleanly.
 */
export class SearchPeopleProjects1716000033000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // The extension is required for the gin_trgm_ops operator class and
    // the similarity() function the search service uses for ranking.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_display_name_trgm"
      ON users USING gin (display_name gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_email_trgm"
      ON users USING gin (email gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_projects_name_trgm"
      ON projects USING gin (name gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_display_name_trgm"`);
    // Leave the extension in place; other code paths may rely on it.
  }
}
