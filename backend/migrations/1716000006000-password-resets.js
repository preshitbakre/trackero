"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResets1716000006000 = void 0;
class PasswordResets1716000006000 {
    constructor() {
        this.name = 'PasswordResets1716000006000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN "password_reset_token" varchar(255),
      ADD COLUMN "password_reset_expires" timestamptz
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN "password_reset_token",
      DROP COLUMN "password_reset_expires"
    `);
    }
}
exports.PasswordResets1716000006000 = PasswordResets1716000006000;
