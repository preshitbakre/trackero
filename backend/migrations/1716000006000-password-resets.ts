import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResets1716000006000 implements MigrationInterface {
  name = 'PasswordResets1716000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN "password_reset_token" varchar(255),
      ADD COLUMN "password_reset_expires" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN "password_reset_token",
      DROP COLUMN "password_reset_expires"
    `);
  }
}
