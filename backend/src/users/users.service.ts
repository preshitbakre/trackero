import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { clampLimit } from '../common/helpers/pagination.helper';
import { rethrowAsDuplicate } from '../common/helpers/db-error.helper';
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
    const offset = (page - 1) * limit;

    const countResult = await this.dataSource.query(
      'SELECT COUNT(*)::int AS total FROM users',
    );
    const total = countResult[0]?.total ?? 0;

    const data = await this.dataSource.query(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.role,
              u.avatar_url AS "avatarUrl", u.is_active AS "isActive",
              u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
              COALESCE(pc.cnt, 0)::int AS "projectCount"
       FROM users u
       LEFT JOIN (
         SELECT user_id, COUNT(*)::int AS cnt
         FROM project_members
         GROUP BY user_id
       ) pc ON pc.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

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

  /**
   * Creates a pending invitation and always returns the raw token + register
   * link + expiry so the admin can copy/share it manually — this path works
   * with or without SMTP. Email delivery is layered on top:
   *   - sendEmail === true  → email the link, but fail loudly (EMAIL_NOT_CONFIGURED)
   *                           if SMTP is unavailable so the admin isn't misled.
   *   - sendEmail === false → never email (manual-link-only).
   *   - sendEmail undefined → send only if SMTP is configured. Preserves the
   *                           pre-existing auto-email behaviour for callers
   *                           (e.g. bulk invite) that don't pass the flag.
   */
  async invite(
    email: string,
    role: string,
    invitedBy: number,
    projectId?: number,
    sendEmail?: boolean,
  ) {
    const VALID_ROLES = ['admin', 'project_manager', 'member', 'viewer'];
    if (!VALID_ROLES.includes(role)) {
      throw new AppLogicException('FORBIDDEN', HttpStatus.BAD_REQUEST);
    }

    const emailEnabled = this.emailService.isEmailEnabled();
    if (sendEmail === true && !emailEnabled) {
      throw new AppLogicException('EMAIL_NOT_CONFIGURED', HttpStatus.BAD_REQUEST);
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
    // The findOne pre-check above handles the fast common case (a pending
    // invite already exists for this email). The catch is the race backstop:
    // a concurrent invite, or the unlikely token-hash collision, raises a
    // 23505 on the unique token index, which becomes a clean 409.
    try {
      await this.invitationRepo.save(invitation);
    } catch (error) {
      rethrowAsDuplicate(error);
    }

    const shouldSend = sendEmail === undefined ? emailEnabled : sendEmail;
    let emailSent = false;
    if (shouldSend) {
      await this.emailService.sendInvitation(email, token, role);
      emailSent = true;
    }

    const inviteUrl = this.emailService.buildInviteUrl(token);
    const invitations = await this.listInvitations();
    return {
      item: {
        email,
        token,
        inviteUrl,
        role,
        status: 'pending',
        expiresAt,
        emailEnabled,
        emailSent,
      },
      ...invitations.toEnvelopeData(),
    };
  }

  /**
   * Re-sends (or first-sends) the invitation email for an existing pending
   * invite. Because only the SHA-256 hash of the token is stored, the raw
   * token can't be reconstructed server-side — the caller (admin UI) holds it
   * from the original create response and passes it back here.
   */
  async sendInviteEmail(token: string) {
    if (!this.emailService.isEmailEnabled()) {
      throw new AppLogicException('EMAIL_NOT_CONFIGURED', HttpStatus.BAD_REQUEST);
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.invitationRepo.findOne({
      where: { token: hashedToken, status: 'pending' },
    });
    if (!invitation) {
      throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
    }
    if (new Date() > invitation.expiresAt) {
      throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
    }

    await this.emailService.sendInvitation(invitation.email, token, invitation.role);
    return { email: invitation.email };
  }

  /**
   * Admin sets a user's password directly (no email round-trip). The new
   * password is treated as temporary: must_change_password is set so the gate
   * forces the user to choose their own on next login. tokenVersion is bumped
   * and all refresh tokens revoked so any existing sessions are invalidated.
   */
  async setUserPassword(id: number, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = true;
    user.tokenVersion += 1;
    await this.userRepo.save(user);

    // Revoke all refresh tokens so existing sessions can't bypass the gate.
    await this.dataSource.query(
      `UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1 AND is_revoked = false`,
      [id],
    );

    return { id: user.id, email: user.email };
  }

  async listInvitations() {
    const list = await this.dataSource.query(
      `SELECT i.id, i.email, i.role, i.project_id AS "projectId",
              i.invited_by AS "invitedBy", i.status,
              i.expires_at AS "expiresAt", i.created_at AS "createdAt",
              u.display_name AS "invitedByName"
       FROM invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       ORDER BY i.created_at DESC`,
    );
    return new PaginatedResponse(list, list.length, 1, list.length || 1);
  }
}
