"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifications1716000008000 = void 0;
class Notifications1716000008000 {
    constructor() {
        this.name = 'Notifications1716000008000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL,
        "type" varchar(50) NOT NULL,
        "reference_type" varchar(20) NOT NULL,
        "reference_id" int NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notif_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_notif_user" ON "notifications" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_notif_read" ON "notifications" ("user_id", "is_read")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "notifications"`);
    }
}
exports.Notifications1716000008000 = Notifications1716000008000;
