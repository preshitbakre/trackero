import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetroTables1716000010000 implements MigrationInterface {
  name = 'RetroTables1716000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "retrospectives" (
        "id" SERIAL PRIMARY KEY,
        "sprint_id" int NOT NULL,
        "project_id" int NOT NULL,
        "created_by" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_retro_sprint" FOREIGN KEY ("sprint_id") REFERENCES "sprints" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retro_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_retro_sprint" ON "retrospectives" ("sprint_id")`);

    await queryRunner.query(`
      CREATE TABLE "retro_cards" (
        "id" SERIAL PRIMARY KEY,
        "retrospective_id" int NOT NULL,
        "column" varchar(20) NOT NULL,
        "content" text NOT NULL,
        "author_id" int NOT NULL,
        "votes" int NOT NULL DEFAULT 0,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_retro_card_retro" FOREIGN KEY ("retrospective_id") REFERENCES "retrospectives" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retro_card_author" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_retro_card_retro" ON "retro_cards" ("retrospective_id")`);

    await queryRunner.query(`
      CREATE TABLE "retro_votes" (
        "id" SERIAL PRIMARY KEY,
        "card_id" int NOT NULL,
        "user_id" int NOT NULL,
        CONSTRAINT "UQ_retro_vote" UNIQUE ("card_id", "user_id"),
        CONSTRAINT "FK_retro_vote_card" FOREIGN KEY ("card_id") REFERENCES "retro_cards" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_retro_vote_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "retro_votes"`);
    await queryRunner.query(`DROP TABLE "retro_cards"`);
    await queryRunner.query(`DROP TABLE "retrospectives"`);
  }
}
