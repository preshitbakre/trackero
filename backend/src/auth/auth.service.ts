import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Invitation } from './entities/invitation.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetupDto } from './dto/setup.dto';
import { EmailService } from '../common/services/email.service';
import { InstanceSetting } from './entities/instance-setting.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  async getSetupStatus() {
    const userCount = await this.userRepo.count();
    const isSetup = userCount > 0;
    if (!isSetup) {
      return { isSetup };
    }
    const instanceNameRow = await this.dataSource
      .getRepository(InstanceSetting)
      .findOne({ where: { key: 'instance_name' } });
    return {
      isSetup,
      instanceName: instanceNameRow?.value ?? null,
      appUrl: this.configService.get<string>('APP_URL', ''),
    };
  }

  async getPreflight() {
    const checks: Array<{
      key: string;
      label: string;
      status: 'ok' | 'warn' | 'error';
      sub: string;
    }> = [];

    // PostgreSQL
    try {
      const rows: Array<{ version: string }> = await this.dataSource.query('SELECT version()');
      const full = rows[0]?.version ?? '';
      const match = full.match(/PostgreSQL\s+([\d.]+)/);
      checks.push({
        key: 'postgres',
        label: `PostgreSQL ${match ? match[1] : '??'}`,
        status: 'ok',
        sub: 'database reachable',
      });
    } catch {
      checks.push({
        key: 'postgres',
        label: 'PostgreSQL',
        status: 'error',
        sub: 'database unreachable',
      });
    }

    // MinIO (object storage)
    const minioEndpoint = this.configService.get<string>('MINIO_ENDPOINT');
    if (minioEndpoint) {
      try {
        const ssl = (this.configService.get<string>('MINIO_USE_SSL') ?? '').toLowerCase() === 'true';
        const port = this.configService.get<string>('MINIO_PORT') ?? (ssl ? '443' : '9000');
        const url = `${ssl ? 'https' : 'http'}://${minioEndpoint}:${port}/minio/health/live`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        checks.push({
          key: 'storage',
          label: 'Object storage',
          status: res.ok ? 'ok' : 'error',
          sub: res.ok ? 'MinIO reachable' : 'MinIO unreachable',
        });
      } catch {
        checks.push({
          key: 'storage',
          label: 'Object storage',
          status: 'error',
          sub: 'MinIO unreachable',
        });
      }
    } else {
      checks.push({
        key: 'storage',
        label: 'Object storage',
        status: 'warn',
        sub: 'not configured',
      });
    }

    // Disk space
    try {
      const tmpDir = os.tmpdir();
      const stats = fs.statfsSync(tmpDir);
      const freeBytes = stats.bfree * stats.bsize;
      const freeGb = Math.floor(freeBytes / (1024 * 1024 * 1024));
      checks.push({
        key: 'disk',
        label: `Disk ${freeGb} GB free`,
        status: freeGb >= 1 ? 'ok' : 'warn',
        sub: 'writable',
      });
    } catch {
      checks.push({
        key: 'disk',
        label: 'Disk',
        status: 'warn',
        sub: 'unable to check',
      });
    }

    // SMTP — real EHLO handshake
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    if (smtpHost) {
      const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
      const smtpUser = this.configService.get<string>('SMTP_USER');
      const smtpPass = this.configService.get<string>('SMTP_PASS');
      try {
        const nodemailer = await import('nodemailer');
        const start = Date.now();
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
          connectionTimeout: 3000,
          greetingTimeout: 3000,
        });
        await transporter.verify();
        const elapsed = Date.now() - start;
        transporter.close();
        checks.push({
          key: 'smtp',
          label: 'SMTP live',
          status: 'ok',
          sub: `${smtpHost} · ${elapsed}ms`,
        });
      } catch {
        checks.push({
          key: 'smtp',
          label: 'SMTP error',
          status: 'error',
          sub: `${smtpHost} unreachable`,
        });
      }
    } else {
      checks.push({
        key: 'smtp',
        label: 'SMTP not set',
        status: 'warn',
        sub: 'set via environment variables',
      });
    }

    const allOk = checks.every((c) => c.status === 'ok');
    const hasError = checks.some((c) => c.status === 'error');

    return {
      summary: hasError ? 'issues found' : allOk ? 'everything looks good' : 'minor warnings',
      checks,
    };
  }

  async setup(dto: SetupDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [991001]);

      const userCount = await manager.count(User);
      if (userCount > 0) {
        throw new AppLogicException('ALREADY_SETUP', HttpStatus.CONFLICT);
      }

      const admin = manager.create(User, {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: 'admin',
        isActive: true,
      });
      return manager.save(admin);
    });

    const tokens = await this.generateTokens(saved);
    return {
      user: this.sanitizeUser(saved),
      ...tokens,
    };
  }

  async register(dto: RegisterDto) {
    // Hash password outside transaction (CPU-intensive)
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const saved = await this.dataSource.transaction(async (manager) => {
      // Serialize the "first user becomes admin" determination across concurrent
      // registrations. pg_advisory_xact_lock is a transaction-scoped lock held until
      // commit/rollback, so a second concurrent registration blocks here until the
      // first commits, then correctly counts a non-zero user count. The key 991001
      // is an arbitrary fixed constant reserved for the registration/first-admin race.
      await manager.query('SELECT pg_advisory_xact_lock($1)', [991001]);

      const existing = await manager.findOne(User, { where: { email: dto.email } });
      if (existing) {
        throw new AppLogicException('EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT);
      }

      const userCount = await manager.count(User);
      let role: User['role'] = 'member';

      if (userCount === 0) {
        // First user ever → becomes admin (instance setup)
        role = 'admin';
      } else if (dto.inviteToken) {
        // Invited user → validate token and use invited role
        const hashedInviteToken = crypto.createHash('sha256').update(dto.inviteToken).digest('hex');
        const invitation = await manager.findOne(Invitation, {
          where: { token: hashedInviteToken, status: 'pending' },
        });
        if (!invitation) {
          throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
        }
        if (new Date() > invitation.expiresAt) {
          invitation.status = 'expired';
          await manager.save(invitation);
          throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
        }
        role = invitation.role;
        // Consume the invitation with a conditional UPDATE so it is single-use even
        // under concurrent registration. Under READ COMMITTED a second transaction's
        // UPDATE blocks on the row lock until the first commits, then matches zero
        // rows — so an affected count of exactly 1 is the reliable single-use guarantee.
        const updateResult = await manager.query(
          `UPDATE invitations SET status = 'accepted' WHERE id = $1 AND status = 'pending'`,
          [invitation.id],
        );
        // TypeORM returns [rows, affectedCount] for an UPDATE query.
        const affected = Array.isArray(updateResult) ? updateResult[1] : undefined;
        if (affected !== 1) {
          throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
        }
      } else {
        // No invite token and not first user → registration closed
        throw new AppLogicException('FORBIDDEN', HttpStatus.FORBIDDEN);
      }

      const user = manager.create(User, {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role,
        isActive: true,
      });
      return manager.save(user);
    });

    const tokens = await this.generateTokens(saved);
    return {
      user: this.sanitizeUser(saved),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne();
    if (!user) {
      // Constant-time: still run bcrypt to prevent timing-based user enumeration
      await bcrypt.compare(dto.password, '$2b$12$000000000000000000000000000000000000000000000000000000');
      throw new AppLogicException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    if (!user.isActive) {
      throw new AppLogicException('ACCOUNT_DEACTIVATED', HttpStatus.FORBIDDEN);
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new AppLogicException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshTokenValue: string) {
    const hashedToken = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');

    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { token: hashedToken },
    });

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new AppLogicException('TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
    }

    // Atomic revocation — use updateResult to prevent race condition
    const updateResult = await this.refreshTokenRepo.update(
      { id: tokenRecord.id, isRevoked: false },
      { isRevoked: true },
    );

    // If no rows updated, another request already revoked this token
    if (updateResult.affected === 0) {
      throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userRepo.findOne({ where: { id: tokenRecord.userId } });
    if (!user || !user.isActive) {
      throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
    }

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  async logout(refreshTokenValue: string) {
    const hashedToken = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { token: hashedToken },
    });
    if (tokenRecord) {
      tokenRecord.isRevoked = true;
      await this.refreshTokenRepo.save(tokenRecord);
    }
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.sanitizeUser(user);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    const saved = await this.userRepo.save(user);
    return this.sanitizeUser(saved);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AppLogicException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.tokenVersion += 1;
    await this.userRepo.save(user);

    // Revoke all refresh tokens for this user
    await this.refreshTokenRepo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  async forgotPassword(email: string) {
    // Always return success for security (don't reveal if email exists)
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect(['user.passwordResetToken', 'user.passwordResetExpires'])
      .where('user.email = :email', { email })
      .getOne();
    if (!user) return;

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userRepo.save(user);

    await this.emailService.sendPasswordReset(email, resetToken);
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect(['user.passwordResetToken', 'user.passwordResetExpires'])
      .where('user.passwordResetToken = :hashedToken', { hashedToken })
      .getOne();

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new AppLogicException('TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.tokenVersion += 1;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await this.userRepo.save(user);

    // Revoke all refresh tokens
    await this.refreshTokenRepo.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );
  }

  async getInviteInfo(token: string) {
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
    return { email: invitation.email, role: invitation.role };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { id: payload.userId } });
    if (!user || !user.isActive) return null;
    if (user.tokenVersion !== payload.tokenVersion) return null;
    return user;
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwtService.sign(
      { ...payload } as Record<string, unknown>,
      { expiresIn: this.configService.get<string>('ACCESS_TOKEN_EXPIRY', '15m') as any },
    );

    const refreshTokenValue = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const hashedRefreshToken = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
    const refreshToken = this.refreshTokenRepo.create({
      userId: user.id,
      token: hashedRefreshToken,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshToken);

    return { accessToken, refreshToken: refreshTokenValue };
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
