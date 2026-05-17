"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChecklistDependencies1716000003000 = void 0;
class ChecklistDependencies1716000003000 {
    constructor() {
        this.name = 'ChecklistDependencies1716000003000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "checklist_items" (
        "id" SERIAL PRIMARY KEY,
        "task_id" int NOT NULL,
        "title" varchar(500) NOT NULL,
        "is_completed" boolean NOT NULL DEFAULT false,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_checklist_task" FOREIGN KEY ("task_id")
          REFERENCES "tasks" ("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_checklist_task" ON "checklist_items" ("task_id")`);
        await queryRunner.query(`
      CREATE TABLE "task_dependencies" (
        "id" SERIAL PRIMARY KEY,
        "task_id" int NOT NULL,
        "depends_on_task_id" int NOT NULL,
        "dependency_type" varchar(20) NOT NULL DEFAULT 'blocks',
        "created_by" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_dependency" UNIQUE ("task_id", "depends_on_task_id"),
        CONSTRAINT "FK_dep_task" FOREIGN KEY ("task_id")
          REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dep_depends_on" FOREIGN KEY ("depends_on_task_id")
          REFERENCES "tasks" ("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_dep_task" ON "task_dependencies" ("task_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_dep_depends_on" ON "task_dependencies" ("depends_on_task_id")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "task_dependencies"`);
        await queryRunner.query(`DROP TABLE "checklist_items"`);
    }
}
exports.ChecklistDependencies1716000003000 = ChecklistDependencies1716000003000;
