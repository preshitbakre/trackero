import { MigrationInterface, QueryRunner } from 'typeorm';

export class StatusFixedWipEstimation1716000020000 implements MigrationInterface {
  name = 'StatusFixedWipEstimation1716000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // These three columns are declared on entities (ProjectStatus.wipLimit,
    // ProjectStatus.isFixed, Project.estimationScale) but never appeared in a
    // migration — they only landed in dev DBs via TypeORM `synchronize`. This
    // migration backfills the schema for prod. `ADD COLUMN IF NOT EXISTS` keeps
    // it idempotent for dev DBs where synchronize already created them.
    await queryRunner.query(`
      ALTER TABLE "project_statuses"
      ADD COLUMN IF NOT EXISTS "wip_limit" INT NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "project_statuses"
      ADD COLUMN IF NOT EXISTS "is_fixed" BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "estimation_scale" VARCHAR(10) NOT NULL DEFAULT 'free'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "estimation_scale"`);
    await queryRunner.query(`ALTER TABLE "project_statuses" DROP COLUMN IF EXISTS "is_fixed"`);
    await queryRunner.query(`ALTER TABLE "project_statuses" DROP COLUMN IF EXISTS "wip_limit"`);
  }
}
