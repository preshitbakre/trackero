import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { EmailService } from '../common/services/email.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Invitation])],
  controllers: [UsersController],
  providers: [UsersService, EmailService],
  exports: [UsersService],
})
export class UsersModule {}
