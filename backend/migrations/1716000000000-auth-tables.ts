import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthTables1716000000000 implements MigrationInterface {
  name = 'AuthTables1716000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "display_name" varchar(255) NOT NULL,
        "avatar_url" varchar(500),
        "role" varchar(20) NOT NULL DEFAULT 'member',
        "token_version" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_user_email" ON "users" ("email")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL,
        "token" varchar(500) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "is_revoked" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_refresh_token_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refresh_token" ON "refresh_tokens" ("token")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_token_user" ON "refresh_tokens" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(255) NOT NULL,
        "token" varchar(500) NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'member',
        "project_id" int,
        "invited_by" int NOT NULL,
        "status" varchar(10) NOT NULL DEFAULT 'pending',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_invitation_inviter" FOREIGN KEY ("invited_by")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_invite_token" ON "invitations" ("token")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invite_email" ON "invitations" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
