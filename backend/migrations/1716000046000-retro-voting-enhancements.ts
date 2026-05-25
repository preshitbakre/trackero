import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetroVotingEnhancements1716000046000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE retrospectives ADD COLUMN max_votes_per_user INT NOT NULL DEFAULT 5`,
    );
    await queryRunner.query(
      `ALTER TABLE retro_cards ADD COLUMN is_action_item BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE retro_cards DROP COLUMN IF EXISTS is_action_item`,
    );
    await queryRunner.query(
      `ALTER TABLE retrospectives DROP COLUMN IF EXISTS max_votes_per_user`,
    );
  }
}
