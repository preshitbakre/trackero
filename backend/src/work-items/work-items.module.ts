import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkItemsController } from './work-items.controller';
import { HierarchyViewsController } from './hierarchy-views.controller';
import { WorkItemsService } from './work-items.service';
import { WorkItem } from './entities/work-item.entity';
import { WorkItemAssociation } from './entities/work-item-association.entity';
import { ChecklistItem } from './entities/checklist-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkItem, WorkItemAssociation, ChecklistItem])],
  controllers: [WorkItemsController, HierarchyViewsController],
  providers: [WorkItemsService],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
