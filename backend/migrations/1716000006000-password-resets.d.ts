import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class PasswordResets1716000006000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
