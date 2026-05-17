import { MigrationInterface, QueryRunner } from 'typeorm';

export class SettingsTable1716000011000 implements MigrationInterface {
  name = 'SettingsTable1716000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "settings" (
        "key" varchar(100) PRIMARY KEY,
        "value" text NOT NULL
      )
    `);
    await queryRunner.query(`INSERT INTO "settings" ("key", "value") VALUES ('appName', 'Trackero')`);
    await queryRunner.query(`INSERT INTO "settings" ("key", "value") VALUES ('defaultRole', 'member')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settings"`);
  }
}
