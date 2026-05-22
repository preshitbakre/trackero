import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { EmailService } from '../common/services/email.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  async listUsers(page: number = 1, limit: number = 20) {
    limit = clampLimit(limit);
    const qb = this.userRepo.createQueryBuilder('u')
      .select([
        'u.id', 'u.email', 'u.displayName', 'u.role',
        'u.avatarUrl', 'u.isActive', 'u.lastLoginAt', 'u.createdAt',
      ])
      .orderBy('u.createdAt', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getMany();

    return new PaginatedResponse(data, total, page, limit);
  }

  async searchUsersExcludingProject(excludeProjectId: number, search?: string, limit: number = 10) {
    let sql = `
      SELECT u.id, u.display_name AS "displayName", u.email, u.avatar_url AS "avatarUrl"
      FROM users u
      WHERE u.is_active = true
        AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = $1)
    `;
    const params: any[] = [excludeProjectId];

    if (search && search.length >= 1) {
      params.push(`%${search}%`);
      sql += ` AND (u.display_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    sql += ` ORDER BY u.display_name ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const list = await this.dataSource.query(sql, params);
    return { list };
  }

  async changeRole(id: number, newRole: string, actorId: number) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }

      // Check if removing the last admin (before the self-role check so this error
      // takes priority). Lock the admin rows FOR UPDATE so concurrent demotions
      // serialize: a second transaction blocks until the first commits, then re-reads
      // the now-smaller admin set and correctly throws LAST_ADMIN.
      if (user.role === 'admin' && newRole !== 'admin') {
        const admins = await manager.query(
          `SELECT id FROM users WHERE role = 'admin' AND is_active = true FOR UPDATE`,
        );
        if (admins.length <= 1) {
          throw new AppLogicException('LAST_ADMIN', HttpStatus.CONFLICT);
        }
      }

      if (id === actorId) {
        throw new AppLogicException('SELF_ROLE_CHANGE', HttpStatus.CONFLICT);
      }

      user.role = newRole as User['role'];
      return manager.save(user);
    });

    const list = await this.listUsers(1, 20);
    return PaginatedMutationResponse.forPaginated(
      { id: saved.id, email: saved.email, displayName: saved.displayName, role: saved.role, isActive: saved.isActive } as any,
      list,
    );
  }

  async deactivate(id: number, actorId: number) {
    if (id === actorId) {
      throw new AppLogicException('CANNOT_DEACTIVATE_SELF', HttpStatus.BAD_REQUEST);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id } });
      if (!user) {
        throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }

      // Cannot deactivate the last admin. Lock the admin rows FOR UPDATE so concurrent
      // deactivations serialize and the last-admin check stays correct.
      if (user.role === 'admin') {
        const admins = await manager.query(
          `SELECT id FROM users WHERE role = 'admin' AND is_active = true FOR UPDATE`,
        );
        if (admins.length <= 1) {
          throw new AppLogicException('LAST_ADMIN', HttpStatus.CONFLICT);
        }
      }

      user.isActive = false;
      const result = await manager.save(user);

      // Unassign all tasks and subtasks from this user (inside the transaction).
      await manager.query(
        `UPDATE work_items SET assignee_id = NULL WHERE assignee_id = $1`,
        [id],
      );

      return result;
    });

    const list = await this.listUsers(1, 20);
    return PaginatedMutationResponse.forPaginated(
      { id: saved.id, email: saved.email, displayName: saved.displayName, role: saved.role, isActive: saved.isActive } as any,
      list,
    );
  }

  async reactivate(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    user.isActive = true;
    const saved = await this.userRepo.save(user);

    const list = await this.listUsers(1, 20);
    return PaginatedMutationResponse.forPaginated(
      { id: saved.id, email: saved.email, displayName: saved.displayName, role: saved.role, isActive: saved.isActive } as any,
      list,
    );
  }

  async invite(email: string, role: string, invitedBy: number, projectId?: number) {
    const VALID_ROLES = ['admin', 'project_manager', 'member', 'viewer'];
    if (!VALID_ROLES.includes(role)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.BAD_REQUEST);
    }

    // Block if active user exists with this email
    const existingUser = await this.userRepo.findOne({ where: { email } });
    if (existingUser && existingUser.isActive) {
      throw new AppLogicException('EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT);
    }

    // Block if pending invite already exists for this email
    const existingInvite = await this.invitationRepo.findOne({
      where: { email, status: 'pending' },
    });
    if (existingInvite) {
      throw new AppLogicException('DUPLICATE_ENTRY', HttpStatus.CONFLICT);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = this.invitationRepo.create({
      email,
      token: hashedToken,
      role: role as Invitation['role'],
      projectId: projectId || null,
      invitedBy,
      status: 'pending',
      expiresAt,
    });
    await this.invitationRepo.save(invitation);

    // Send invitation email
    await this.emailService.sendInvitation(email, token, role);

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
