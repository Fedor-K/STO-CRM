'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface DashboardStats {
  activeWorkOrders: number;
  todayAppointments: number;
  inProgressOrders: number;
  monthRevenue: number;
}

function formatMoney(amount: number): string {
  if (!amount) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/dashboard/stats'),
    refetchInterval: 30000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
      <p className="mt-2 text-gray-600">Добро пожаловать в STO-CRM</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Заказ-наряды"
          value={isLoading ? '...' : String(stats?.activeWorkOrders ?? 0)}
          subtitle="Активные"
        />
        <StatCard
          title="Записи сегодня"
          value={isLoading ? '...' : String(stats?.todayAppointments ?? 0)}
          subtitle="На обслуживание"
        />
        <StatCard
          title="В работе"
          value={isLoading ? '...' : String(stats?.inProgressOrders ?? 0)}
          subtitle="Механики заняты"
        />
        <StatCard
          title="Выручка за месяц"
          value={isLoading ? '...' : formatMoney(stats?.monthRevenue ?? 0)}
          subtitle="Текущий период"
        />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
