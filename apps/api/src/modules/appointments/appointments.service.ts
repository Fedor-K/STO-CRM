import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate, type PaginatedResponse } from '../../common/dto/pagination.dto';
import { Appointment, AppointmentStatus } from '@prisma/client';

const appointmentInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  advisor: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true, year: true } },
  serviceBay: { select: { id: true, name: true, type: true } },
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
      serviceBayId?: string;
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

    // Check service bay availability if specified
    if (data.serviceBayId) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          tenantId,
          serviceBayId: data.serviceBayId,
          status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
          OR: [
            { scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
          ],
        },
      });
      if (conflict) {
        throw new BadRequestException('Выбранный пост занят в это время');
      }
    }

    return this.prisma.appointment.create({
      data: {
        scheduledStart: start,
        scheduledEnd: end,
        clientId: data.clientId,
        vehicleId: data.vehicleId,
        advisorId: data.advisorId,
        serviceBayId: data.serviceBayId,
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
    await this.findById(tenantId, id);
    return this.prisma.appointment.update({
      where: { id },
      data: { status },
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
      serviceBayId?: string;
      source?: string;
      adChannel?: string;
      notes?: string;
      status?: AppointmentStatus;
    },
  ): Promise<any> {
    await this.findById(tenantId, id);

    const updateData: any = { ...data };
    if (data.scheduledStart) updateData.scheduledStart = new Date(data.scheduledStart);
    if (data.scheduledEnd) updateData.scheduledEnd = new Date(data.scheduledEnd);

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

  async getAvailableSlots(
    tenantId: string,
    params: { date: string; durationMinutes: number; serviceBayId?: string },
  ): Promise<{ start: string; end: string }[]> {
    const { date, durationMinutes, serviceBayId } = params;
    const dayStart = new Date(`${date}T09:00:00`);
    const dayEnd = new Date(`${date}T18:00:00`);

    // Get all active service bays
    const bays = serviceBayId
      ? await this.prisma.serviceBay.findMany({ where: { id: serviceBayId, tenantId, isActive: true } })
      : await this.prisma.serviceBay.findMany({ where: { tenantId, isActive: true } });

    if (bays.length === 0) return [];

    // Get existing appointments for the day
    const existing = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        scheduledStart: { gte: dayStart, lt: dayEnd },
        ...(serviceBayId ? { serviceBayId } : {}),
      },
      select: { scheduledStart: true, scheduledEnd: true, serviceBayId: true },
    });

    const slots: { start: string; end: string }[] = [];
    const slotStep = 30; // 30-minute slots

    for (let mins = 0; mins + durationMinutes <= (18 - 9) * 60; mins += slotStep) {
      const slotStart = new Date(dayStart.getTime() + mins * 60000);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

      // Check if at least one bay is available
      const hasAvailableBay = bays.some((bay) => {
        return !existing.some(
          (appt) =>
            appt.serviceBayId === bay.id &&
            slotStart < appt.scheduledEnd &&
            slotEnd > appt.scheduledStart,
        );
      });

      if (hasAvailableBay) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }

    return slots;
  }

  async getCalendarEvents(
    tenantId: string,
    params: { from: string; to: string },
  ): Promise<any[]> {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        scheduledStart: { gte: new Date(params.from) },
        scheduledEnd: { lte: new Date(params.to) },
      },
      include: appointmentInclude,
      orderBy: { scheduledStart: 'asc' },
    });
  }
}
