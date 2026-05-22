import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvitationPendingEmailUnique1716000017000 implements MigrationInterface {
  name = 'InvitationPendingEmailUnique1716000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index: enforce at most one PENDING invitation per email.
    // invite() pre-checks for an existing pending invitation with findOne, but
    // that has a TOCTOU race — two concurrent invites can both pass the check
    // and both insert a pending row. This index is the DB backstop: the loser's
    // INSERT raises a 23505 unique violation, which the service translates to a
    // clean 409 DUPLICATE_ENTRY. The WHERE clause is essential — a plain unique
    // index on email would wrongly block legitimate re-invites once a prior
    // invitation has been accepted or expired.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_invitation_pending_email"
      ON "invitations" ("email")
      WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_invitation_pending_email"`);
  }
}
