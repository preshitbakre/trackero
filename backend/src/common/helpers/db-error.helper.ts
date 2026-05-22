import { HttpStatus } from '@nestjs/common';
import { AppLogicException } from '../exceptions/app-exceptions';

/**
 * Translates a caught database error into a clean 409 DUPLICATE_ENTRY response
 * when it is a Postgres unique-constraint violation (SQLSTATE 23505).
 *
 * A `findOne`-based duplicate pre-check followed by `save()` has a TOCTOU race:
 * two concurrent requests can both pass the pre-check and both attempt to write.
 * The DB unique constraint is the real backstop — the loser's INSERT/UPDATE
 * raises a 23505 error which would otherwise surface as an ugly raw 500.
 * This helper turns that into the same clean `DUPLICATE_ENTRY` 409 the
 * pre-check throws.
 *
 * Any error that is NOT a 23505 is re-thrown untouched, so unrelated failures
 * are never masked.
 */
export function rethrowAsDuplicate(error: unknown): never {
  if (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === '23505'
  ) {
    throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
  }
  throw error;
}
