import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { ServiceBay } from '@prisma/client';

@Injectable()
export class ServiceBaysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: { page: number; limit: number; sort: string; order: 'asc' | 'desc'; isActive?: boolean },
  ): Promise<PaginatedResponse<ServiceBay>> {
    const { page, limit, sort, order, isActive } = params;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.serviceBay.findMany({ where, skip, take: limit, orderBy: { [sort]: order } }),
      this.prisma.serviceBay.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<ServiceBay> {
    const bay = await this.prisma.serviceBay.findFirst({ where: { id, tenantId } });
    if (!bay) throw new NotFoundException('Рабочий пост не найден');
    return bay;
  }

  async create(tenantId: string, data: { name: string; type?: string }): Promise<ServiceBay> {
    return this.prisma.serviceBay.create({
      data: { name: data.name, type: data.type, tenantId },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; type?: string; isActive?: boolean },
  ): Promise<ServiceBay> {
    await this.findById(tenantId, id);
    return this.prisma.serviceBay.update({ where: { id }, data });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.serviceBay.delete({ where: { id } });
  }
}
