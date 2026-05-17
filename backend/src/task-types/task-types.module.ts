import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskTypesController } from './task-types.controller';
import { TaskTypesService } from './task-types.service';
import { TaskType } from '../projects/entities/task-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TaskType])],
  controllers: [TaskTypesController],
  providers: [TaskTypesService],
  exports: [TaskTypesService],
})
export class TaskTypesModule {}
