import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Part } from '@prisma/client';

@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      search?: string;
      isActive?: boolean;
    },
  ): Promise<PaginatedResponse<Part>> {
    const { page, limit, sort, order, search, isActive } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { oemNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.part.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      this.prisma.part.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<Part> {
    const part = await this.prisma.part.findFirst({
      where: { id, tenantId },
    });
    if (!part) throw new NotFoundException('Запчасть не найдена');
    return part;
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      sku?: string;
      brand?: string;
      oemNumber?: string;
      costPrice: number;
      sellPrice: number;
      currentStock?: number;
      minStock?: number;
      unit?: string;
    },
  ): Promise<Part> {
    return this.prisma.part.create({
      data: {
        name: data.name,
        sku: data.sku,
        brand: data.brand,
        oemNumber: data.oemNumber,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        currentStock: data.currentStock ?? 0,
        minStock: data.minStock ?? 0,
        unit: data.unit ?? 'шт',
        tenantId,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      sku?: string;
      brand?: string;
      oemNumber?: string;
      costPrice?: number;
      sellPrice?: number;
      currentStock?: number;
      minStock?: number;
      unit?: string;
      isActive?: boolean;
    },
  ): Promise<Part> {
    await this.findById(tenantId, id);
    return this.prisma.part.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.part.delete({ where: { id } });
  }
}
