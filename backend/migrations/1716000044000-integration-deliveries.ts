import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 9 — integration delivery log + retry queue.
 *
 * One row per attempted outbound POST. `next_attempt_at` is the cron
 * pickup gate (1m / 5m / 15m / 1h / 6h backoff schedule). `attempts`
 * caps at 5 — after that we mark the row failed and the UI surfaces it.
 *
 * The (status, next_attempt_at) partial index makes the cron pickup
 * O(log N) instead of scanning every historical delivery.
 */
export class IntegrationDeliveries1716000044000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_deliveries (
        id BIGSERIAL PRIMARY KEY,
        integration_id BIGINT NOT NULL REFERENCES project_integrations(id) ON DELETE CASCADE,
        event_type VARCHAR(40) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        http_status INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_deliveries_pickup"
      ON integration_deliveries (next_attempt_at)
      WHERE status = 'pending'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_deliveries_integration"
      ON integration_deliveries (integration_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration_deliveries`);
  }
}
