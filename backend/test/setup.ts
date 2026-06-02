import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { AppValidationException } from '../src/common/exceptions/app-exceptions';
import { flattenValidationErrors } from '../src/common/helpers/validation-errors.helper';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { randomBytes } from 'crypto';
import request from 'supertest';

// Connection params for the admin client used to CREATE/DROP per-test databases.
// Reads from process.env, which env-setup.ts has populated from .env.test.
function pgAdminConfig() {
  return {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || undefined,
    database: 'postgres',
  };
}

function uniqueDbName(): string {
  return `trackero_test_${randomBytes(6).toString('hex')}`;
}

async function createDatabase(name: string): Promise<void> {
  const client = new Client(pgAdminConfig());
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(name: string): Promise<void> {
  const client = new Client(pgAdminConfig());
  await client.connect();
  try {
    // Terminate any lingering connections so DROP DATABASE doesn't block
    await client.query(
      `SELECT pg_terminate_backend(pg_stat_activity.pid)
       FROM pg_stat_activity
       WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await client.end();
  }
}

export async function createTestApp(): Promise<INestApplication> {
  // Each spec file gets its own Postgres database, eliminating cross-suite
  // races (lingering @OnEvent handlers from one suite writing into the next
  // suite's truncated state, register() counting another suite's users, etc).
  const dbName = uniqueDbName();
  await createDatabase(dbName);

  // Override DATABASE_NAME *before* AppModule compiles so ConfigService picks
  // up the per-suite name. Restore the original immediately after.
  const previousDbName = process.env.DATABASE_NAME;
  process.env.DATABASE_NAME = dbName;

  let app: INestApplication;
  try {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors) => {
          const validationErrors = flattenValidationErrors(errors);
          return new AppValidationException(validationErrors);
        },
      }),
    );
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  } finally {
    if (previousDbName !== undefined) {
      process.env.DATABASE_NAME = previousDbName;
    } else {
      delete process.env.DATABASE_NAME;
    }
  }

  // Ensure search_vector generated column and index exist (synchronize doesn't handle GENERATED columns)
  const dataSource = app.get(DataSource);
  await dataSource.query(`
    DO $$ BEGIN
      ALTER TABLE work_items ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_wi_search" ON work_items USING gin(search_vector)`);

  // Phase 4 — sectioned search uses pg_trgm similarity for projects/people.
  // Migration 033 creates the extension + trigram indexes in dev/prod; tests
  // build schema via synchronize (which doesn't run migrations), so we mirror
  // the extension here. The actual indexes aren't required for correctness —
  // similarity() works without them, just slower — so we skip the GIN trigram
  // index DDL to keep per-suite setup fast.
  await dataSource.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // Monkey-patch close() so afterAll(() => app.close()) also drops the DB.
  // Existing spec files don't need to change.
  const originalClose = app.close.bind(app);
  (app as INestApplication).close = async () => {
    await originalClose();
    await dropDatabase(dbName);
  };

  return app;
}

export async function clearDatabase(app: INestApplication): Promise<void> {
  // Drain pending microtasks + @OnEvent handler turns before truncating.
  // The earlier 50ms band-aid was unreliable; iterating setImmediate flushes
  // the I/O queue between turns, and a short setTimeout absorbs DB-bound
  // async handlers that have already issued queries.
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  await new Promise((r) => setTimeout(r, 50));

  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    await dataSource.query(`TRUNCATE "${entity.tableName}" RESTART IDENTITY CASCADE`);
  }
}

/**
 * Register the first user (becomes admin automatically).
 * Returns the admin's JWT token and user ID.
 */
export async function registerAdmin(app: INestApplication, email = 'admin@test.com', password = 'Password1!') {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password, displayName: 'Admin' });
  // First user is auto-admin, no DB update needed
  return { token: res.body.data.accessToken, id: res.body.data.user.id };
}

/**
 * Invite and register a non-admin user.
 * Admin must already exist. Returns the user's JWT token and user ID.
 */
export async function registerInvitedUser(
  app: INestApplication,
  adminToken: string,
  email: string,
  role = 'member',
  password = 'Password1!',
) {
  // Admin creates invitation
  const inviteRes = await request(app.getHttpServer())
    .post('/api/users/invite')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email, role });
  const inviteToken = inviteRes.body.data.item.token;

  // User registers with invite
  const regRes = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password, displayName: role.charAt(0).toUpperCase() + role.slice(1), inviteToken });
  return { token: regRes.body.data.accessToken, id: regRes.body.data.user.id };
}
