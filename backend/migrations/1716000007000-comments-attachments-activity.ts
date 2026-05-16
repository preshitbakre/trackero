import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommentsAttachmentsActivity1716000007000 implements MigrationInterface {
  name = 'CommentsAttachmentsActivity1716000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" SERIAL PRIMARY KEY,
        "task_id" int NOT NULL,
        "author_id" int NOT NULL,
        "body" text NOT NULL,
        "edited_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_comment_task" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comment_author" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_comment_task" ON "comments" ("task_id")`);

    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" SERIAL PRIMARY KEY,
        "task_id" int NOT NULL,
        "uploaded_by" int NOT NULL,
        "original_filename" varchar(500) NOT NULL,
        "storage_key" varchar(1000) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "size_bytes" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_attachment_task" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attachment_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_attachment_task" ON "attachments" ("task_id")`);

    await queryRunner.query(`
      CREATE TABLE "activity_logs" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "task_id" int,
        "user_id" int NOT NULL,
        "action" varchar(50) NOT NULL,
        "field_changed" varchar(50),
        "old_value" text,
        "new_value" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_activity_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_activity_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_activity_task" ON "activity_logs" ("task_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_activity_project" ON "activity_logs" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_activity_created" ON "activity_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "activity_logs"`);
    await queryRunner.query(`DROP TABLE "attachments"`);
    await queryRunner.query(`DROP TABLE "comments"`);
  }
}
