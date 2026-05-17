import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly dataSource: DataSource,
  ) {}

  async listUsers(page: number = 1, limit: number = 20) {
    const qb = this.userRepo.createQueryBuilder('u')
      .select([
        'u.id', 'u.email', 'u.displayName', 'u.role',
        'u.avatarUrl', 'u.isActive', 'u.lastLoginAt', 'u.createdAt',
      ])
      .orderBy('u.createdAt', 'DESC');

    const total = await qb.getCount();
    if (limit !== -1) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const data = await qb.getMany();

    return new PaginatedResponse(data, total, page, limit);
  }

  async changeRole(id: number, newRole: string, actorId: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check if removing last admin (before self-role check so this error takes priority)
    if (user.role === 'admin' && newRole !== 'admin') {
      const adminCount = await this.userRepo.count({
        where: { role: 'admin', isActive: true },
      });
      if (adminCount <= 1) {
        throw new AppLogicException('LAST_ADMIN', HttpStatus.CONFLICT);
      }
    }

    if (id === actorId) {
      throw new AppLogicException('SELF_ROLE_CHANGE', HttpStatus.CONFLICT);
    }

    user.role = newRole as User['role'];
    const saved = await this.userRepo.save(user);

    const list = await this.listUsers(1, 20);
    return PaginatedMutationResponse.forPaginated(
      { id: saved.id, email: saved.email, displayName: saved.displayName, role: saved.role, isActive: saved.isActive } as any,
      list,
    );
  }

  async deactivate(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    user.isActive = false;
    const saved = await this.userRepo.save(user);

    const list = await this.listUsers(1, 20);
    return PaginatedMutationResponse.forPaginated(
      { id: saved.id, email: saved.email, displayName: saved.displayName, role: saved.role, isActive: saved.isActive } as any,
      list,
    );
  }

  async invite(email: string, role: string, invitedBy: number, projectId?: number) {
    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser) {
      throw new AppLogicException('EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = this.invitationRepo.create({
      email,
      token,
      role: role as Invitation['role'],
      projectId: projectId || null,
      invitedBy,
      status: 'pending',
      expiresAt,
    });
    await this.invitationRepo.save(invitation);

    const invitations = await this.listInvitations();
    return {
      item: { email, token, role, status: 'pending', expiresAt },
      ...invitations.toEnvelopeData(),
    };
  }

  async listInvitations() {
    const invitations = await this.invitationRepo.find({
      order: { createdAt: 'DESC' },
    });
    return new PaginatedResponse(invitations, invitations.length, 1, invitations.length || 1);
  }
}
