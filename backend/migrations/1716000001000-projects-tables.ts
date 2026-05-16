import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectsTables1716000001000 implements MigrationInterface {
  name = 'ProjectsTables1716000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "prefix" varchar(10) NOT NULL UNIQUE,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "lead_id" int,
        "default_assignee_id" int,
        "task_counter" int NOT NULL DEFAULT 0,
        "default_sprint_duration" int NOT NULL DEFAULT 14,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_project_lead" FOREIGN KEY ("lead_id")
          REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_project_status" ON "projects" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "user_id" int NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'member',
        "added_by" int,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_project_member" UNIQUE ("project_id", "user_id"),
        CONSTRAINT "FK_pm_project" FOREIGN KEY ("project_id")
          REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pm_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pm_user" ON "project_members" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "project_statuses" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "name" varchar(50) NOT NULL,
        "category" varchar(20) NOT NULL,
        "color" varchar(7) NOT NULL DEFAULT '#6B7280',
        "sort_order" int NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_status_name_project" UNIQUE ("project_id", "name"),
        CONSTRAINT "FK_ps_project" FOREIGN KEY ("project_id")
          REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ps_project" ON "project_statuses" ("project_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "labels" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "name" varchar(50) NOT NULL,
        "color" varchar(7) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_label_name_project" UNIQUE ("project_id", "name"),
        CONSTRAINT "FK_label_project" FOREIGN KEY ("project_id")
          REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_label_project" ON "labels" ("project_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "labels"`);
    await queryRunner.query(`DROP TABLE "project_statuses"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
    await queryRunner.query(`DROP TABLE "projects"`);
  }
}
