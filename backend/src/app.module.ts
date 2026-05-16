import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { EpicsModule } from './epics/epics.module';
import { SprintsModule } from './sprints/sprints.module';
import { TasksModule } from './tasks/tasks.module';
import { BoardModule } from './board/board.module';
import { HealthModule } from './health/health.module';
import { FileStorageModule } from './file-storage/file-storage.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ActivityModule } from './activity/activity.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    EventEmitterModule.forRoot(),
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
    EpicsModule,
    SprintsModule,
    TasksModule,
    BoardModule,
    HealthModule,
    FileStorageModule,
    CommentsModule,
    AttachmentsModule,
    ActivityModule,
  ],
})
export class AppModule {}
