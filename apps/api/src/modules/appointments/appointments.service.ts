import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Appointment, AppointmentStatus } from '@prisma/client';

const appointmentInclude = {
  client: { select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, email: true } },
  advisor: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true, mileage: true } },
  workOrder: { select: { id: true, orderNumber: true, status: true } },
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    params: {
      page: number;
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      status?: AppointmentStatus;
      clientId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, sort, order, status, clientId, from, to } = params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (from || to) {
      where.scheduledStart = {};
      if (from) where.scheduledStart.gte = new Date(from);
      if (to) where.scheduledStart.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        include: appointmentInclude,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(tenantId: string, id: string): Promise<any> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Запись не найдена');
    return appointment;
  }

  async create(
    tenantId: string,
    data: {
      clientId: string;
      vehicleId: string;
      scheduledStart: string;
      scheduledEnd: string;
      advisorId?: string;
      source?: string;
      adChannel?: string;
      notes?: string;
    },
  ): Promise<any> {
    const start = new Date(data.scheduledStart);
    const end = new Date(data.scheduledEnd);

    if (end <= start) {
      throw new BadRequestException('Время окончания должно быть позже начала');
    }

    return this.prisma.appointment.create({
      data: {
        scheduledStart: start,
        scheduledEnd: end,
        clientId: data.clientId,
        vehicleId: data.vehicleId,
        advisorId: data.advisorId,
        source: data.source,
        adChannel: data.adChannel,
        notes: data.notes,
        tenantId,
      },
      include: appointmentInclude,
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: AppointmentStatus,
  ): Promise<any> {
    const existing = await this.findById(tenantId, id);
    const data: any = { status };
    if (status === 'ESTIMATING') {
      data.reminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (existing.status === 'ESTIMATING') {
      data.reminderAt = null;
    }
    if (status === 'CANCELLED') {
      data.cancelledFrom = existing.status;
    }
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: appointmentInclude,
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      scheduledStart?: string;
      scheduledEnd?: string;
      advisorId?: string;
      source?: string;
      adChannel?: string;
      notes?: string;
      cancelReason?: string;
      cancelComment?: string;
      status?: AppointmentStatus;
      plannedItems?: any;
      reminderAt?: string;
    },
  ): Promise<any> {
    await this.findById(tenantId, id);

    const updateData: any = { ...data };
    if (data.scheduledStart) updateData.scheduledStart = new Date(data.scheduledStart);
    if (data.scheduledEnd) updateData.scheduledEnd = new Date(data.scheduledEnd);
    if (data.reminderAt) updateData.reminderAt = new Date(data.reminderAt);

    return this.prisma.appointment.update({
      where: { id },
      data: updateData,
      include: appointmentInclude,
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.findById(tenantId, id);
    await this.prisma.appointment.delete({ where: { id } });
  }

  async getCalendarEvents(
    tenantId: string,
    params: { from: string; to: string },
  ): Promise<any[]> {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        scheduledStart: { lt: new Date(params.to) },
        scheduledEnd: { gt: new Date(params.from) },
      },
      include: appointmentInclude,
      orderBy: { scheduledStart: 'asc' },
    });
  }
}
