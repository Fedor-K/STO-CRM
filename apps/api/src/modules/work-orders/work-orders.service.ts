import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { WorkOrderStatus } from '@prisma/client';

function parseWONumber(orderNumber: string): number {
  const match = orderNumber.match(/WO-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatWONumber(seq: number): string {
  return `WO-${String(seq).padStart(5, '0')}`;
}

const WORK_ORDER_TRANSITIONS: Record<string, string[]> = {
  NEW: ['DIAGNOSED', 'CANCELLED'],
  DIAGNOSED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['INVOICED'],
  INVOICED: ['PAID'],
  PAID: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

const workOrderInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  advisor: { select: { id: true, firstName: true, lastName: true } },
  mechanic: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true, vin: true, mileage: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      mechanics: {
        include: {
          mechanic: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
  workLogs: {
    include: {
      mechanic: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { logDate: 'desc' as const },
  },
};

const workOrderListInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  mechanic: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
  _count: { select: { items: true } },
};

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      status?: WorkOrderStatus;
      mechanicId?: string;
      clientId?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, sort, order, status, mechanicId, clientId } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (mechanicId) where.mechanicId = mechanicId;
    if (clientId) where.clientId = clientId;

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: workOrderListInclude,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async getKanban(tenantId: string): Promise<Record<string, any[]>> {
    const statuses: WorkOrderStatus[] = [
      'NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS',
      'PAUSED', 'COMPLETED', 'INVOICED', 'PAID',
    ] as WorkOrderStatus[];

    const orders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        status: { in: statuses },
      },
      include: workOrderListInclude,
      orderBy: { createdAt: 'asc' },
    });

    const result: Record<string, any[]> = {};
    for (const s of statuses) {
      result[s] = [];
    }
    for (const order of orders) {
      result[order.status]?.push(order);
    }

    return result;
  }

  async findMyOrders(
    tenantId: string,
    mechanicId: string,
    params: { page: number; limit: number },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      mechanicId,
      status: { notIn: ['CLOSED', 'CANCELLED'] as WorkOrderStatus[] },
    };

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: workOrderListInclude,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<any> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id, tenantId },
      include: workOrderInclude,
    });
    if (!workOrder) throw new NotFoundException('Заказ-наряд не найден');
    return workOrder;
  }

  async create(
    tenantId: string,
    data: {
      clientId: string;
      vehicleId: string;
      advisorId?: string;
      mechanicId?: string;
      repairTypeId?: string;
      appointmentId?: string;
      clientComplaints?: string;
      mileageAtIntake?: number;
      fuelLevel?: string;
    },
  ): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      // Get next order number for this tenant
      const lastOrder = await tx.workOrder.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });

      const nextSeq = (lastOrder ? parseWONumber(lastOrder.orderNumber) : 0) + 1;

      const workOrder = await tx.workOrder.create({
        data: {
          orderNumber: formatWONumber(nextSeq),
          status: 'NEW',
          tenantId,
          clientId: data.clientId,
          vehicleId: data.vehicleId,
          advisorId: data.advisorId,
          mechanicId: data.mechanicId,
          repairTypeId: data.repairTypeId,
          appointmentId: data.appointmentId,
          clientComplaints: data.clientComplaints,
          mileageAtIntake: data.mileageAtIntake,
          fuelLevel: data.fuelLevel,
          totalLabor: 0,
          totalParts: 0,
          totalAmount: 0,
        },
        include: workOrderInclude,
      });

      return workOrder;
    });
  }

  async createFromAppointment(
    tenantId: string,
    appointmentId: string,
  ): Promise<any> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        client: true,
        vehicle: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Запись не найдена');
    }

    // Check if work order already exists for this appointment
    const existing = await this.prisma.workOrder.findFirst({
      where: { appointmentId, tenantId },
    });
    if (existing) {
      throw new BadRequestException('Заказ-наряд уже создан для этой записи');
    }

    const workOrder = await this.prisma.$transaction(async (tx) => {
      const lastOrder = await tx.workOrder.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });

      const nextSeq = (lastOrder ? parseWONumber(lastOrder.orderNumber) : 0) + 1;

      const wo = await tx.workOrder.create({
        data: {
          orderNumber: formatWONumber(nextSeq),
          status: 'DIAGNOSED',
          tenantId,
          clientId: appointment.clientId,
          vehicleId: appointment.vehicleId,
          advisorId: appointment.advisorId,
          appointmentId: appointment.id,
          clientComplaints: appointment.notes,
          totalLabor: 0,
          totalParts: 0,
          totalAmount: 0,
        },
      });

      // Create WorkOrderItems from plannedItems
      const plannedItems = (appointment.plannedItems as any[]) || [];
      let totalLabor = 0;
      let totalParts = 0;

      for (const item of plannedItems) {
        const totalPrice = (item.unitPrice || 0) * (item.quantity || 1);
        await tx.workOrderItem.create({
          data: {
            workOrderId: wo.id,
            type: item.type === 'PART' ? 'PART' : 'LABOR',
            description: item.description || '',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalPrice,
            normHours: item.normHours ?? null,
            serviceId: item.serviceId ?? null,
            partId: item.partId ?? null,
          },
        });
        if (item.type === 'PART') {
          totalParts += totalPrice;
        } else {
          totalLabor += totalPrice;
        }
      }

      // Update totals
      if (plannedItems.length > 0) {
        await tx.workOrder.update({
          where: { id: wo.id },
          data: {
            totalLabor,
            totalParts,
            totalAmount: totalLabor + totalParts,
          },
        });
      }

      // Update appointment status to IN_PROGRESS
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'IN_PROGRESS' },
      });

      return tx.workOrder.findFirst({
        where: { id: wo.id },
        include: workOrderInclude,
      });
    });

    return workOrder;
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      mechanicId?: string;
      advisorId?: string;
      repairTypeId?: string;
      clientComplaints?: string;
      diagnosticNotes?: string;
      inspectionChecklist?: any;
    },
  ): Promise<any> {
    await this.findById(tenantId, id);
    return this.prisma.workOrder.update({
      where: { id },
      data,
      include: workOrderInclude,
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    newStatus: WorkOrderStatus,
  ): Promise<any> {
    const workOrder = await this.findById(tenantId, id);

    const allowed = WORK_ORDER_TRANSITIONS[workOrder.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Невозможно перевести заказ-наряд из статуса "${workOrder.status}" в "${newStatus}"`,
      );
    }

    // Требуем механика для любого перехода вперёд (кроме отмены)
    const MECHANIC_REQUIRED_STATUSES = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'];
    if (
      MECHANIC_REQUIRED_STATUSES.includes(workOrder.status) &&
      newStatus !== 'CANCELLED' &&
      !workOrder.mechanicId
    ) {
      throw new BadRequestException(
        'Назначьте механика перед переводом заказ-наряда',
      );
    }

    return this.prisma.workOrder.update({
      where: { id },
      data: { status: newStatus },
      include: workOrderInclude,
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const workOrder = await this.findById(tenantId, id);

    if (workOrder.status !== 'NEW') {
      throw new BadRequestException(
        'Удалить можно только заказ-наряд в статусе "Новый"',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // If WO was created from appointment, reset appointment status
      if (workOrder.appointmentId) {
        await tx.appointment.update({
          where: { id: workOrder.appointmentId },
          data: { status: 'CONFIRMED' },
        });
      }
      await tx.workOrder.delete({ where: { id } });
    });
  }

  // --- Items ---

  async addItem(
    tenantId: string,
    workOrderId: string,
    data: {
      type: 'LABOR' | 'PART';
      description: string;
      quantity: number;
      unitPrice: number;
      normHours?: number;
      serviceId?: string;
      partId?: string;
      recommended?: boolean;
      mechanicId?: string;
    },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const totalPrice = data.quantity * data.unitPrice;

    const item = await this.prisma.workOrderItem.create({
      data: {
        workOrderId,
        type: data.type,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalPrice,
        normHours: data.normHours,
        serviceId: data.serviceId,
        partId: data.partId,
        recommended: data.recommended ?? false,
      },
      include: {
        mechanics: {
          include: {
            mechanic: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    // If mechanicId was passed, create pivot record
    if (data.mechanicId) {
      await this.prisma.workOrderItemMechanic.create({
        data: {
          workOrderItemId: item.id,
          mechanicId: data.mechanicId,
          contributionPercent: 100,
        },
      });
    }

    await this.recalcTotals(workOrderId);

    // Re-fetch with includes to return full data
    return this.prisma.workOrderItem.findUnique({
      where: { id: item.id },
      include: {
        mechanics: {
          include: {
            mechanic: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  async updateItem(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    data: {
      description?: string;
      quantity?: number;
      unitPrice?: number;
      normHours?: number;
      approvedByClient?: boolean;
    },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const existing = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
    });
    if (!existing) throw new NotFoundException('Позиция не найдена');

    const quantity = data.quantity ?? Number(existing.quantity);
    const unitPrice = data.unitPrice ?? Number(existing.unitPrice);
    const totalPrice = quantity * unitPrice;

    const item = await this.prisma.workOrderItem.update({
      where: { id: itemId },
      data: {
        ...data,
        totalPrice,
      },
      include: {
        mechanics: {
          include: {
            mechanic: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.recalcTotals(workOrderId);
    return item;
  }

  async deleteItem(
    tenantId: string,
    workOrderId: string,
    itemId: string,
  ): Promise<void> {
    await this.findById(tenantId, workOrderId);

    const existing = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
    });
    if (!existing) throw new NotFoundException('Позиция не найдена');

    await this.prisma.workOrderItem.delete({ where: { id: itemId } });
    await this.recalcTotals(workOrderId);
  }

  // --- Item Mechanics ---

  async addItemMechanic(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    data: { mechanicId: string; contributionPercent?: number },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
    });
    if (!item) throw new NotFoundException('Позиция не найдена');

    return this.prisma.workOrderItemMechanic.create({
      data: {
        workOrderItemId: itemId,
        mechanicId: data.mechanicId,
        contributionPercent: data.contributionPercent ?? 100,
      },
      include: {
        mechanic: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateItemMechanic(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    mechanicEntryId: string,
    data: { contributionPercent: number },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const entry = await this.prisma.workOrderItemMechanic.findFirst({
      where: { id: mechanicEntryId, workOrderItemId: itemId },
    });
    if (!entry) throw new NotFoundException('Запись механика не найдена');

    return this.prisma.workOrderItemMechanic.update({
      where: { id: mechanicEntryId },
      data: { contributionPercent: data.contributionPercent },
      include: {
        mechanic: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async removeItemMechanic(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    mechanicEntryId: string,
  ): Promise<void> {
    await this.findById(tenantId, workOrderId);

    const entry = await this.prisma.workOrderItemMechanic.findFirst({
      where: { id: mechanicEntryId, workOrderItemId: itemId },
    });
    if (!entry) throw new NotFoundException('Запись механика не найдена');

    await this.prisma.workOrderItemMechanic.delete({
      where: { id: mechanicEntryId },
    });
  }

  // --- Work Logs ---

  async addWorkLog(
    tenantId: string,
    workOrderId: string,
    mechanicId: string,
    data: {
      description: string;
      hoursWorked: number;
      logDate?: string;
    },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    return this.prisma.workLog.create({
      data: {
        workOrderId,
        mechanicId,
        description: data.description,
        hoursWorked: data.hoursWorked,
        logDate: data.logDate ? new Date(data.logDate) : new Date(),
      },
      include: {
        mechanic: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // --- Private helpers ---

  private async recalcTotals(workOrderId: string): Promise<void> {
    const items = await this.prisma.workOrderItem.findMany({
      where: { workOrderId },
    });

    let totalLabor = 0;
    let totalParts = 0;

    for (const item of items) {
      // Рекомендованные считаем только если одобрены клиентом
      if (item.recommended && item.approvedByClient !== true) continue;
      const price = Number(item.totalPrice);
      if (item.type === 'LABOR') {
        totalLabor += price;
      } else {
        totalParts += price;
      }
    }

    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        totalLabor,
        totalParts,
        totalAmount: totalLabor + totalParts,
      },
    });
  }

  async findClientOrders(
    tenantId: string,
    clientId: string,
    params: { page: number; limit: number },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const where = { tenantId, clientId };

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: workOrderListInclude,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }
}
