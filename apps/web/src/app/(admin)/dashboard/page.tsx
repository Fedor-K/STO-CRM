'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

// --- Types ---

interface DashboardStats {
  activeWorkOrders: number;
  todayAppointments: number;
  inProgressOrders: number;
  monthRevenue: number;
}

interface AppointmentCard {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null };
}

interface WorkOrderCard {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  totalAmount: string | number;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  mechanic: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null };
  _count: { items: number };
}

interface FunnelData {
  appeal: AppointmentCard[];
  scheduled: AppointmentCard[];
  intake: WorkOrderCard[];
  diagnosis: WorkOrderCard[];
  approval: WorkOrderCard[];
  inProgress: WorkOrderCard[];
  ready: WorkOrderCard[];
  delivered: WorkOrderCard[];
}

// --- Constants ---

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

const CARD_BADGE_COLORS: Record<string, string> = {
  NEW: 'bg-gray-200 text-gray-700',
  DIAGNOSED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-purple-100 text-purple-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

const FUNNEL_COLUMNS = [
  { key: 'appeal', label: 'Обращение', color: 'border-slate-400', badge: 'bg-slate-200 text-slate-700', type: 'appointment' as const },
  { key: 'scheduled', label: 'Записан', color: 'border-sky-400', badge: 'bg-sky-200 text-sky-700', type: 'appointment' as const },
  { key: 'intake', label: 'Приёмка', color: 'border-blue-400', badge: 'bg-blue-200 text-blue-700', type: 'workorder' as const },
  { key: 'diagnosis', label: 'Диагностика', color: 'border-indigo-400', badge: 'bg-indigo-200 text-indigo-700', type: 'workorder' as const },
  { key: 'approval', label: 'Согласование', color: 'border-violet-400', badge: 'bg-violet-200 text-violet-700', type: 'workorder' as const },
  { key: 'inProgress', label: 'В работе', color: 'border-yellow-400', badge: 'bg-yellow-200 text-yellow-700', type: 'workorder' as const },
  { key: 'ready', label: 'Готов', color: 'border-green-400', badge: 'bg-green-200 text-green-700', type: 'workorder' as const },
  { key: 'delivered', label: 'Выдан', color: 'border-gray-400', badge: 'bg-gray-200 text-gray-600', type: 'workorder' as const },
] as const;

// --- Helpers ---

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

// --- Page ---

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/dashboard/stats'),
    refetchInterval: 30000,
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ['client-funnel'],
    queryFn: () => apiFetch('/dashboard/funnel'),
    refetchInterval: 30000,
  });

  function invalidateFunnel() {
    queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>

      {/* Stats cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Заказ-наряды"
          value={statsLoading ? '...' : String(stats?.activeWorkOrders ?? 0)}
          subtitle="Активные"
        />
        <StatCard
          title="Записи сегодня"
          value={statsLoading ? '...' : String(stats?.todayAppointments ?? 0)}
          subtitle="На обслуживание"
        />
        <StatCard
          title="В работе"
          value={statsLoading ? '...' : String(stats?.inProgressOrders ?? 0)}
          subtitle="Механики заняты"
        />
        <StatCard
          title="Выручка за месяц"
          value={statsLoading ? '...' : formatMoney(stats?.monthRevenue ?? 0)}
          subtitle="Текущий период"
        />
      </div>

      {/* Funnel */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Воронка клиентов</h2>

        {funnelLoading ? (
          <div className="mt-4 text-center text-gray-500">Загрузка...</div>
        ) : (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-4">
            {FUNNEL_COLUMNS.map((col) => {
              const items = (funnelData?.[col.key as keyof FunnelData] || []) as any[];
              return (
                <div
                  key={col.key}
                  className={`flex w-56 min-w-[224px] flex-col rounded-lg border-t-4 bg-white shadow-sm ${col.color}`}
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <h3 className="text-xs font-semibold text-gray-700">{col.label}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${col.badge}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                    {col.type === 'appointment'
                      ? items.map((appt: AppointmentCard) => (
                          <AppointmentFunnelCard key={appt.id} appointment={appt} column={col.key} onCreated={invalidateFunnel} />
                        ))
                      : items.map((wo: WorkOrderCard) => (
                          <WorkOrderFunnelCard key={wo.id} workOrder={wo} />
                        ))
                    }
                    {items.length === 0 && (
                      <div className="py-4 text-center text-xs text-gray-400">Пусто</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Components ---

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function AppointmentFunnelCard({
  appointment,
  column,
  onCreated,
}: {
  appointment: AppointmentCard;
  column: string;
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);

  async function handleCreateWO(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCreating(true);
    try {
      await apiFetch(`/work-orders/from-appointment/${appointment.id}`, { method: 'POST' });
      onCreated();
    } catch {
      alert('Ошибка создания заказ-наряда');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Link
      href="/appointments"
      className="block rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition hover:shadow-md"
    >
      <div className="text-sm font-medium text-gray-900">
        {appointment.client.firstName} {appointment.client.lastName}
      </div>
      {appointment.client.phone && (
        <div className="mt-0.5 text-[11px] text-gray-500">{appointment.client.phone}</div>
      )}
      <div className="mt-1 text-[11px] text-gray-500">
        {appointment.vehicle.make} {appointment.vehicle.model}
        {appointment.vehicle.licensePlate ? ` • ${appointment.vehicle.licensePlate}` : ''}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-400">
        {formatDate(appointment.scheduledStart)}
      </div>
      {column === 'scheduled' && (
        <button
          onClick={handleCreateWO}
          disabled={creating}
          className="mt-1.5 w-full rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {creating ? 'Создание...' : 'Создать ЗН'}
        </button>
      )}
    </Link>
  );
}

function WorkOrderFunnelCard({ workOrder }: { workOrder: WorkOrderCard }) {
  return (
    <Link
      href={`/work-orders/${workOrder.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-primary-600">{workOrder.orderNumber}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CARD_BADGE_COLORS[workOrder.status] || 'bg-gray-100'}`}>
          {STATUS_LABELS[workOrder.status]}
        </span>
      </div>
      <div className="mt-1 text-sm text-gray-900">
        {workOrder.client.firstName} {workOrder.client.lastName}
      </div>
      {workOrder.client.phone && (
        <div className="text-[11px] text-gray-500">{workOrder.client.phone}</div>
      )}
      <div className="mt-0.5 text-[11px] text-gray-500">
        {workOrder.vehicle.make} {workOrder.vehicle.model}
        {workOrder.vehicle.licensePlate ? ` • ${workOrder.vehicle.licensePlate}` : ''}
      </div>
      {workOrder.mechanic && (
        <div className="mt-0.5 text-[11px] text-gray-500">
          {workOrder.mechanic.firstName} {workOrder.mechanic.lastName}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {formatMoney(workOrder.totalAmount)}
        </span>
        <span className="text-[10px] text-gray-400">
          {formatShortDate(workOrder.createdAt)}
        </span>
      </div>
    </Link>
  );
}
