import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

/**
 * Runtime TypeORM config.
 *
 * Schema source of truth:
 *   - dev / test → `synchronize: true`. Entity definitions drive the schema;
 *     no migrations needed.
 *   - production → migrations. `synchronize` is off; a baseline migration
 *     (generated from the current entity state) is the only thing that
 *     creates or alters schema. `migrationsRun` auto-applies on boot.
 */
export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const env = configService.get<string>('NODE_ENV');
  const isProduction = env === 'production';
  const synchronize = !isProduction;
  const migrationsRun = isProduction;

  return {
    type: 'postgres',
    host: configService.getOrThrow<string>('DATABASE_HOST'),
    port: configService.get<number>('DATABASE_PORT', 5432),
    username: configService.getOrThrow<string>('DATABASE_USERNAME'),
    password: configService.get<string>('DATABASE_PASSWORD', ''),
    database: configService.getOrThrow<string>('DATABASE_NAME'),
    autoLoadEntities: true,
    ...(isProduction
      ? {
          migrations: [path.join(__dirname, '..', '..', 'migrations', '*.js')],
          migrationsTransactionMode: 'each' as const,
        }
      : {}),
    synchronize,
    migrationsRun,
    logging: env === 'development',
    ssl: configService.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
  };
};
