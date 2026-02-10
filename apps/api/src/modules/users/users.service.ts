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
  middleName: true,
  dateOfBirth: true,
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
    params: { page: number; limit: number; sort: string; order: 'asc' | 'desc'; role?: UserRole; excludeRole?: UserRole; search?: string },
  ): Promise<PaginatedResponse<UserWithoutPassword>> {
    const { page, limit, sort, order, role, excludeRole, search } = params;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (role) {
      where.role = role;
    } else if (excludeRole) {
      where.role = { not: excludeRole };
    }
    if (search) {
      const words = search.trim().split(/\s+/);
      const nameFields = ['firstName', 'lastName', 'middleName'];
      if (words.length > 1) {
        // "Олег Уваров" → каждое слово должно быть в каком-то из ФИО-полей
        where.AND = words.map(word => ({
          OR: nameFields.map(f => ({ [f]: { contains: word, mode: 'insensitive' } })),
        }));
      } else {
        where.OR = [
          ...nameFields.map(f => ({ [f]: { contains: search, mode: 'insensitive' } })),
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

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
      lastName?: string;
      middleName?: string;
      dateOfBirth?: string;
      phone?: string;
    },
  ): Promise<UserWithoutPassword> {
    const existing = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: data.email, tenantId } },
    });
    if (existing) throw new ConflictException('Пользователь с таким email уже существует');

    if (data.phone) {
      const phoneExists = await this.prisma.user.findFirst({
        where: { phone: data.phone, tenantId },
      });
      if (phoneExists) throw new ConflictException('Клиент с таким номером телефона уже существует');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName || '',
        middleName: data.middleName,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
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
      middleName?: string;
      dateOfBirth?: string;
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

    if (data.phone) {
      const phoneExists = await this.prisma.user.findFirst({
        where: { phone: data.phone, tenantId, NOT: { id } },
      });
      if (phoneExists) throw new ConflictException('Клиент с таким номером телефона уже существует');
    }

    const { dateOfBirth, ...rest } = data;
    const updateData: any = { ...rest };
    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });

    return user as UserWithoutPassword;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.user.delete({ where: { id } });
  }
}
