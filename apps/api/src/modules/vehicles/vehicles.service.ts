import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Vehicle } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      search?: string;
      clientId?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, sort, order, search, clientId } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (clientId) where.clientId = clientId;
    if (search) {
      where.OR = [
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { licensePlate: { contains: search, mode: 'insensitive' } },
        { vin: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<any> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        workOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Автомобиль не найден');
    return vehicle;
  }

  async create(
    tenantId: string,
    data: {
      make: string;
      model: string;
      year?: number;
      vin?: string;
      licensePlate?: string;
      color?: string;
      mileage?: number;
      clientId: string;
    },
  ): Promise<Vehicle> {
    return this.prisma.vehicle.create({
      data: { ...data, tenantId },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      make?: string;
      model?: string;
      year?: number;
      vin?: string;
      licensePlate?: string;
      color?: string;
      mileage?: number;
    },
  ): Promise<Vehicle> {
    await this.findById(tenantId, id);
    return this.prisma.vehicle.update({ where: { id }, data });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.vehicle.delete({ where: { id } });
  }
}
