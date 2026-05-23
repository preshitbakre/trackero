import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9 — outbound integrations (Slack / generic webhook / GitHub).
 *
 * `config` is JSONB so each integration type's quirks (Slack channel ID,
 * webhook URL + bearer token, GitHub repo slug + token) ride on the same
 * row shape. `secret` stores the HMAC key used to sign each delivery so
 * the receiver can verify authenticity without us shipping a bearer token
 * unless asked.
 *
 * `enabled` lets an integration be paused without losing its config.
 */
export class ProjectIntegrations1716000043000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_integrations (
        id BIGSERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        secret VARCHAR(128) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_integrations_project_enabled"
      ON project_integrations (project_id) WHERE enabled = TRUE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project_integrations`);
  }
}
