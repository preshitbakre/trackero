import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpicsController } from './epics.controller';
import { EpicsService } from './epics.service';
import { WorkItem } from '../work-items/entities/work-item.entity';
import { WorkItemsModule } from '../work-items/work-items.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkItem]),
    WorkItemsModule,
  ],
  controllers: [EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
