import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { CommentMention } from './entities/comment-mention.entity';
import { CommentReaction } from './entities/comment-reaction.entity';

@Module({
  // Phase 7 — register the mention + reaction entities so TypeORM's
  // synchronize step builds the tables in tests. Repositories aren't
  // injected here (the service uses raw SQL via DataSource), but the
  // entity registration is what creates the schema.
  imports: [TypeOrmModule.forFeature([Comment, CommentMention, CommentReaction])],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
