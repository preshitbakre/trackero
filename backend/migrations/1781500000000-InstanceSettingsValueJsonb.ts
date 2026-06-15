import { MigrationInterface, QueryRunner } from "typeorm";

export class InstanceSettingsValueJsonb1781500000000 implements MigrationInterface {
    name = 'InstanceSettingsValueJsonb1781500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "instance_settings" ALTER COLUMN "value" TYPE jsonb USING "value"::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "instance_settings" ALTER COLUMN "value" TYPE text USING "value"::text`);
    }
}
