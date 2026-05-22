import { MigrationInterface, QueryRunner } from 'typeorm';

export class SprintNumberUniquePerProject1716000016000 implements MigrationInterface {
  name = 'SprintNumberUniquePerProject1716000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Unique constraint on (project_id, sprint_number). sprint_number is
    // auto-assigned as MAX(sprint_number)+1 per project, so two concurrent
    // create() calls can read the same MAX and pick the same number. This
    // constraint is the DB backstop: the loser's INSERT raises a 23505 unique
    // violation, which the service translates to a clean 409 DUPLICATE_ENTRY.
    await queryRunner.query(`
      ALTER TABLE "sprints"
      ADD CONSTRAINT "UQ_sprint_number_project"
      UNIQUE ("project_id", "sprint_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sprints" DROP CONSTRAINT IF EXISTS "UQ_sprint_number_project"`,
    );
  }
}
