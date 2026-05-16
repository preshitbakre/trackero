import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskLabels1716000005000 implements MigrationInterface {
  name = 'TaskLabels1716000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "task_labels" (
        "task_id" int NOT NULL,
        "label_id" int NOT NULL,
        CONSTRAINT "PK_task_labels" PRIMARY KEY ("task_id", "label_id"),
        CONSTRAINT "FK_task_labels_task" FOREIGN KEY ("task_id")
          REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_labels_label" FOREIGN KEY ("label_id")
          REFERENCES "labels" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_task_labels_task" ON "task_labels" ("task_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_task_labels_label" ON "task_labels" ("label_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "task_labels"`);
  }
}
