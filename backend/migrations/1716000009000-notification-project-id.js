"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationProjectId1716000009000 = void 0;
class NotificationProjectId1716000009000 {
    constructor() {
        this.name = 'NotificationProjectId1716000009000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN "project_id" int`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "project_id"`);
    }
}
exports.NotificationProjectId1716000009000 = NotificationProjectId1716000009000;
