import { MigrationInterface, QueryRunner } from 'typeorm';

export class SprintOneActivePerProject1716000015000 implements MigrationInterface {
  name = 'SprintOneActivePerProject1716000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index: enforce at most one active sprint per project.
    // This closes the race where two concurrent start() calls each lock their
    // own planning sprint row, both see no active sprint, and both activate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_sprint_one_active_per_project"
      ON "sprints" ("project_id")
      WHERE "status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sprint_one_active_per_project"`);
  }
}
