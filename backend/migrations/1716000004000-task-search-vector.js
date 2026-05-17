"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskSearchVector1716000004000 = void 0;
class TaskSearchVector1716000004000 {
    constructor() {
        this.name = 'TaskSearchVector1716000004000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE tasks ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED
    `);
        await queryRunner.query(`
      CREATE INDEX IDX_task_search ON tasks USING gin(search_vector)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IDX_task_search`);
        await queryRunner.query(`ALTER TABLE tasks DROP COLUMN search_vector`);
    }
}
exports.TaskSearchVector1716000004000 = TaskSearchVector1716000004000;
