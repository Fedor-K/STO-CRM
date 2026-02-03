'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

// --- Types ---

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
  serviceBay: { id: string; name: string } | null;
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

type KanbanData = Record<string, WorkOrderCard[]>;

interface PaginatedResponse {
  data: WorkOrderCard[];
  meta: { total: number; page: number; limit: number; totalPages: number };
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

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 border-gray-300',
  DIAGNOSED: 'bg-blue-50 border-blue-300',
  APPROVED: 'bg-indigo-50 border-indigo-300',
  IN_PROGRESS: 'bg-yellow-50 border-yellow-300',
  PAUSED: 'bg-orange-50 border-orange-300',
  COMPLETED: 'bg-green-50 border-green-300',
  INVOICED: 'bg-purple-50 border-purple-300',
  PAID: 'bg-emerald-50 border-emerald-300',
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
  { key: 'appeal', label: 'Обращение', color: 'border-slate-400', bg: 'bg-slate-50', badge: 'bg-slate-200 text-slate-700', type: 'appointment' as const },
  { key: 'scheduled', label: 'Записан', color: 'border-sky-400', bg: 'bg-sky-50', badge: 'bg-sky-200 text-sky-700', type: 'appointment' as const },
  { key: 'intake', label: 'Приёмка', color: 'border-blue-400', bg: 'bg-blue-50', badge: 'bg-blue-200 text-blue-700', type: 'workorder' as const },
  { key: 'diagnosis', label: 'Диагностика', color: 'border-indigo-400', bg: 'bg-indigo-50', badge: 'bg-indigo-200 text-indigo-700', type: 'workorder' as const },
  { key: 'approval', label: 'Согласование', color: 'border-violet-400', bg: 'bg-violet-50', badge: 'bg-violet-200 text-violet-700', type: 'workorder' as const },
  { key: 'inProgress', label: 'В работе', color: 'border-yellow-400', bg: 'bg-yellow-50', badge: 'bg-yellow-200 text-yellow-700', type: 'workorder' as const },
  { key: 'ready', label: 'Готов', color: 'border-green-400', bg: 'bg-green-50', badge: 'bg-green-200 text-green-700', type: 'workorder' as const },
  { key: 'delivered', label: 'Выдан', color: 'border-gray-400', bg: 'bg-gray-50', badge: 'bg-gray-200 text-gray-600', type: 'workorder' as const },
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

// --- Main Page ---

export default function WorkOrdersPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'funnel' | 'kanban' | 'table'>('funnel');
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ['client-funnel'],
    queryFn: () => apiFetch('/dashboard/funnel'),
    enabled: view === 'funnel',
  });

  const { data: kanbanData, isLoading: kanbanLoading } = useQuery<KanbanData>({
    queryKey: ['work-orders-kanban'],
    queryFn: () => apiFetch('/work-orders/kanban'),
    enabled: view === 'kanban',
  });

  const { data: tableData, isLoading: tableLoading } = useQuery<PaginatedResponse>({
    queryKey: ['work-orders-list', page, statusFilter],
    queryFn: () =>
      apiFetch(`/work-orders?page=${page}&limit=20&sort=createdAt&order=desc${statusFilter ? `&status=${statusFilter}` : ''}`),
    enabled: view === 'table',
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-kanban'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {view === 'funnel' ? 'Воронка клиентов' : 'Заказ-наряды'}
        </h1>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-300">
            <button
              onClick={() => setView('funnel')}
              className={`px-3 py-1.5 text-sm font-medium ${view === 'funnel' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'} rounded-l-lg`}
            >
              Воронка
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-sm font-medium ${view === 'kanban' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-sm font-medium ${view === 'table' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'} rounded-r-lg`}
            >
              Таблица
            </button>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Создать заказ-наряд
          </button>
        </div>
      </div>

      {/* Funnel View */}
      {view === 'funnel' && (
        funnelLoading ? (
          <div className="mt-8 text-center text-gray-500">Загрузка...</div>
        ) : (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
            {FUNNEL_COLUMNS.map((col) => {
              const items = (funnelData?.[col.key as keyof FunnelData] || []) as any[];
              return (
                <div
                  key={col.key}
                  className={`flex w-64 min-w-[256px] flex-col rounded-lg border-t-4 bg-white shadow-sm ${col.color}`}
                >
                  <div className="flex items-center justify-between px-3 py-2">
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${col.badge}`}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    {col.type === 'appointment'
                      ? items.map((appt: AppointmentCard) => (
                          <AppointmentFunnelCard key={appt.id} appointment={appt} column={col.key} onCreated={invalidateAll} />
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
        )
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        kanbanLoading ? (
          <div className="mt-8 text-center text-gray-500">Загрузка...</div>
        ) : (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
            {Object.entries(kanbanData || {}).map(([status, cards]) => (
              <div
                key={status}
                className={`flex w-72 min-w-[288px] flex-col rounded-lg border-t-4 bg-white shadow-sm ${STATUS_COLORS[status] || 'border-gray-300'}`}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {STATUS_LABELS[status] || status}
                  </h3>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {cards.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                  {cards.map((wo) => (
                    <Link
                      key={wo.id}
                      href={`/work-orders/${wo.id}`}
                      className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-primary-600">
                          {wo.orderNumber}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CARD_BADGE_COLORS[wo.status] || 'bg-gray-100'}`}>
                          {STATUS_LABELS[wo.status]}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm text-gray-900">
                        {wo.client.firstName} {wo.client.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {wo.vehicle.make} {wo.vehicle.model}
                        {wo.vehicle.licensePlate ? ` • ${wo.vehicle.licensePlate}` : ''}
                      </div>
                      {wo.mechanic && (
                        <div className="mt-1 text-xs text-gray-500">
                          Механик: {wo.mechanic.firstName} {wo.mechanic.lastName}
                        </div>
                      )}
                      {wo.clientComplaints && (
                        <div className="mt-1 line-clamp-2 text-xs text-gray-400">
                          {wo.clientComplaints}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">
                          {formatMoney(wo.totalAmount)}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {wo._count.items} поз.
                        </span>
                      </div>
                    </Link>
                  ))}
                  {cards.length === 0 && (
                    <div className="py-4 text-center text-xs text-gray-400">Пусто</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Table View */}
      {view === 'table' && (
        <>
          <div className="mt-4 flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Все статусы</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {tableLoading ? (
            <div className="mt-8 text-center text-gray-500">Загрузка...</div>
          ) : !tableData?.data.length ? (
            <div className="mt-8 text-center text-gray-500">Заказ-нарядов не найдено</div>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Номер</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Клиент</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Автомобиль</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Механик</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {tableData.data.map((wo) => (
                      <tr key={wo.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link href={`/work-orders/${wo.id}`} className="font-medium text-primary-600 hover:underline">
                            {wo.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {wo.client.firstName} {wo.client.lastName}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{wo.vehicle.make} {wo.vehicle.model}</div>
                          {wo.vehicle.licensePlate && (
                            <div className="text-xs font-mono text-gray-500">{wo.vehicle.licensePlate}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {wo.mechanic ? `${wo.mechanic.firstName} ${wo.mechanic.lastName}` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CARD_BADGE_COLORS[wo.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[wo.status] || wo.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                          {formatMoney(wo.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tableData.meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Всего: {tableData.meta.total}. Страница {tableData.meta.page} из {tableData.meta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Назад
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(tableData.meta.totalPages, p + 1))}
                      disabled={page === tableData.meta.totalPages}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Вперёд
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showModal && (
        <CreateWorkOrderModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            invalidateAll();
          }}
        />
      )}
    </div>
  );
}

// --- Funnel Cards ---

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
      href={`/appointments`}
      className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <div className="text-sm font-medium text-gray-900">
        {appointment.client.firstName} {appointment.client.lastName}
      </div>
      {appointment.client.phone && (
        <div className="mt-0.5 text-xs text-gray-500">{appointment.client.phone}</div>
      )}
      <div className="mt-1.5 text-xs text-gray-500">
        {appointment.vehicle.make} {appointment.vehicle.model}
        {appointment.vehicle.licensePlate ? ` • ${appointment.vehicle.licensePlate}` : ''}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {formatDate(appointment.scheduledStart)}
      </div>
      {appointment.notes && (
        <div className="mt-1 line-clamp-2 text-xs text-gray-400">{appointment.notes}</div>
      )}
      {column === 'scheduled' && (
        <button
          onClick={handleCreateWO}
          disabled={creating}
          className="mt-2 w-full rounded-md bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
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
      className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-primary-600">{workOrder.orderNumber}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CARD_BADGE_COLORS[workOrder.status] || 'bg-gray-100'}`}>
          {STATUS_LABELS[workOrder.status]}
        </span>
      </div>
      <div className="mt-1.5 text-sm text-gray-900">
        {workOrder.client.firstName} {workOrder.client.lastName}
      </div>
      {workOrder.client.phone && (
        <div className="text-xs text-gray-500">{workOrder.client.phone}</div>
      )}
      <div className="mt-1 text-xs text-gray-500">
        {workOrder.vehicle.make} {workOrder.vehicle.model}
        {workOrder.vehicle.licensePlate ? ` • ${workOrder.vehicle.licensePlate}` : ''}
      </div>
      {workOrder.mechanic && (
        <div className="mt-1 text-xs text-gray-500">
          Механик: {workOrder.mechanic.firstName} {workOrder.mechanic.lastName}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
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

// --- Create Work Order Modal ---

function CreateWorkOrderModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [mechanicId, setMechanicId] = useState('');
  const [serviceBayId, setServiceBayId] = useState('');
  const [clientComplaints, setClientComplaints] = useState('');
  const [mileageAtIntake, setMileageAtIntake] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery<{ data: { id: string; firstName: string; lastName: string; email: string }[] }>({
    queryKey: ['clients-for-wo'],
    queryFn: () => apiFetch('/users?limit=100&sort=firstName&order=asc&role=CLIENT'),
  });

  const { data: vehicles } = useQuery<{ data: { id: string; make: string; model: string; licensePlate: string | null; clientId: string }[] }>({
    queryKey: ['vehicles-for-wo', clientId],
    queryFn: () => apiFetch(`/vehicles?limit=50${clientId ? `&clientId=${clientId}` : ''}`),
    enabled: !!clientId,
  });

  const { data: mechanics } = useQuery<{ data: { id: string; firstName: string; lastName: string }[] }>({
    queryKey: ['mechanics-for-wo'],
    queryFn: () => apiFetch('/users?limit=100&sort=firstName&order=asc&role=MECHANIC'),
  });

  const { data: bays } = useQuery<{ data: { id: string; name: string; type: string | null }[] }>({
    queryKey: ['bays-for-wo'],
    queryFn: () => apiFetch('/service-bays?isActive=true&limit=50'),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!clientId || !vehicleId) {
      setError('Выберите клиента и автомобиль');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          vehicleId,
          mechanicId: mechanicId || undefined,
          serviceBayId: serviceBayId || undefined,
          clientComplaints: clientComplaints || undefined,
          mileageAtIntake: mileageAtIntake ? Number(mileageAtIntake) : undefined,
          fuelLevel: fuelLevel || undefined,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания заказ-наряда');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Новый заказ-наряд</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Клиент *</label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setVehicleId(''); }}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            >
              <option value="">Выберите клиента</option>
              {clients?.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
              ))}
            </select>
          </div>

          {clientId && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Автомобиль *</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              >
                <option value="">Выберите автомобиль</option>
                {vehicles?.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} {v.licensePlate ? `(${v.licensePlate})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Механик</label>
              <select
                value={mechanicId}
                onChange={(e) => setMechanicId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Не назначен</option>
                {mechanics?.data?.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Рабочий пост</label>
              <select
                value={serviceBayId}
                onChange={(e) => setServiceBayId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Не выбран</option>
                {bays?.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.type ? ` (${b.type})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Пробег при приёмке (км)</label>
              <input
                type="number"
                value={mileageAtIntake}
                onChange={(e) => setMileageAtIntake(e.target.value)}
                min="0"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Уровень топлива</label>
              <select
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Не указан</option>
                <option value="empty">Пустой</option>
                <option value="quarter">1/4</option>
                <option value="half">1/2</option>
                <option value="three-quarter">3/4</option>
                <option value="full">Полный</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Жалобы клиента</label>
            <textarea
              value={clientComplaints}
              onChange={(e) => setClientComplaints(e.target.value)}
              rows={3}
              placeholder="Опишите проблемы клиента..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
