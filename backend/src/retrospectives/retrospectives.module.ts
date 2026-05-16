import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetrospectivesController } from './retrospectives.controller';
import { RetrospectivesService } from './retrospectives.service';
import { Retrospective } from './entities/retrospective.entity';
import { RetroCard } from './entities/retro-card.entity';
import { RetroVote } from './entities/retro-vote.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Retrospective, RetroCard, RetroVote])],
  controllers: [RetrospectivesController],
  providers: [RetrospectivesService],
})
export class RetrospectivesModule {}
