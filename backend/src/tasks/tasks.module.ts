import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { Task } from './entities/task.entity';
import { ChecklistItem } from './entities/checklist-item.entity';
import { TaskDependency } from './entities/task-dependency.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, ChecklistItem, TaskDependency])],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
