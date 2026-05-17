"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpicsSprintsTasks1716000002000 = void 0;
class EpicsSprintsTasks1716000002000 {
    constructor() {
        this.name = 'EpicsSprintsTasks1716000002000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "epics" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "title" varchar(500) NOT NULL,
        "description" text,
        "status" varchar(20) NOT NULL DEFAULT 'open',
        "priority" varchar(10) NOT NULL DEFAULT 'medium',
        "color" varchar(7) NOT NULL DEFAULT '#6366F1',
        "start_date" date,
        "target_date" date,
        "sort_order" varchar(255) NOT NULL DEFAULT 'n',
        "created_by" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_epic_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_epic_creator" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_epic_project" ON "epics" ("project_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_epic_status" ON "epics" ("status")`);
        await queryRunner.query(`
      CREATE TABLE "sprints" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "name" varchar(255) NOT NULL,
        "goal" text,
        "status" varchar(20) NOT NULL DEFAULT 'planning',
        "start_date" date,
        "end_date" date,
        "sprint_number" int NOT NULL,
        "created_by" int NOT NULL,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_sprint_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_sprint_project" ON "sprints" ("project_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_sprint_status" ON "sprints" ("status")`);
        await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" SERIAL PRIMARY KEY,
        "project_id" int NOT NULL,
        "sprint_id" int,
        "epic_id" int,
        "parent_id" int,
        "status_id" int NOT NULL,
        "task_number" int NOT NULL,
        "title" varchar(500) NOT NULL,
        "description" text,
        "type" varchar(10) NOT NULL DEFAULT 'task',
        "priority" varchar(10) NOT NULL DEFAULT 'medium',
        "story_points" int,
        "assignee_id" int,
        "reporter_id" int NOT NULL,
        "sort_order" varchar(255) NOT NULL DEFAULT 'n',
        "due_date" date,
        "start_date" date,
        "completed_at" timestamptz,
        "added_mid_sprint" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_task_project" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_sprint" FOREIGN KEY ("sprint_id") REFERENCES "sprints" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_epic" FOREIGN KEY ("epic_id") REFERENCES "epics" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_parent" FOREIGN KEY ("parent_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_task_status" FOREIGN KEY ("status_id") REFERENCES "project_statuses" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_task_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_task_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_task_project" ON "tasks" ("project_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_task_sprint" ON "tasks" ("sprint_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_task_status" ON "tasks" ("status_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_task_project_number" ON "tasks" ("project_id", "task_number")`);
        await queryRunner.query(`
      CREATE TABLE "sprint_scope_changes" (
        "id" SERIAL PRIMARY KEY,
        "sprint_id" int NOT NULL,
        "task_id" int NOT NULL,
        "action" varchar(10) NOT NULL,
        "story_points" int,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_scope_sprint" FOREIGN KEY ("sprint_id") REFERENCES "sprints" ("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_scope_sprint" ON "sprint_scope_changes" ("sprint_id")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "sprint_scope_changes"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TABLE "sprints"`);
        await queryRunner.query(`DROP TABLE "epics"`);
    }
}
exports.EpicsSprintsTasks1716000002000 = EpicsSprintsTasks1716000002000;
