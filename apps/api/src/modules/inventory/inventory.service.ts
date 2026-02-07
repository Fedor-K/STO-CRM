import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { StockMovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Warehouses =====

  async findAllWarehouses(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(tenantId: string, data: { name: string; code?: string; address?: string }) {
    return this.prisma.warehouse.create({
      data: { ...data, tenantId },
    });
  }

  async updateWarehouse(tenantId: string, id: string, data: { name?: string; code?: string; address?: string; isActive?: boolean }) {
    const wh = await this.prisma.warehouse.findFirst({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Склад не найден');
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  // ===== Warehouse Stock (inventory levels) =====

  async getStock(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      search?: string;
      warehouseId?: string;
      lowStock?: boolean;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, search, warehouseId, lowStock } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      part: { tenantId },
      quantity: { gt: 0 },
    };
    if (warehouseId) where.warehouseId = warehouseId;
    if (search) {
      where.part = {
        ...where.part,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { manufacturer: { contains: search, mode: 'insensitive' } },
          { oemNumber: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.warehouseStock.findMany({
        where,
        include: {
          part: { select: { id: true, name: true, sku: true, brand: true, manufacturer: true, oemNumber: true, unit: true, costPrice: true, sellPrice: true, minStock: true, code1C: true } },
          warehouse: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { part: { name: 'asc' } },
      }),
      this.prisma.warehouseStock.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      partId: r.partId,
      warehouseId: r.warehouseId,
      quantity: r.quantity,
      reserved: r.reserved,
      available: r.quantity - r.reserved,
      part: r.part,
      warehouse: r.warehouse,
    }));

    // Filter low stock after mapping if needed
    const filtered = lowStock
      ? data.filter((d) => d.quantity <= (d.part.minStock ?? 0))
      : data;

    return paginate(lowStock ? filtered : data, total, page, limit);
  }

  // Aggregated stock per part (sum across all warehouses)
  async getStockSummary(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      warehouseId?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, search, warehouseId } = params;
    const skip = (page - 1) * limit;

    const partWhere: any = { tenantId, isActive: true };
    if (search) {
      partWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { oemNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const stockFilter: any = warehouseId ? { some: { warehouseId } } : { some: { quantity: { gt: 0 } } };
    partWhere.warehouseStock = stockFilter;

    const [parts, total] = await Promise.all([
      this.prisma.part.findMany({
        where: partWhere,
        include: {
          warehouseStock: {
            include: { warehouse: { select: { id: true, name: true } } },
            ...(warehouseId ? { where: { warehouseId } } : {}),
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.part.count({ where: partWhere }),
    ]);

    const data = parts.map((p) => {
      const totalQty = p.warehouseStock.reduce((s, ws) => s + ws.quantity, 0);
      const totalReserved = p.warehouseStock.reduce((s, ws) => s + ws.reserved, 0);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        manufacturer: p.manufacturer,
        oemNumber: p.oemNumber,
        unit: p.unit,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        minStock: p.minStock,
        code1C: p.code1C,
        totalQuantity: totalQty,
        totalReserved: totalReserved,
        available: totalQty - totalReserved,
        warehouses: p.warehouseStock.map((ws) => ({
          warehouseId: ws.warehouseId,
          warehouseName: ws.warehouse.name,
          quantity: ws.quantity,
          reserved: ws.reserved,
        })),
      };
    });

    return paginate(data, total, page, limit);
  }

  // ===== Stock Movements =====

  async addMovement(
    tenantId: string,
    data: {
      partId: string;
      warehouseId: string;
      type: StockMovementType;
      quantity: number;
      reference?: string;
      referenceId?: string;
      notes?: string;
      userId?: string;
    },
  ) {
    // Validate part belongs to tenant
    const part = await this.prisma.part.findFirst({ where: { id: data.partId, tenantId } });
    if (!part) throw new NotFoundException('Запчасть не найдена');

    const wh = await this.prisma.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } });
    if (!wh) throw new NotFoundException('Склад не найден');

    return this.prisma.$transaction(async (tx) => {
      // Create movement record
      const movement = await tx.stockMovement.create({
        data: {
          type: data.type,
          quantity: data.quantity,
          reference: data.reference,
          referenceId: data.referenceId,
          notes: data.notes,
          userId: data.userId,
          partId: data.partId,
          warehouseId: data.warehouseId,
        },
      });

      // Update warehouse stock
      const delta = this.getQuantityDelta(data.type, data.quantity);
      const reserveDelta = this.getReserveDelta(data.type, data.quantity);

      await tx.warehouseStock.upsert({
        where: {
          partId_warehouseId: {
            partId: data.partId,
            warehouseId: data.warehouseId,
          },
        },
        create: {
          partId: data.partId,
          warehouseId: data.warehouseId,
          quantity: Math.max(0, delta),
          reserved: Math.max(0, reserveDelta),
        },
        update: {
          quantity: { increment: delta },
          reserved: { increment: reserveDelta },
        },
      });

      // Update part.currentStock (aggregate)
      await this.syncPartCurrentStock(tx, data.partId);

      return movement;
    });
  }

  async getMovements(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      partId?: string;
      warehouseId?: string;
      type?: StockMovementType;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, partId, warehouseId, type } = params;
    const skip = (page - 1) * limit;

    const where: any = { part: { tenantId } };
    if (partId) where.partId = partId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          part: { select: { id: true, name: true, sku: true, unit: true } },
          warehouse: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  // ===== Stock operations =====

  async receiveStock(
    tenantId: string,
    data: {
      warehouseId: string;
      items: Array<{ partId: string; quantity: number; notes?: string }>;
      reference?: string;
      userId?: string;
    },
  ) {
    const results = [];
    for (const item of data.items) {
      const m = await this.addMovement(tenantId, {
        partId: item.partId,
        warehouseId: data.warehouseId,
        type: 'PURCHASE',
        quantity: item.quantity,
        reference: data.reference,
        notes: item.notes,
        userId: data.userId,
      });
      results.push(m);
    }
    return results;
  }

  async adjustStock(
    tenantId: string,
    data: {
      partId: string;
      warehouseId: string;
      newQuantity: number;
      notes?: string;
      userId?: string;
    },
  ) {
    const ws = await this.prisma.warehouseStock.findUnique({
      where: { partId_warehouseId: { partId: data.partId, warehouseId: data.warehouseId } },
    });
    const currentQty = ws?.quantity ?? 0;
    const diff = data.newQuantity - currentQty;
    if (diff === 0) return null;

    return this.addMovement(tenantId, {
      partId: data.partId,
      warehouseId: data.warehouseId,
      type: 'ADJUSTMENT',
      quantity: diff,
      notes: data.notes ?? `Корректировка: ${currentQty} → ${data.newQuantity}`,
      userId: data.userId,
    });
  }

  async transferStock(
    tenantId: string,
    data: {
      partId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      notes?: string;
      userId?: string;
    },
  ) {
    // Validate enough stock in source
    const ws = await this.prisma.warehouseStock.findUnique({
      where: { partId_warehouseId: { partId: data.partId, warehouseId: data.fromWarehouseId } },
    });
    const available = (ws?.quantity ?? 0) - (ws?.reserved ?? 0);
    if (available < data.quantity) {
      throw new BadRequestException(`Недостаточно свободного остатка (доступно: ${available})`);
    }

    const outMovement = await this.addMovement(tenantId, {
      partId: data.partId,
      warehouseId: data.fromWarehouseId,
      type: 'TRANSFER_OUT',
      quantity: data.quantity,
      notes: data.notes,
      userId: data.userId,
    });

    const inMovement = await this.addMovement(tenantId, {
      partId: data.partId,
      warehouseId: data.toWarehouseId,
      type: 'TRANSFER_IN',
      quantity: data.quantity,
      notes: data.notes,
      userId: data.userId,
    });

    return { out: outMovement, in: inMovement };
  }

  // ===== Helpers =====

  private getQuantityDelta(type: StockMovementType, quantity: number): number {
    switch (type) {
      case 'PURCHASE':
      case 'RETURN':
      case 'TRANSFER_IN':
        return quantity;
      case 'CONSUMPTION':
      case 'TRANSFER_OUT':
        return -quantity;
      case 'ADJUSTMENT':
        return quantity; // can be negative
      case 'RESERVED':
      case 'UNRESERVED':
        return 0; // reserve doesn't change total quantity
      default:
        return 0;
    }
  }

  private getReserveDelta(type: StockMovementType, quantity: number): number {
    switch (type) {
      case 'RESERVED':
        return quantity;
      case 'UNRESERVED':
      case 'CONSUMPTION': // consuming reserved stock
        return -quantity;
      default:
        return 0;
    }
  }

  private async syncPartCurrentStock(tx: any, partId: string) {
    const agg = await tx.warehouseStock.aggregate({
      where: { partId },
      _sum: { quantity: true },
    });
    await tx.part.update({
      where: { id: partId },
      data: { currentStock: agg._sum.quantity ?? 0 },
    });
  }
}
