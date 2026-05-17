import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class SettingsTable1716000011000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
