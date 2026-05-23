import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8 — per-user notification preferences.
 *
 * Composite PK (user_id, notification_type, channel) so each user has at
 * most one row per (type, channel) pair. Default row absence = "send"
 * (preserves current behaviour for users who never touched the prefs).
 *
 * Channels: in_app | email | push (push slot reserved for later).
 */
export class NotificationPreferences1716000040000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(40) NOT NULL,
        channel VARCHAR(10) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, notification_type, channel)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preferences`);
  }
}
