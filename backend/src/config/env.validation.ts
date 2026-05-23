import { plainToInstance } from 'class-transformer';
import { IsNumberString, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

/**
 * Env-var schema validated at app startup. If any required value is missing
 * or invalid, Nest will fail fast with a clear list of problems instead of
 * surfacing a confusing runtime error later.
 *
 * Optional vars are intentionally allowed (e.g. SMTP_*, CORS_ORIGINS,
 * DATABASE_SSL) so dev/test setups stay frictionless. The validator only
 * enforces the things that MUST be present for the app to function.
 */
export class EnvironmentVariables {
  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters (use a long random string in production)',
  })
  JWT_SECRET!: string;

  @IsString()
  DATABASE_HOST!: string;

  @IsNumberString({}, { message: 'DATABASE_PORT must be numeric' })
  DATABASE_PORT!: string;

  // The codebase reads DATABASE_USERNAME (not DATABASE_USER). Keep the schema
  // aligned with what database.config.ts actually consumes.
  @IsString()
  DATABASE_USERNAME!: string;

  // Password may legitimately be empty in local/dev (peer auth, trust, etc.)
  // so accept an empty string — but the variable itself must be defined.
  @IsString()
  @IsOptional()
  DATABASE_PASSWORD?: string;

  @IsString()
  DATABASE_NAME!: string;

  @IsString()
  MINIO_ENDPOINT!: string;

  @IsString()
  APP_URL!: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints || {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${messages}`);
  }
  return validated;
}
