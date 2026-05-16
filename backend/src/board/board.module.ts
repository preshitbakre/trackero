import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { Task } from '../tasks/entities/task.entity';
import { ProjectStatus } from '../projects/entities/project-status.entity';
import { TaskDependency } from '../tasks/entities/task-dependency.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, ProjectStatus, TaskDependency])],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
