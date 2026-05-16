import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpicsController } from './epics.controller';
import { EpicsService } from './epics.service';
import { Epic } from './entities/epic.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Epic])],
  controllers: [EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
