import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { WorkOrderStatus } from '@prisma/client';

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
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true, vin: true } },
  serviceBay: { select: { id: true, name: true, type: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
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
  serviceBay: { select: { id: true, name: true } },
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
      serviceBayId?: string;
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
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });

      const nextNumber = (lastOrder?.orderNumber ?? 0) + 1;

      const workOrder = await tx.workOrder.create({
        data: {
          orderNumber: nextNumber,
          status: 'NEW',
          tenantId,
          clientId: data.clientId,
          vehicleId: data.vehicleId,
          advisorId: data.advisorId,
          mechanicId: data.mechanicId,
          repairTypeId: data.repairTypeId,
          serviceBayId: data.serviceBayId,
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
        serviceBay: true,
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
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });

      const nextNumber = (lastOrder?.orderNumber ?? 0) + 1;

      const wo = await tx.workOrder.create({
        data: {
          orderNumber: nextNumber,
          status: 'NEW',
          tenantId,
          clientId: appointment.clientId,
          vehicleId: appointment.vehicleId,
          advisorId: appointment.advisorId,
          serviceBayId: appointment.serviceBayId,
          appointmentId: appointment.id,
          clientComplaints: appointment.notes,
          totalLabor: 0,
          totalParts: 0,
          totalAmount: 0,
        },
        include: workOrderInclude,
      });

      // Update appointment status to IN_PROGRESS
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: 'IN_PROGRESS' },
      });

      return wo;
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
      serviceBayId?: string;
      clientComplaints?: string;
      diagnosticNotes?: string;
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

    await this.prisma.workOrder.delete({ where: { id } });
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
      },
    });

    await this.recalcTotals(workOrderId);
    return item;
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
