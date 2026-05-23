import { MigrationInterface, QueryRunner } from 'typeorm';

export class FkRestrictOnUserDelete1716000021000 implements MigrationInterface {
  name = 'FkRestrictOnUserDelete1716000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Two FKs were ON DELETE SET NULL on NOT NULL columns — a guaranteed
    // 23502 not_null_violation when the referenced user is deleted:
    //   work_items.reporter_id  (FK_wi_reporter, NOT NULL, was SET NULL)
    //   attachments.uploaded_by (FK_attachment_uploader, NOT NULL, was SET NULL)
    // Switch both to ON DELETE RESTRICT so the delete is blocked at the DB
    // layer instead of crashing mid-cascade. Service code is responsible for
    // reassigning ownership before a user can be deleted.
    await queryRunner.query(`
      ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "FK_wi_reporter"
    `);
    await queryRunner.query(`
      ALTER TABLE "work_items"
      ADD CONSTRAINT "FK_wi_reporter" FOREIGN KEY ("reporter_id")
      REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachment_uploader"
    `);
    await queryRunner.query(`
      ALTER TABLE "attachments"
      ADD CONSTRAINT "FK_attachment_uploader" FOREIGN KEY ("uploaded_by")
      REFERENCES "users" ("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the previous (broken) SET NULL behaviour purely for
    // reversibility. Do not roll forward into this state in production.
    await queryRunner.query(`
      ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "FK_attachment_uploader"
    `);
    await queryRunner.query(`
      ALTER TABLE "attachments"
      ADD CONSTRAINT "FK_attachment_uploader" FOREIGN KEY ("uploaded_by")
      REFERENCES "users" ("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "work_items" DROP CONSTRAINT IF EXISTS "FK_wi_reporter"
    `);
    await queryRunner.query(`
      ALTER TABLE "work_items"
      ADD CONSTRAINT "FK_wi_reporter" FOREIGN KEY ("reporter_id")
      REFERENCES "users" ("id") ON DELETE SET NULL
    `);
  }
}
