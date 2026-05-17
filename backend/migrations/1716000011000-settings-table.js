"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsTable1716000011000 = void 0;
class SettingsTable1716000011000 {
    constructor() {
        this.name = 'SettingsTable1716000011000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "settings" (
        "key" varchar(100) PRIMARY KEY,
        "value" text NOT NULL
      )
    `);
        await queryRunner.query(`INSERT INTO "settings" ("key", "value") VALUES ('appName', 'Trackero')`);
        await queryRunner.query(`INSERT INTO "settings" ("key", "value") VALUES ('defaultRole', 'member')`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "settings"`);
    }
}
exports.SettingsTable1716000011000 = SettingsTable1716000011000;
