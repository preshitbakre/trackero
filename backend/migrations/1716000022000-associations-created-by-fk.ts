import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssociationsCreatedByFk1716000022000 implements MigrationInterface {
  name = 'AssociationsCreatedByFk1716000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migration 14 created work_item_associations.created_by INT NOT NULL but
    // never added a FK to users(id). That lets orphaned creator references
    // accumulate. Add the constraint and an index for FK lookup performance.
    // ON DELETE RESTRICT mirrors the policy we use for work_items.reporter_id —
    // the app must reassign or detach associations before the user can go.
    await queryRunner.query(`
      ALTER TABLE "work_item_associations"
      ADD CONSTRAINT "FK_assoc_created_by" FOREIGN KEY ("created_by")
      REFERENCES "users" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_assoc_created_by" ON "work_item_associations" ("created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assoc_created_by"`);
    await queryRunner.query(
      `ALTER TABLE "work_item_associations" DROP CONSTRAINT IF EXISTS "FK_assoc_created_by"`,
    );
  }
}
