import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { WorkItem } from '../work-items/entities/work-item.entity';
import { WorkItemAssociation } from '../work-items/entities/work-item-association.entity';
import { ProjectStatus } from '../projects/entities/project-status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkItem, WorkItemAssociation, ProjectStatus])],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
