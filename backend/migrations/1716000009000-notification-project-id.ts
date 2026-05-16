import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationProjectId1716000009000 implements MigrationInterface {
  name = 'NotificationProjectId1716000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "project_id" int`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "project_id"`);
  }
}
