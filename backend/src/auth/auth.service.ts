import { Injectable, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Invitation } from './entities/invitation.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
  }

  private async seedAdmin(): Promise<void> {
    const userCount = await this.userRepo.count();
    if (userCount > 0) return;

    const email = this.configService.get<string>('ADMIN_EMAIL');
    const password = this.configService.get<string>('ADMIN_PASSWORD');

    if (!email || !password) {
      console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set for first run');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = this.userRepo.create({
      email,
      passwordHash,
      displayName: 'Admin',
      role: 'admin',
      isActive: true,
    });
    await this.userRepo.save(admin);
    console.log(`Admin account created: ${email}`);
  }

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new AppLogicException('EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT);
    }

    let role: User['role'] = 'member';

    if (dto.inviteToken) {
      const invitation = await this.invitationRepo.findOne({
        where: { token: dto.inviteToken, status: 'pending' },
      });
      if (!invitation) {
        throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
      }
      if (new Date() > invitation.expiresAt) {
        invitation.status = 'expired';
        await this.invitationRepo.save(invitation);
        throw new AppLogicException('INVITATION_EXPIRED', HttpStatus.BAD_REQUEST);
      }
      role = invitation.role;
      invitation.status = 'accepted';
      await this.invitationRepo.save(invitation);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      role,
      isActive: true,
    });
    const saved = await this.userRepo.save(user);

    const tokens = await this.generateTokens(saved);
    return {
      user: this.sanitizeUser(saved),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
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
    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { token: refreshTokenValue },
    });

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new AppLogicException('TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
    }

    // Revoke old token (rotation)
    tokenRecord.isRevoked = true;
    await this.refreshTokenRepo.save(tokenRecord);

    const user = await this.userRepo.findOne({ where: { id: tokenRecord.userId } });
    if (!user || !user.isActive) {
      throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
    }

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  async logout(refreshTokenValue: string) {
    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { token: refreshTokenValue },
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
    const user = await this.userRepo.findOne({ where: { id: userId } });
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
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) return;

    // TODO: Send reset email when SMTP is configured
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log(`Password reset token for ${email}: ${resetToken}`);
  }

  async resetPassword(token: string, newPassword: string) {
    // TODO: Implement token storage and validation
    // For now, this is a placeholder
    throw new AppLogicException('TOKEN_INVALID', HttpStatus.UNAUTHORIZED);
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

    const refreshToken = this.refreshTokenRepo.create({
      userId: user.id,
      token: refreshTokenValue,
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
