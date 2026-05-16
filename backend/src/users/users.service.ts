import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
    if (id === actorId) {
      throw new AppLogicException('SELF_ROLE_CHANGE', HttpStatus.CONFLICT);
    }

    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    // Check if removing last admin
    if (user.role === 'admin' && newRole !== 'admin') {
      const adminCount = await this.userRepo.count({
        where: { role: 'admin', isActive: true },
      });
      if (adminCount <= 1) {
        throw new AppLogicException('LAST_ADMIN', HttpStatus.CONFLICT);
      }
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
}
