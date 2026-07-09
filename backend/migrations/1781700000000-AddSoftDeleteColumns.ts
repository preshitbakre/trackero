import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteColumns1781700000000 implements MigrationInterface {
  name = 'AddSoftDeleteColumns1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "retro_cards" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "retro_cards" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
