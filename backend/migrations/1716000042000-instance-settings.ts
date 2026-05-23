import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 8 — instance-wide settings table.
 *
 * Key/JSONB value store; admin-managed. Seeds three rows that the rest
 * of the app reads on boot (appName, defaultRole, feature_flags). Future
 * SMTP / integrations config will reuse this table rather than scattering
 * env vars.
 */
export class InstanceSettings1716000042000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS instance_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO instance_settings (key, value) VALUES
        ('appName',       '"Trackero"'::jsonb),
        ('defaultRole',   '"member"'::jsonb),
        ('feature_flags', '{}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS instance_settings`);
  }
}
