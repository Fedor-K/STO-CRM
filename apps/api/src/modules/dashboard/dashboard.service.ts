import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const appointmentFunnelInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
};

const workOrderFunnelInclude = {
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  mechanic: { select: { id: true, firstName: true, lastName: true } },
  vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
  _count: { select: { items: true } },
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      activeWorkOrders,
      todayAppointments,
      inProgressOrders,
      monthRevenue,
    ] = await Promise.all([
      // Active work orders (not CLOSED, not CANCELLED)
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
        },
      }),

      // Today's appointments
      this.prisma.appointment.count({
        where: {
          tenantId,
          scheduledStart: { gte: todayStart, lt: todayEnd },
        },
      }),

      // Work orders currently IN_PROGRESS
      this.prisma.workOrder.count({
        where: {
          tenantId,
          status: 'IN_PROGRESS',
        },
      }),

      // Monthly revenue (PAID + CLOSED orders this month)
      this.prisma.workOrder.aggregate({
        where: {
          tenantId,
          status: { in: ['PAID', 'CLOSED'] },
          updatedAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      activeWorkOrders,
      todayAppointments,
      inProgressOrders,
      monthRevenue: Number(monthRevenue._sum.totalAmount || 0),
    };
  }

  async getClientFunnel(tenantId: string) {
    const [
      pendingAppointments,
      estimatingAppointments,
      confirmedAppointments,
      newOrders,
      diagnosedOrders,
      approvedOrders,
      inProgressOrders,
      readyOrders,
      closedOrders,
    ] = await Promise.all([
      // Обращение — записи со статусом PENDING
      this.prisma.appointment.findMany({
        where: { tenantId, status: 'PENDING' },
        include: appointmentFunnelInclude,
        orderBy: { scheduledStart: 'asc' },
      }),

      // Согласование — записи со статусом ESTIMATING
      this.prisma.appointment.findMany({
        where: { tenantId, status: 'ESTIMATING' },
        include: appointmentFunnelInclude,
        orderBy: { scheduledStart: 'asc' },
      }),

      // Записан — записи со статусом CONFIRMED
      this.prisma.appointment.findMany({
        where: { tenantId, status: 'CONFIRMED' },
        include: appointmentFunnelInclude,
        orderBy: { scheduledStart: 'asc' },
      }),

      // Приёмка — ЗН со статусом NEW
      this.prisma.workOrder.findMany({
        where: { tenantId, status: 'NEW' },
        include: workOrderFunnelInclude,
        orderBy: { createdAt: 'asc' },
      }),

      // Диагностика — ЗН со статусом DIAGNOSED
      this.prisma.workOrder.findMany({
        where: { tenantId, status: 'DIAGNOSED' },
        include: workOrderFunnelInclude,
        orderBy: { createdAt: 'asc' },
      }),

      // Согласование — ЗН со статусом APPROVED
      this.prisma.workOrder.findMany({
        where: { tenantId, status: 'APPROVED' },
        include: workOrderFunnelInclude,
        orderBy: { createdAt: 'asc' },
      }),

      // В работе — ЗН со статусом IN_PROGRESS или PAUSED
      this.prisma.workOrder.findMany({
        where: { tenantId, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
        include: workOrderFunnelInclude,
        orderBy: { createdAt: 'asc' },
      }),

      // Готов — ЗН со статусом COMPLETED, INVOICED или PAID
      this.prisma.workOrder.findMany({
        where: { tenantId, status: { in: ['COMPLETED', 'INVOICED', 'PAID'] } },
        include: workOrderFunnelInclude,
        orderBy: { createdAt: 'asc' },
      }),

      // Выдан — ЗН со статусом CLOSED
      this.prisma.workOrder.findMany({
        where: { tenantId, status: 'CLOSED' },
        include: workOrderFunnelInclude,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      appeal: pendingAppointments,
      estimating: estimatingAppointments,
      scheduled: confirmedAppointments,
      intake: newOrders,
      diagnosis: diagnosedOrders,
      approval: approvedOrders,
      inProgress: inProgressOrders,
      ready: readyOrders,
      delivered: closedOrders,
    };
  }
}
