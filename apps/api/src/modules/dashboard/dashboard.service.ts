import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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
}
