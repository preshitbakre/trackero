import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { getDatabaseConfig } from './config/database.config';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { SprintsModule } from './sprints/sprints.module';
import { BoardModule } from './board/board.module';
import { HealthModule } from './health/health.module';
import { FileStorageModule } from './file-storage/file-storage.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ActivityModule } from './activity/activity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GatewayModule } from './gateway/gateway.module';
import { RetrospectivesModule } from './retrospectives/retrospectives.module';
import { ChartsModule } from './charts/charts.module';
import { SearchModule } from './search/search.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FiltersModule } from './filters/filters.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { PresenceModule } from './presence/presence.module';
import { TodayModule } from './today/today.module';
import { DirectoryModule } from './directory/directory.module';
import { PreferencesModule } from './preferences/preferences.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 30),
          },
        ],
      }),
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    SprintsModule,
    BoardModule,
    HealthModule,
    FileStorageModule,
    CommentsModule,
    AttachmentsModule,
    ActivityModule,
    NotificationsModule,
    GatewayModule,
    RetrospectivesModule,
    ChartsModule,
    SearchModule,
    DashboardModule,
    FiltersModule,
    WorkItemsModule,
    PresenceModule,
    TodayModule,
    DirectoryModule,
    PreferencesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    // TypeORM synchronize cannot create GENERATED ALWAYS AS columns. The
    // primary owner of this DDL is migration 1716000019000 (prod path), but we
    // keep an idempotent fallback here so the test DB (which uses
    // synchronize and re-creates schema on the fly) still gets the column +
    // index without having to run migrations.
    await this.dataSource.query(`
      DO $$ BEGIN
        ALTER TABLE work_items ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
        ) STORED;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$
    `);
    await this.dataSource.query(`CREATE INDEX IF NOT EXISTS "IDX_wi_search" ON work_items USING gin(search_vector)`);

    // Partial unique EXPRESSION index for daily-notification idempotency.
    // synchronize cannot build (created_at::date) expression indexes, so — like
    // the search_vector index above — it is created here so test/dev/prod stay
    // consistent. Migration 1716000018000 creates the same index for prod
    // deployments; IF NOT EXISTS makes the two harmless together.
    // Scoped (WHERE type IN ...) to ONLY cron-generated notification types so
    // legitimate same-day event-notification duplicates are not blocked.
    // ((created_at AT TIME ZONE 'UTC')::date) — the bare created_at::date cast
    // is only STABLE (depends on the session TimeZone) and Postgres rejects it
    // in an index expression; pinning to UTC makes the expression IMMUTABLE.
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notif_daily_dedup"
      ON notifications (user_id, type, reference_id, ((created_at AT TIME ZONE 'UTC')::date))
      WHERE type IN ('sprint_ending', 'task_due_soon', 'task_overdue')
    `);
  }
}
