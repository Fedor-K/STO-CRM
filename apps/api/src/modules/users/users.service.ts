import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

type UserWithoutPassword = Omit<User, 'passwordHash'>;

const userSelect = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: { page: number; limit: number; sort: string; order: 'asc' | 'desc'; role?: UserRole },
  ): Promise<PaginatedResponse<UserWithoutPassword>> {
    const { page, limit, sort, order, role } = params;
    const skip = (page - 1) * limit;
    const where = { tenantId, ...(role ? { role } : {}) };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: userSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data as UserWithoutPassword[], total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<UserWithoutPassword> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user as UserWithoutPassword;
  }

  async create(
    tenantId: string,
    data: {
      email: string;
      password: string;
      role: UserRole;
      firstName: string;
      lastName: string;
      phone?: string;
    },
  ): Promise<UserWithoutPassword> {
    const existing = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: data.email, tenantId } },
    });
    if (existing) throw new ConflictException('Пользователь с таким email уже существует');

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        tenantId,
      },
      select: userSelect,
    });

    return user as UserWithoutPassword;
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      email?: string;
      role?: UserRole;
      firstName?: string;
      lastName?: string;
      phone?: string;
      isActive?: boolean;
    },
  ): Promise<UserWithoutPassword> {
    await this.findById(tenantId, id);

    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, tenantId, NOT: { id } },
      });
      if (existing) throw new ConflictException('Пользователь с таким email уже существует');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });

    return user as UserWithoutPassword;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.user.delete({ where: { id } });
  }
}
