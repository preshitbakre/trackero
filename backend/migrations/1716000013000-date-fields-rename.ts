import { MigrationInterface, QueryRunner } from 'typeorm';

export class DateFieldsRename1716000013000 implements MigrationInterface {
  name = 'DateFieldsRename1716000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Copy target_date into due_date where due_date is null (preserve epic target dates)
    await queryRunner.query(`
      UPDATE work_items SET due_date = target_date
      WHERE due_date IS NULL AND target_date IS NOT NULL
    `);

    // Rename due_date → end_date
    await queryRunner.query(`ALTER TABLE work_items RENAME COLUMN due_date TO end_date`);

    // Drop target_date
    await queryRunner.query(`ALTER TABLE work_items DROP COLUMN target_date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename end_date back to due_date
    await queryRunner.query(`ALTER TABLE work_items RENAME COLUMN end_date TO due_date`);

    // Re-add target_date
    await queryRunner.query(`ALTER TABLE work_items ADD COLUMN target_date DATE`);
  }
}
