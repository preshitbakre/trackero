import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignColumnLengths1716000023000 implements MigrationInterface {
  name = 'AlignColumnLengths1716000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Entity decorators declare narrower column lengths than the migrations
    // actually created — drifting validators (which look at @Column length)
    // from the storage layout. Tighten the columns to match the entities:
    //   projects.prefix:  varchar(10) -> varchar(5)
    //   labels.name:      varchar(50) -> varchar(15)
    //
    // The pre-checks abort the migration if any existing row would lose data
    // from the tightening — better a loud failure than silent truncation.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM "projects" WHERE length("prefix") > 5) THEN
          RAISE EXCEPTION 'projects.prefix has values >5 chars; abort';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "projects" ALTER COLUMN "prefix" TYPE varchar(5)
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM "labels" WHERE length("name") > 15) THEN
          RAISE EXCEPTION 'labels.name has values >15 chars; abort';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "labels" ALTER COLUMN "name" TYPE varchar(15)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "labels" ALTER COLUMN "name" TYPE varchar(50)
    `);
    await queryRunner.query(`
      ALTER TABLE "projects" ALTER COLUMN "prefix" TYPE varchar(10)
    `);
  }
}
