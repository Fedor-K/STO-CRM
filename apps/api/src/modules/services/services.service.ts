import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Service, ServiceUsage } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      search?: string;
      usage?: ServiceUsage;
      isActive?: boolean;
    },
  ): Promise<PaginatedResponse<Service>> {
    const { page, limit, sort, order, search, usage, isActive } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (usage) where.serviceUsage = usage;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      this.prisma.service.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<Service> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Услуга не найдена');
    return service;
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      estimatedMinutes?: number;
      normHours?: number;
      complexityLevel?: number;
      serviceUsage?: ServiceUsage;
    },
  ): Promise<Service> {
    return this.prisma.service.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        estimatedMinutes: data.estimatedMinutes ?? 60,
        normHours: data.normHours,
        complexityLevel: data.complexityLevel ?? 1,
        serviceUsage: data.serviceUsage ?? 'BOTH',
        tenantId,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      description?: string;
      price?: number;
      estimatedMinutes?: number;
      normHours?: number;
      complexityLevel?: number;
      serviceUsage?: ServiceUsage;
      isActive?: boolean;
    },
  ): Promise<Service> {
    await this.findById(tenantId, id);
    return this.prisma.service.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.service.delete({ where: { id } });
  }
}
