import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkItemsController } from './work-items.controller';
import { HierarchyViewsController } from './hierarchy-views.controller';
import { AcceptanceCriteriaController } from './acceptance-criteria.controller';
import { StoryWorkflowController } from './story-workflow.controller';
import { WorkItemsService } from './work-items.service';
import { WorkItem } from './entities/work-item.entity';
import { WorkItemAssociation } from './entities/work-item-association.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { WorkItemWatcher } from './entities/work-item-watcher.entity';
import { AcceptanceCriterion } from './entities/acceptance-criterion.entity';
import { ReleaseNote } from './entities/release-note.entity';

@Module({
  // Phase 7 — register WorkItemWatcher so synchronize builds the
  // work_item_watchers table in tests.
  imports: [
    TypeOrmModule.forFeature([
      WorkItem,
      WorkItemAssociation,
      ChecklistItem,
      WorkItemWatcher,
      AcceptanceCriterion,
      ReleaseNote,
    ]),
  ],
  controllers: [
    WorkItemsController,
    HierarchyViewsController,
    AcceptanceCriteriaController,
    StoryWorkflowController,
  ],
  providers: [WorkItemsService],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
