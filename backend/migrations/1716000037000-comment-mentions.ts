import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — first-class comment mentions.
 *
 * Replaces the previous fragile ILIKE-on-display_name parser with a real
 * relation. One row per mention; UQ(comment_id, user_id) keeps things
 * idempotent across edits. CASCADE both sides.
 */
export class CommentMentions1716000037000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS comment_mentions (
        id BIGSERIAL PRIMARY KEY,
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_comment_mentions"
      ON comment_mentions (comment_id, user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comment_mentions_user"
      ON comment_mentions (user_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS comment_mentions`);
  }
}
