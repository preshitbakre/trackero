import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

/**
 * Runtime TypeORM config.
 *
 * Schema source of truth:
 *   - test  → `synchronize: true`; tests spin up a per-suite database and
 *     don't run migrations. Faster, isolated, and matches the existing
 *     setup in `backend/test/setup.ts`. The migrations array is omitted
 *     in test mode because TypeORM's runtime loader cannot parse the
 *     repo's `.ts` migration sources outside the CLI's ts-node context.
 *   - dev / production → migrations. `synchronize` is off; the migration
 *     sequence is the only thing that creates or alters schema.
 *     `migrationsRun` auto-applies pending migrations on boot. The glob
 *     covers `.js` (built artifacts) and `.ts` (in case the runtime has a
 *     transpiler hook such as `typeorm-ts-node-commonjs`).
 *
 * Defensive boot guard: a production process must never run with both
 * `synchronize` and `migrationsRun` enabled — synchronize would recreate
 * objects migrations already created, producing duplicate-DDL crashes
 * mid-startup. The guard surfaces a misconfig at boot rather than during
 * the first failing migration.
 */
export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const env = configService.get<string>('NODE_ENV');
  const isTest = env === 'test';
  const isProduction = env === 'production';
  const synchronize = isTest;
  const migrationsRun = !isTest;

  if (isProduction && synchronize && migrationsRun) {
    throw new Error(
      'Invalid database config: synchronize and migrationsRun cannot both be true in production. ' +
        'See backend/migrations/1716000024000-reconcile-migrations-table.ts for the rationale.',
    );
  }

  return {
    type: 'postgres',
    host: configService.getOrThrow<string>('DATABASE_HOST'),
    port: configService.get<number>('DATABASE_PORT', 5432),
    username: configService.getOrThrow<string>('DATABASE_USERNAME'),
    password: configService.get<string>('DATABASE_PASSWORD', ''),
    database: configService.getOrThrow<string>('DATABASE_NAME'),
    autoLoadEntities: true,
    // Only declare migrations when we'd actually run them. Declaring the glob
    // in test mode (where migrationsRun is false) still makes TypeORM eagerly
    // require() the files at module init, which crashes on the .ts sources
    // because vitest's swc transform does not intercept TypeORM's loader.
    ...(isTest
      ? {}
      : {
          migrations: [path.join(__dirname, '..', '..', 'migrations', '*.{js,ts}')],
          // Per-migration transaction control: required so the index
          // migration (028) can declare `transaction = false` and use
          // CREATE INDEX CONCURRENTLY without TypeORM rejecting the
          // override at boot.
          migrationsTransactionMode: 'each' as const,
        }),
    synchronize,
    migrationsRun,
    logging: env === 'development',
    // Opt-in TLS: set DATABASE_SSL=true for managed providers that require it.
    // rejectUnauthorized:false allows providers like Heroku/Render that use
    // self-signed certs; default (off) preserves local dev behavior.
    ssl: configService.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  };
};
