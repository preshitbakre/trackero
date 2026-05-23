import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { SprintSnapshotsService } from './sprint-snapshots.service';
import { SprintCapacityService } from './sprint-capacity.service';
import { Sprint } from './entities/sprint.entity';
import { SprintScopeChange } from './entities/sprint-scope-change.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Sprint, SprintScopeChange])],
  controllers: [SprintsController],
  providers: [SprintsService, SprintSnapshotsService, SprintCapacityService],
  exports: [SprintsService, SprintSnapshotsService, SprintCapacityService],
})
export class SprintsModule {}
