import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkItemSearchVector1716000019000 implements MigrationInterface {
  name = 'WorkItemSearchVector1716000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM `synchronize` cannot create GENERATED ALWAYS AS columns, so the
    // full-text search vector + GIN index live in a migration for prod. The
    // app.module.ts onModuleInit keeps an idempotent fallback so test/dev
    // databases (which rely on `synchronize`) still get the column.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE work_items ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wi_search" ON work_items USING gin(search_vector)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wi_search"`);
    await queryRunner.query(`ALTER TABLE work_items DROP COLUMN IF EXISTS search_vector`);
  }
}
