import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8 — `users.timezone` for Today's greeting + cron-time of digest
 * emails. Defaults to 'UTC' so existing rows stay neutral until the user
 * picks one in Profile.
 */
export class UsersTimezone1716000041000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS timezone`);
  }
}
