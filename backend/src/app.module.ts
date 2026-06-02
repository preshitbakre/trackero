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
import { EpicsModule } from './epics/epics.module';
import { PresenceModule } from './presence/presence.module';
import { TodayModule } from './today/today.module';
import { DirectoryModule } from './directory/directory.module';
import { PreferencesModule } from './preferences/preferences.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { RetentionModule } from './retention/retention.module';
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
    EpicsModule,
    PresenceModule,
    TodayModule,
    DirectoryModule,
    PreferencesModule,
    IntegrationsModule,
    RetentionModule,
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
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.configService.get<string>('NODE_ENV') === 'production') return;

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

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notif_daily_dedup"
      ON notifications (user_id, type, reference_id, ((created_at AT TIME ZONE 'UTC')::date))
      WHERE type IN ('sprint_ending', 'task_due_soon', 'task_overdue')
    `);

    await this.dataSource.query(
      `UPDATE work_items SET epic_state = 'draft' WHERE item_type = 'epic' AND epic_state IS NULL`,
    );
  }
}
