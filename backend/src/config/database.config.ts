import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.getOrThrow<string>('DATABASE_HOST'),
  port: configService.get<number>('DATABASE_PORT', 5432),
  username: configService.getOrThrow<string>('DATABASE_USERNAME'),
  password: configService.get<string>('DATABASE_PASSWORD', ''),
  database: configService.getOrThrow<string>('DATABASE_NAME'),
  autoLoadEntities: true,
  synchronize: configService.get<string>('NODE_ENV') !== 'production',
  logging: configService.get<string>('NODE_ENV') === 'development',
  // Opt-in TLS: set DATABASE_SSL=true for managed providers that require it.
  // rejectUnauthorized:false allows providers like Heroku/Render that use
  // self-signed certs; default (off) preserves local dev behavior.
  ssl: configService.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
});
