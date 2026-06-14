import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectMethodology1781439447500 implements MigrationInterface {
    name = 'AddProjectMethodology1781439447500'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" ADD "methodology" character varying(16) NOT NULL DEFAULT 'scrum'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "methodology"`);
    }
}
