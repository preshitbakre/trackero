import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ProjectIntegration } from './entities/project-integration.entity';
import { IntegrationDelivery } from './entities/integration-delivery.entity';

@Module({
  // Phase 9 — register entities so synchronize builds the tables in tests.
  // Service uses raw SQL, so no repositories injected.
  imports: [TypeOrmModule.forFeature([ProjectIntegration, IntegrationDelivery])],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
