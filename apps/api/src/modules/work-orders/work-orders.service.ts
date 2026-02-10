import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { WorkOrderStatus } from '@prisma/client';

function parseWONumber(orderNumber: string): number {
  const match = orderNumber.match(/WO-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatWONumber(seq: number): string {
  return `WO-${String(seq).padStart(5, '0')}`;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Новый',
  DIAGNOSED: 'Диагностика',
  APPROVED: 'Согласован',
  IN_PROGRESS: 'В работе',
  PAUSED: 'Пауза',
  COMPLETED: 'Выполнен',
  INVOICED: 'Счёт выставлен',
  PAID: 'Оплачен',
  CLOSED: 'Закрыт',
  CANCELLED: 'Отменён',
};

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
      part: {
        select: {
          id: true,
          name: true,
          sku: true,
          manufacturer: true,
          unit: true,
          currentStock: true,
          warehouseStock: {
            include: { warehouse: { select: { id: true, name: true } } },
          },
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
  activities: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

const workOrderListInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  mechanic: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true, mileage: true } },
  _count: { select: { items: true } },
};

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

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
      search?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, sort, order, status, mechanicId, clientId, search } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (mechanicId) where.mechanicId = mechanicId;
    if (clientId) where.clientId = clientId;
    if (search) {
      const s = search.trim();
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { client: { firstName: { contains: s, mode: 'insensitive' } } },
        { client: { lastName: { contains: s, mode: 'insensitive' } } },
        { vehicle: { licensePlate: { contains: s, mode: 'insensitive' } } },
        { vehicle: { make: { contains: s, mode: 'insensitive' } } },
        { vehicle: { model: { contains: s, mode: 'insensitive' } } },
      ];
    }

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
    userId?: string,
  ): Promise<any> {
    const workOrder = await this.prisma.$transaction(async (tx) => {
      // Get next order number for this tenant
      const lastOrder = await tx.workOrder.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });

      const nextSeq = (lastOrder ? parseWONumber(lastOrder.orderNumber) : 0) + 1;

      return tx.workOrder.create({
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
    });

    await this.logActivity(workOrder.id, 'CREATED', 'Заказ-наряд создан', userId);
    return this.findById(tenantId, workOrder.id);
  }

  async createFromAppointment(
    tenantId: string,
    appointmentId: string,
    userId?: string,
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

    if (workOrder) {
      await this.logActivity(workOrder.id, 'CREATED', 'Создан из записи', userId);
      // Reserve stock for PART items
      for (const item of (workOrder.items || [])) {
        if (item.type === 'PART' && item.partId) {
          await this.reservePartStock(
            tenantId, workOrder.orderNumber, item.id, item.partId,
            Number(item.quantity), userId,
          );
        }
      }
      return this.findById(tenantId, workOrder.id);
    }

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
      reminderAt?: string;
    },
    userId?: string,
  ): Promise<any> {
    const old = await this.findById(tenantId, id);
    const updatePayload: any = { ...data };
    if (data.reminderAt) updatePayload.reminderAt = new Date(data.reminderAt);
    const result = await this.prisma.workOrder.update({
      where: { id },
      data: updatePayload,
      include: workOrderInclude,
    });

    // Log field changes
    if (data.mechanicId !== undefined && data.mechanicId !== old.mechanicId) {
      const name = result.mechanic
        ? `${result.mechanic.firstName} ${result.mechanic.lastName}`
        : 'Не назначен';
      await this.logActivity(id, 'UPDATED', `Механик: ${name}`, userId, {
        field: 'mechanicId',
        from: old.mechanicId,
        to: data.mechanicId,
      });

      // Auto-assign new mechanic to labor items that have no mechanic
      if (data.mechanicId) {
        const laborItems = await this.prisma.workOrderItem.findMany({
          where: { workOrderId: id, type: 'LABOR' },
          include: { mechanics: true },
        });
        for (const item of laborItems) {
          if (item.mechanics.length === 0) {
            await this.prisma.workOrderItemMechanic.create({
              data: {
                workOrderItemId: item.id,
                mechanicId: data.mechanicId,
                contributionPercent: 100,
              },
            });
          }
        }
      }
    }
    if (data.advisorId !== undefined && data.advisorId !== old.advisorId) {
      const name = result.advisor
        ? `${result.advisor.firstName} ${result.advisor.lastName}`
        : 'Не назначен';
      await this.logActivity(id, 'UPDATED', `Приёмщик: ${name}`, userId, {
        field: 'advisorId',
        from: old.advisorId,
        to: data.advisorId,
      });
    }
    if (data.diagnosticNotes !== undefined && data.diagnosticNotes !== old.diagnosticNotes) {
      await this.logActivity(id, 'UPDATED', 'Обновлены заметки диагностики', userId);
    }
    if (data.inspectionChecklist !== undefined) {
      await this.logActivity(id, 'UPDATED', 'Обновлён лист осмотра', userId);
    }

    return this.findById(tenantId, id);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    newStatus: WorkOrderStatus,
    userId?: string,
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

    // Требуем завершения всех логов работ перед переводом в COMPLETED
    if (newStatus === 'COMPLETED') {
      const laborItems = (workOrder.items || []).filter(
        (i: any) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true),
      );
      const workLogsCount = (workOrder.workLogs || []).length;
      if (workLogsCount < laborItems.length) {
        throw new BadRequestException(
          'Отметьте все работы как выполненные в Логах работ перед переводом в "Готов"',
        );
      }
    }

    const oldStatus = workOrder.status;
    const updateData: any = { status: newStatus };
    if (newStatus === 'DIAGNOSED') {
      updateData.reminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (oldStatus === 'DIAGNOSED') {
      updateData.reminderAt = null;
    }
    const result = await this.prisma.workOrder.update({
      where: { id },
      data: updateData,
      include: workOrderInclude,
    });

    // Inventory: consume stock on COMPLETED, unreserve on CANCELLED
    if (newStatus === 'COMPLETED') {
      for (const item of (workOrder.items || [])) {
        if (item.type === 'PART' && item.partId) {
          if (!item.recommended || item.approvedByClient === true) {
            await this.consumePartStock(tenantId, workOrder.orderNumber, item.id, item.partId, userId);
          }
        }
      }
    } else if (newStatus === 'CANCELLED') {
      for (const item of (workOrder.items || [])) {
        if (item.type === 'PART' && item.partId) {
          await this.unreservePartStock(tenantId, workOrder.orderNumber, item.id, item.partId, userId);
        }
      }
    }

    const fromLabel = STATUS_LABELS[oldStatus] || oldStatus;
    const toLabel = STATUS_LABELS[newStatus] || newStatus;
    await this.logActivity(id, 'STATUS_CHANGE', `Статус: ${fromLabel} → ${toLabel}`, userId, {
      from: oldStatus,
      to: newStatus,
    });

    return this.findById(tenantId, id);
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
    userId?: string,
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

    // Reserve stock for non-recommended PART items
    if (data.type === 'PART' && data.partId && !data.recommended) {
      const wo = await this.prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { orderNumber: true },
      });
      if (wo) {
        await this.reservePartStock(tenantId, wo.orderNumber, item.id, data.partId, data.quantity, userId);
      }
    }

    await this.recalcTotals(workOrderId);

    const typeLabel = data.type === 'LABOR' ? 'работа' : 'запчасть';
    await this.logActivity(workOrderId, 'ITEM_ADDED', `Добавлена ${typeLabel}: ${data.description}`, userId);

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
    userId?: string,
  ): Promise<any> {
    const wo = await this.findById(tenantId, workOrderId);

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

    // Auto-assign WO mechanic to approved recommended labor item
    if (data.approvedByClient === true && existing.type === 'LABOR' && wo.mechanicId) {
      const alreadyAssigned = await this.prisma.workOrderItemMechanic.findFirst({
        where: { workOrderItemId: itemId },
      });
      if (!alreadyAssigned) {
        await this.prisma.workOrderItemMechanic.create({
          data: {
            workOrderItemId: itemId,
            mechanicId: wo.mechanicId,
            contributionPercent: 100,
          },
        });
      }
    }

    // Adjust stock reservation for PART items
    if (existing.type === 'PART' && existing.partId) {
      if (data.approvedByClient === true && existing.recommended && existing.approvedByClient !== true) {
        // Recommended part approved → reserve stock
        const qty = data.quantity ?? Number(existing.quantity);
        await this.reservePartStock(tenantId, wo.orderNumber, itemId, existing.partId, qty, userId);
      } else if (data.approvedByClient === false && existing.recommended) {
        // Recommended part rejected → unreserve stock
        await this.unreservePartStock(tenantId, wo.orderNumber, itemId, existing.partId, userId);
      } else if (data.quantity !== undefined && data.quantity !== Number(existing.quantity)) {
        // Quantity changed on active item → re-reserve
        const isActive = !existing.recommended || existing.approvedByClient === true;
        if (isActive) {
          await this.unreservePartStock(tenantId, wo.orderNumber, itemId, existing.partId, userId);
          await this.reservePartStock(tenantId, wo.orderNumber, itemId, existing.partId, data.quantity, userId);
        }
      }
    }

    await this.recalcTotals(workOrderId);

    // Log changes
    if (data.approvedByClient === true) {
      await this.logActivity(workOrderId, 'ITEM_UPDATED', `Одобрена позиция: ${existing.description}`, userId);
    } else if (data.approvedByClient === false) {
      await this.logActivity(workOrderId, 'ITEM_UPDATED', `Отклонена позиция: ${existing.description}`, userId);
    } else {
      const changes: string[] = [];
      if (data.quantity !== undefined && data.quantity !== Number(existing.quantity)) changes.push('кол-во');
      if (data.unitPrice !== undefined && data.unitPrice !== Number(existing.unitPrice)) changes.push('цена');
      if (data.description !== undefined && data.description !== existing.description) changes.push('описание');
      if (changes.length > 0) {
        await this.logActivity(workOrderId, 'ITEM_UPDATED', `Изменена позиция: ${existing.description} (${changes.join(', ')})`, userId);
      }
    }

    return item;
  }

  async deleteItem(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    userId?: string,
  ): Promise<void> {
    const workOrder = await this.findById(tenantId, workOrderId);

    const existing = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
    });
    if (!existing) throw new NotFoundException('Позиция не найдена');

    // Unreserve stock for PART items
    if (existing.type === 'PART' && existing.partId) {
      await this.unreservePartStock(tenantId, workOrder.orderNumber, itemId, existing.partId, userId);
    }

    await this.prisma.workOrderItem.delete({ where: { id: itemId } });
    await this.recalcTotals(workOrderId);

    const typeLabel = existing.type === 'LABOR' ? 'работа' : 'запчасть';
    await this.logActivity(workOrderId, 'ITEM_DELETED', `Удалена ${typeLabel}: ${existing.description}`, userId);
  }

  // --- Item Mechanics ---

  async addItemMechanic(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    data: { mechanicId: string },
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const item = await this.prisma.workOrderItem.findFirst({
      where: { id: itemId, workOrderId },
    });
    if (!item) throw new NotFoundException('Позиция не найдена');

    await this.prisma.workOrderItemMechanic.create({
      data: {
        workOrderItemId: itemId,
        mechanicId: data.mechanicId,
        contributionPercent: 100,
      },
    });

    // Redistribute evenly among all mechanics
    await this.redistributePercentsEvenly(itemId);

    return this.getItemWithMechanics(itemId);
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

    const clamped = Math.max(1, Math.min(100, Math.round(data.contributionPercent)));

    // Update this entry, then redistribute remaining among others
    await this.prisma.workOrderItemMechanic.update({
      where: { id: mechanicEntryId },
      data: { contributionPercent: clamped },
    });

    await this.redistributeRemainder(itemId, mechanicEntryId, clamped);

    return this.getItemWithMechanics(itemId);
  }

  async removeItemMechanic(
    tenantId: string,
    workOrderId: string,
    itemId: string,
    mechanicEntryId: string,
  ): Promise<any> {
    await this.findById(tenantId, workOrderId);

    const entry = await this.prisma.workOrderItemMechanic.findFirst({
      where: { id: mechanicEntryId, workOrderItemId: itemId },
    });
    if (!entry) throw new NotFoundException('Запись механика не найдена');

    await this.prisma.workOrderItemMechanic.delete({
      where: { id: mechanicEntryId },
    });

    // Redistribute among remaining mechanics
    await this.redistributePercentsEvenly(itemId);

    return this.getItemWithMechanics(itemId);
  }

  private async getItemWithMechanics(itemId: string) {
    return this.prisma.workOrderItem.findUnique({
      where: { id: itemId },
      include: {
        mechanics: {
          include: {
            mechanic: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /** Split 100% evenly among all mechanics on an item */
  private async redistributePercentsEvenly(itemId: string): Promise<void> {
    const entries = await this.prisma.workOrderItemMechanic.findMany({
      where: { workOrderItemId: itemId },
    });
    if (entries.length === 0) return;
    if (entries.length === 1) {
      await this.prisma.workOrderItemMechanic.update({
        where: { id: entries[0].id },
        data: { contributionPercent: 100 },
      });
      return;
    }

    const base = Math.floor(100 / entries.length);
    const remainder = 100 - base * entries.length;

    for (let i = 0; i < entries.length; i++) {
      await this.prisma.workOrderItemMechanic.update({
        where: { id: entries[i].id },
        data: { contributionPercent: base + (i < remainder ? 1 : 0) },
      });
    }
  }

  /** After editing one entry's %, distribute the remaining (100 - edited%) among the others */
  private async redistributeRemainder(
    itemId: string,
    editedEntryId: string,
    editedPercent: number,
  ): Promise<void> {
    const others = await this.prisma.workOrderItemMechanic.findMany({
      where: { workOrderItemId: itemId, id: { not: editedEntryId } },
    });
    if (others.length === 0) return;

    const remaining = Math.max(0, 100 - editedPercent);
    const base = Math.floor(remaining / others.length);
    const remainder = remaining - base * others.length;

    for (let i = 0; i < others.length; i++) {
      await this.prisma.workOrderItemMechanic.update({
        where: { id: others[i].id },
        data: { contributionPercent: base + (i < remainder ? 1 : 0) },
      });
    }
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

    const log = await this.prisma.workLog.create({
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

    await this.logActivity(workOrderId, 'WORK_LOG', `Лог работы: ${data.hoursWorked} ч.`, mechanicId);

    return log;
  }

  // --- Activity logging ---

  private async logActivity(
    workOrderId: string,
    type: string,
    description: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.workOrderActivity.create({
      data: {
        workOrderId,
        type,
        description,
        userId: userId || null,
        metadata: metadata || undefined,
      },
    });
  }

  // --- Inventory integration ---

  private async reservePartStock(
    tenantId: string,
    orderNumber: string,
    itemId: string,
    partId: string,
    quantity: number,
    userId?: string,
  ): Promise<void> {
    const warehouseStocks = await this.prisma.warehouseStock.findMany({
      where: { partId },
      include: { warehouse: { select: { id: true, tenantId: true } } },
      orderBy: { quantity: 'desc' },
    });

    let remaining = quantity;
    for (const ws of warehouseStocks) {
      if (remaining <= 0) break;
      if (ws.warehouse.tenantId !== tenantId) continue;
      const available = ws.quantity - ws.reserved;
      if (available <= 0) continue;
      const toReserve = Math.min(remaining, available);
      await this.inventoryService.addMovement(tenantId, {
        partId,
        warehouseId: ws.warehouseId,
        type: 'RESERVED',
        quantity: toReserve,
        reference: `WO:${orderNumber}`,
        referenceId: itemId,
        userId,
      });
      remaining -= toReserve;
    }
  }

  private async unreservePartStock(
    tenantId: string,
    orderNumber: string,
    itemId: string,
    partId: string,
    userId?: string,
  ): Promise<void> {
    const reservations = await this.getItemReservations(itemId);
    for (const [warehouseId, qty] of reservations) {
      await this.inventoryService.addMovement(tenantId, {
        partId,
        warehouseId,
        type: 'UNRESERVED',
        quantity: qty,
        reference: `WO:${orderNumber}`,
        referenceId: itemId,
        userId,
      });
    }
  }

  private async consumePartStock(
    tenantId: string,
    orderNumber: string,
    itemId: string,
    partId: string,
    userId?: string,
  ): Promise<void> {
    const reservations = await this.getItemReservations(itemId);
    for (const [warehouseId, qty] of reservations) {
      await this.inventoryService.addMovement(tenantId, {
        partId,
        warehouseId,
        type: 'CONSUMPTION',
        quantity: qty,
        reference: `WO:${orderNumber}`,
        referenceId: itemId,
        userId,
      });
    }
  }

  private async getItemReservations(itemId: string): Promise<Map<string, number>> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        referenceId: itemId,
        type: { in: ['RESERVED', 'UNRESERVED', 'CONSUMPTION'] },
      },
      select: { warehouseId: true, type: true, quantity: true },
    });

    const result = new Map<string, number>();
    for (const m of movements) {
      if (!m.warehouseId) continue;
      const current = result.get(m.warehouseId) || 0;
      if (m.type === 'RESERVED') {
        result.set(m.warehouseId, current + m.quantity);
      } else {
        result.set(m.warehouseId, current - m.quantity);
      }
    }

    for (const [key, val] of result) {
      if (val <= 0) result.delete(key);
    }

    return result;
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
