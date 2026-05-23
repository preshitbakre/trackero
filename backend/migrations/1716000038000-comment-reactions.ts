import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — emoji reactions on comments.
 *
 * One row per (comment, user, emoji); UQ stops double-reactions while
 * letting a user pick more than one emoji. Emoji is bounded at 8 chars
 * because Postgres counts every codepoint and the longest meaningful
 * compound emoji (e.g. family glyphs) is ~7 bytes.
 */
export class CommentReactions1716000038000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        id BIGSERIAL PRIMARY KEY,
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(8) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_comment_reactions"
      ON comment_reactions (comment_id, user_id, emoji)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_comment_reactions_comment"
      ON comment_reactions (comment_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS comment_reactions`);
  }
}
