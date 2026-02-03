import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Tenant>> {
    const { page, limit, sort, order } = params;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      this.prisma.tenant.count(),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Автосервис не найден');
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Автосервис не найден');
    return tenant;
  }

  async create(data: { name: string; slug: string; plan?: string; settings?: any }): Promise<Tenant> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictException('Автосервис с таким slug уже существует');

    return this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        plan: data.plan ?? 'basic',
        settings: data.settings ?? {},
      },
    });
  }

  async update(id: string, data: { name?: string; slug?: string; plan?: string; settings?: any; isActive?: boolean }): Promise<Tenant> {
    await this.findById(id);

    if (data.slug) {
      const existing = await this.prisma.tenant.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (existing) throw new ConflictException('Автосервис с таким slug уже существует');
    }

    return this.prisma.tenant.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.tenant.delete({ where: { id } });
  }
}
