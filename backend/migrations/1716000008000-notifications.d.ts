import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class Notifications1716000008000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
