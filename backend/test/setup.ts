import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { AppValidationException } from '../src/common/exceptions/app-exceptions';
import { flattenValidationErrors } from '../src/common/helpers/validation-errors.helper';
import { DataSource } from 'typeorm';
import request from 'supertest';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

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

  // Ensure search_vector generated column and index exist (synchronize doesn't handle GENERATED columns)
  const dataSource = app.get(DataSource);
  await dataSource.query(`
    DO $$ BEGIN
      ALTER TABLE tasks ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$
  `);
  await dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_task_search" ON tasks USING gin(search_vector)`);

  return app;
}

export async function clearDatabase(app: INestApplication): Promise<void> {
  // Small delay to let async event handlers finish from previous test
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
export async function registerAdmin(app: INestApplication, email = 'admin@test.com', password = 'password123') {
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
  password = 'password123',
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
