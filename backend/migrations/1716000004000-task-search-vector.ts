import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskSearchVector1716000004000 implements MigrationInterface {
  name = 'TaskSearchVector1716000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tasks ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_task_search ON tasks USING gin(search_vector)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IDX_task_search`);
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN search_vector`);
  }
}
