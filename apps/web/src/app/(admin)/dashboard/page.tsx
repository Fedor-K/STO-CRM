'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import Link from 'next/link';
import {
  INSPECTION_GROUPS,
  SLIDER_CONFIG,
  AUTO_RECOMMEND_CONFIG,
  isCriticalLevel,
  createEmptyChecklist,
  type InspectionChecklist,
} from '@sto-crm/shared';

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
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; mileage: number | null };
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
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; mileage: number | null };
  items: { type: string; recommended: boolean; approvedByClient: boolean | null }[];
  _count: { items: number; workLogs: number };
}

interface CancelledAppointment extends AppointmentCard {
  cancelReason: string | null;
  cancelComment: string | null;
  createdAt: string;
}

interface FunnelData {
  appeal: AppointmentCard[];
  estimating: AppointmentCard[];
  scheduled: AppointmentCard[];
  diagnosis: WorkOrderCard[];
  approval: WorkOrderCard[];
  inProgress: WorkOrderCard[];
  ready: WorkOrderCard[];
  delivered: WorkOrderCard[];
  cancelledByStage: {
    appeal: CancelledAppointment[];
    estimating: CancelledAppointment[];
    scheduled: CancelledAppointment[];
  };
}

// --- Constants ---

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Обращение',
  ESTIMATING: 'На согласовании',
  CONFIRMED: 'Записан',
  NEW: 'Новый',
  DIAGNOSED: 'Осмотр',
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
  { key: 'estimating', label: 'Согласование', color: 'border-amber-400', badge: 'bg-amber-200 text-amber-700', type: 'appointment' as const },
  { key: 'scheduled', label: 'Записан', color: 'border-sky-400', badge: 'bg-sky-200 text-sky-700', type: 'appointment' as const },
  { key: 'diagnosis', label: 'Осмотр', color: 'border-indigo-400', badge: 'bg-indigo-200 text-indigo-700', type: 'workorder' as const },
  { key: 'approval', label: 'Согласование', color: 'border-violet-400', badge: 'bg-violet-200 text-violet-700', type: 'workorder' as const },
  { key: 'inProgress', label: 'В работе', color: 'border-yellow-400', badge: 'bg-yellow-200 text-yellow-700', type: 'workorder' as const },
  { key: 'ready', label: 'Готов', color: 'border-green-400', badge: 'bg-green-200 text-green-700', type: 'workorder' as const },
  { key: 'delivered', label: 'Выдан', color: 'border-gray-400', badge: 'bg-gray-200 text-gray-600', type: 'workorder' as const },
] as const;

// --- Helpers ---

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0,00 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
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

const CYR_TO_LAT: Record<string, string> = {
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','У':'Y','Х':'X',
  'а':'a','в':'b','е':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x',
};

/** Марка/модель: латиница, цифры, пробел, дефис. Первая буква каждого слова — заглавная. */
function sanitizeMakeModel(val: string): string {
  const latin = val.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
  const cleaned = latin.replace(/[^a-zA-Z0-9\s\-]/g, '');
  return cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Госномер: латиница + цифры, всё в верхнем регистре. */
function sanitizePlate(val: string): string {
  const latin = val.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
  return latin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// --- Page ---

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<{ id: string; column: string } | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/dashboard/stats'),
    refetchInterval: 30000,
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ['client-funnel'],
    queryFn: () => apiFetch('/dashboard/funnel'),
    refetchInterval: 15000,
    staleTime: 0,
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Воронка клиентов</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiModal(true)}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              ✦ Создать с ИИ
            </button>
            <button
              onClick={() => setShowAppointmentModal(true)}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              + Новая заявка
            </button>
          </div>
        </div>

        {funnelLoading ? (
          <div className="mt-4 text-center text-gray-500">Загрузка...</div>
        ) : (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-4">
            {FUNNEL_COLUMNS.map((col) => {
              const items = (funnelData?.[col.key as keyof FunnelData] || []) as any[];
              const cancelledItems = col.type === 'appointment'
                ? (funnelData?.cancelledByStage as any)?.[col.key] || []
                : [];
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
                          <AppointmentFunnelCard
                            key={appt.id}
                            appointment={appt}
                            column={col.key}
                            onCreated={invalidateFunnel}
                            onClick={() => setSelectedAppointment({ id: appt.id, column: col.key })}
                          />
                        ))
                      : items.map((wo: WorkOrderCard) => (
                          <WorkOrderFunnelCard
                            key={wo.id}
                            workOrder={wo}
                            onUpdate={invalidateFunnel}
                            onClick={() => setSelectedWorkOrder(wo.id)}
                          />
                        ))
                    }
                    {items.length === 0 && (
                      <div className="py-4 text-center text-xs text-gray-400">Пусто</div>
                    )}
                  </div>
                  {/* Cancelled section per column */}
                  {cancelledItems.length > 0 && (
                    <CancelledColumnSection cancelled={cancelledItems} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAiModal && (
        <AiWorkOrderModal
          onClose={() => setShowAiModal(false)}
          onSuccess={() => {
            setShowAiModal(false);
            invalidateFunnel();
          }}
        />
      )}

      {showAppointmentModal && (
        <CreateAppointmentModal
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => {
            setShowAppointmentModal(false);
            invalidateFunnel();
          }}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointmentId={selectedAppointment.id}
          column={selectedAppointment.column}
          onClose={() => setSelectedAppointment(null)}
          onUpdate={() => {
            setSelectedAppointment(null);
            invalidateFunnel();
          }}
        />
      )}

      {selectedWorkOrder && (
        <WorkOrderDetailModal
          workOrderId={selectedWorkOrder}
          onClose={() => setSelectedWorkOrder(null)}
          onUpdate={() => {
            setSelectedWorkOrder(null);
            invalidateFunnel();
          }}
        />
      )}
    </div>
  );
}

// --- Components ---

function CancelledColumnSection({ cancelled }: { cancelled: CancelledAppointment[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-red-100 bg-red-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1.5"
      >
        <span className="text-[11px] font-medium text-red-600">
          Отказы
        </span>
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
          {cancelled.length}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1.5 px-2 pb-2">
          {cancelled.map((a) => (
            <div key={a.id} className="rounded border border-red-200 bg-white px-2 py-1.5">
              <p className="text-[11px] font-medium text-gray-800">
                {a.client.firstName} {a.client.lastName}
              </p>
              <p className="text-[10px] text-gray-500">
                {a.vehicle.make} {a.vehicle.model}
                {a.vehicle.mileage != null ? ` • ${a.vehicle.mileage.toLocaleString('ru-RU')} км` : ''}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-700">
                  {a.cancelReason || a.notes || '—'}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(a.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              {a.cancelComment && (
                <p className="mt-0.5 text-[10px] text-gray-400 italic">{a.cancelComment}</p>
              )}
            </div>
          ))}
        </div>
      )}
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

function AppointmentFunnelCard({
  appointment,
  column,
  onCreated,
  onClick,
}: {
  appointment: AppointmentCard;
  column: string;
  onCreated: () => void;
  onClick: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleAction(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    try {
      if (column === 'appeal') {
        await apiFetch(`/appointments/${appointment.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ESTIMATING' }),
        });
      } else if (column === 'scheduled') {
        await apiFetch(`/work-orders/from-appointment/${appointment.id}`, { method: 'POST' });
      }
      onCreated();
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  const actionLabel = column === 'appeal' ? 'На согласование →' : column === 'scheduled' ? 'Создать ЗН →' : null;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition hover:shadow-md hover:border-primary-300"
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
        {appointment.vehicle.mileage != null ? ` • ${appointment.vehicle.mileage.toLocaleString('ru-RU')} км` : ''}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-400">
        {formatDate(appointment.scheduledStart)}
      </div>
      {actionLabel && (
        <button
          onClick={handleAction}
          disabled={loading}
          className="mt-1.5 w-full rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? '...' : actionLabel}
        </button>
      )}
    </div>
  );
}

const WO_NEXT_STATUS: Record<string, { status: string; label: string }> = {
  NEW: { status: 'DIAGNOSED', label: 'Осмотр →' },
  DIAGNOSED: { status: 'APPROVED', label: 'Согласовать →' },
  APPROVED: { status: 'IN_PROGRESS', label: 'В работу →' },
  IN_PROGRESS: { status: 'COMPLETED', label: 'Готово →' },
  PAUSED: { status: 'IN_PROGRESS', label: 'Возобновить →' },
  COMPLETED: { status: 'INVOICED', label: 'Выставить счёт →' },
  INVOICED: { status: 'PAID', label: 'Оплачен →' },
  PAID: { status: 'CLOSED', label: 'Выдать →' },
};

function WorkOrderFunnelCard({ workOrder, onUpdate, onClick }: { workOrder: WorkOrderCard; onUpdate: () => void; onClick: () => void }) {
  const [loading, setLoading] = useState(false);
  const next = WO_NEXT_STATUS[workOrder.status];
  const laborItems = (workOrder.items || []).filter((i) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true));
  const needsLogs = workOrder.status === 'IN_PROGRESS' && next?.status === 'COMPLETED' && (workOrder._count?.workLogs ?? 0) < laborItems.length;

  async function handleNext(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!next) return;
    // Требуем механика для любого перехода вперёд
    const MECHANIC_REQUIRED = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'];
    if (MECHANIC_REQUIRED.includes(workOrder.status) && !workOrder.mechanic?.id) {
      alert('Назначьте механика перед переводом заказ-наряда');
      onClick(); // Открыть карточку для назначения механика
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/work-orders/${workOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next.status }),
      });
      onUpdate();
    } catch (err: any) {
      alert(err.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition hover:shadow-md hover:border-primary-300">
      <div className="flex items-center justify-between">
        <Link href={`/work-orders/${workOrder.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-primary-600 hover:underline">
          {workOrder.orderNumber}
        </Link>
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
        {workOrder.vehicle.mileage != null ? ` • ${workOrder.vehicle.mileage.toLocaleString('ru-RU')} км` : ''}
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
      {next && (() => {
        const MECHANIC_REQUIRED = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'];
        const needsMechanic = MECHANIC_REQUIRED.includes(workOrder.status) && !workOrder.mechanic?.id;
        return (
          <button
            onClick={handleNext}
            disabled={loading || needsMechanic || needsLogs}
            title={needsMechanic ? 'Назначьте механика' : needsLogs ? 'Отметьте все работы в Логах работ' : undefined}
            className="mt-1.5 w-full rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '...' : next.label}
          </button>
        );
      })()}
    </div>
  );
}

function CreateAppointmentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Client mode: 'existing' or 'new'
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientLabel, setClientLabel] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  // New client fields
  const [newLastName, setNewLastName] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newMiddleName, setNewMiddleName] = useState('');
  const [newDateOfBirth, setNewDateOfBirth] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Vehicle mode: 'existing' or 'new'
  const [isNewVehicle, setIsNewVehicle] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  // New vehicle fields
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newVin, setNewVin] = useState('');
  const [newLicensePlate, setNewLicensePlate] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newMileage, setNewMileage] = useState('');

  // Appointment fields
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [advisorId, setAdvisorId] = useState(user?.id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [debouncedClientSearch, setDebouncedClientSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch), 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: clients, refetch: refetchClients } = useQuery<{ data: { id: string; firstName: string; lastName: string; phone: string | null; email: string }[] }>({
    queryKey: ['clients-for-appt', debouncedClientSearch],
    queryFn: () => apiFetch(`/users?limit=20&sort=lastName&order=asc&role=CLIENT${debouncedClientSearch.length >= 2 ? `&search=${encodeURIComponent(debouncedClientSearch)}` : ''}`),
    enabled: !isNewClient && debouncedClientSearch.length >= 2,
  });

  const { data: advisors } = useQuery<{ data: { id: string; firstName: string; lastName: string }[] }>({
    queryKey: ['advisors-for-appt'],
    queryFn: async () => {
      const res = await apiFetch('/users?limit=100&sort=firstName&order=asc') as { data: { id: string; firstName: string; lastName: string; role: string }[] };
      return { data: res.data.filter((u) => ['OWNER', 'MANAGER', 'RECEPTIONIST'].includes(u.role)) };
    },
  });

  const { data: vehicles, refetch: refetchVehicles } = useQuery<{ data: { id: string; make: string; model: string; licensePlate: string | null; clientId: string }[] }>({
    queryKey: ['vehicles-for-appt', clientId],
    queryFn: () => apiFetch(`/vehicles?limit=50${clientId ? `&clientId=${clientId}` : ''}`),
    enabled: !!clientId && !isNewClient,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      let finalClientId = clientId;
      let finalVehicleId = vehicleId;

      // 1. Create new client if needed
      if (isNewClient) {
        if (!newLastName || !newFirstName || !newPhone) {
          setError('Заполните фамилию, имя и телефон нового клиента');
          setSaving(false);
          return;
        }
        const email = newEmail || `${newPhone.replace(/\D/g, '')}@client.local`;
        const password = Math.random().toString(36).slice(2, 14);
        const created: any = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            firstName: newFirstName,
            lastName: newLastName,
            middleName: newMiddleName || undefined,
            dateOfBirth: newDateOfBirth || undefined,
            phone: newPhone,
            email,
            password,
            role: 'CLIENT',
          }),
        });
        finalClientId = created.id;
        refetchClients();
      }

      if (!finalClientId) {
        setError('Выберите или создайте клиента');
        setSaving(false);
        return;
      }

      // 2. Create new vehicle if needed
      if (isNewVehicle || isNewClient) {
        if (!newMake || !newModel) {
          setError('Укажите марку и модель автомобиля');
          setSaving(false);
          return;
        }
        const createdVehicle: any = await apiFetch('/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            make: newMake,
            model: newModel,
            year: newYear ? Number(newYear) : undefined,
            vin: newVin || undefined,
            licensePlate: newLicensePlate || undefined,
            color: newColor || undefined,
            mileage: newMileage ? Number(newMileage) : undefined,
            clientId: finalClientId,
          }),
        });
        finalVehicleId = createdVehicle.id;
      }

      if (!finalVehicleId) {
        setError('Выберите или добавьте автомобиль');
        setSaving(false);
        return;
      }

      // 3. Create appointment — start = now, end = +1 hour
      const now = new Date();
      const scheduledStart = now.toISOString();
      const scheduledEnd = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clientId: finalClientId,
          vehicleId: finalVehicleId,
          scheduledStart,
          scheduledEnd,
          advisorId: advisorId || undefined,
          notes: notes || undefined,
          source: source || undefined,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка создания записи');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Новая заявка</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* --- Client --- */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Клиент *</label>
              <button
                type="button"
                onClick={() => { setIsNewClient(!isNewClient); setClientId(''); setClientLabel(''); setClientSearch(''); setVehicleId(''); setIsNewVehicle(false); }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {isNewClient ? 'Выбрать существующего' : '+ Новый клиент'}
              </button>
            </div>

            {isNewClient ? (
              <div className="mt-2 space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="Фамилия *"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className={inputCls}
                    required
                  />
                  <input
                    placeholder="Имя *"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className={inputCls}
                    required
                  />
                  <input
                    placeholder="Отчество"
                    value={newMiddleName}
                    onChange={(e) => setNewMiddleName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Дата рождения</label>
                  <input
                    type="date"
                    value={newDateOfBirth}
                    onChange={(e) => setNewDateOfBirth(e.target.value)}
                    className={`${inputCls} ${!newDateOfBirth ? 'text-gray-400' : ''}`}
                  />
                </div>
                <input
                  placeholder="Телефон *"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className={inputCls}
                  required
                />
                <input
                  placeholder="Email (необязательно)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="relative" ref={clientDropdownRef}>
                <input
                  type="text"
                  value={clientId ? clientLabel : clientSearch}
                  onChange={(e) => {
                    if (clientId) {
                      setClientId('');
                      setClientLabel('');
                      setVehicleId('');
                      setIsNewVehicle(false);
                    }
                    setClientSearch(e.target.value);
                    setShowClientDropdown(true);
                  }}
                  onFocus={() => { if (clientSearch.length >= 2) setShowClientDropdown(true); }}
                  placeholder="Введите ФИО или телефон (мин. 2 символа)..."
                  className={inputCls}
                />
                {clientId && (
                  <button
                    type="button"
                    onClick={() => { setClientId(''); setClientLabel(''); setClientSearch(''); setVehicleId(''); setIsNewVehicle(false); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
                {showClientDropdown && clients?.data && clients.data.length > 0 && !clientId && (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {clients.data.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientLabel(`${c.lastName} ${c.firstName}${c.phone ? ` (${c.phone})` : ''}`);
                          setClientSearch('');
                          setShowClientDropdown(false);
                          setVehicleId('');
                          setIsNewVehicle(false);
                        }}
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-primary-50"
                      >
                        <span className="text-sm font-medium text-gray-900">{c.lastName} {c.firstName}</span>
                        <span className="text-xs text-gray-500">{c.phone || c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showClientDropdown && debouncedClientSearch.length >= 2 && clients?.data?.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500 shadow-lg">
                    Клиент не найден
                  </div>
                )}
                <input type="hidden" value={clientId} required={!isNewClient} />
              </div>
            )}
          </div>

          {/* --- Vehicle --- */}
          {(isNewClient || clientId) && (
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Автомобиль *</label>
                {!isNewClient && (
                  <button
                    type="button"
                    onClick={() => { setIsNewVehicle(!isNewVehicle); setVehicleId(''); }}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    {isNewVehicle ? 'Выбрать существующий' : '+ Новый автомобиль'}
                  </button>
                )}
              </div>

              {isNewClient || isNewVehicle ? (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-400">Только латиница. Кириллица конвертируется автоматически.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Марка * (Toyota, BMW)"
                      value={newMake}
                      onChange={(e) => setNewMake(sanitizeMakeModel(e.target.value))}
                      className={inputCls}
                      required
                    />
                    <input
                      placeholder="Модель * (Camry, X5)"
                      value={newModel}
                      onChange={(e) => setNewModel(sanitizeMakeModel(e.target.value))}
                      className={inputCls}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      placeholder="Год (2020)"
                      type="number"
                      min={1900}
                      max={2030}
                      value={newYear}
                      onChange={(e) => setNewYear(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      placeholder="Цвет"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      placeholder="Пробег (км)"
                      type="number"
                      min={0}
                      value={newMileage}
                      onChange={(e) => setNewMileage(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <input
                    placeholder="Госномер (A123BC77)"
                    value={newLicensePlate}
                    onChange={(e) => setNewLicensePlate(sanitizePlate(e.target.value))}
                    className={inputCls}
                  />
                  <input
                    placeholder="VIN (17 символов)"
                    value={newVin}
                    onChange={(e) => setNewVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
                    className={`${inputCls} font-mono`}
                    maxLength={17}
                  />
                </div>
              ) : (
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Выберите автомобиль</option>
                  {vehicles?.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} {v.licensePlate ? `(${v.licensePlate})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* --- Дата и время приёма (автоматически) --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Дата и время приёма</label>
            <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* --- Source --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Источник обращения</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
              <option value="">Не указан</option>
              <option value="phone">Телефон</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="website">Сайт</option>
              <option value="walk-in">Самозаход</option>
              <option value="referral">Рекомендация</option>
              <option value="repeat">Повторный визит</option>
            </select>
          </div>

          {/* --- Advisor --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Приёмщик</label>
            <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} className={inputCls}>
              <option value="">Не назначен</option>
              {advisors?.data?.map((a) => (
                <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
              ))}
            </select>
          </div>

          {/* --- Notes --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Причина обращения, жалобы клиента..."
              className={inputCls}
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
              {saving ? 'Сохранение...' : 'Записать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Appointment Detail Modal ---

interface AppointmentDetail {
  id: string;
  createdAt: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  source: string | null;
  adChannel: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; mileage: number | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  plannedItems: PlannedItem[] | null;
}

interface PlannedItem {
  type: 'LABOR' | 'PART';
  description: string;
  quantity: number;
  unitPrice: number;
  normHours?: number;
  serviceId?: string;
  partId?: string;
}

function AppointmentDetailModal({
  appointmentId,
  column,
  onClose,
  onUpdate,
}: {
  appointmentId: string;
  column: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [subModal, setSubModal] = useState<'client' | 'vehicle' | null>(null);

  const { data: appointment, isLoading, refetch: refetchAppt } = useQuery<AppointmentDetail>({
    queryKey: ['appointment-detail', appointmentId],
    queryFn: () => apiFetch(`/appointments/${appointmentId}`),
    staleTime: 0,
  });

  const { data: advisors } = useQuery<{ data: { id: string; firstName: string; lastName: string }[] }>({
    queryKey: ['advisors-modal'],
    queryFn: async () => {
      const [owners, managers, receptionists] = await Promise.all([
        apiFetch('/users?limit=50&sort=firstName&order=asc&role=OWNER') as Promise<{ data: { id: string; firstName: string; lastName: string }[] }>,
        apiFetch('/users?limit=50&sort=firstName&order=asc&role=MANAGER') as Promise<{ data: { id: string; firstName: string; lastName: string }[] }>,
        apiFetch('/users?limit=50&sort=firstName&order=asc&role=RECEPTIONIST') as Promise<{ data: { id: string; firstName: string; lastName: string }[] }>,
      ]);
      return { data: [...owners.data, ...managers.data, ...receptionists.data] };
    },
  });

  const [notes, setNotes] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineComment, setDeclineComment] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('09:00');
  const [plannedItems, setPlannedItems] = useState<PlannedItem[]>([]);
  const [showAddPlanned, setShowAddPlanned] = useState(false);
  const [plannedTab, setPlannedTab] = useState<'LABOR' | 'PART'>('LABOR');
  const [selectedService, setSelectedService] = useState<{ id: string; name: string; price: string | number; normHours: string | number | null } | null>(null);
  const [selectedPart, setSelectedPart] = useState<{ id: string; name: string; sellPrice: string | number; brand: string | null } | null>(null);
  const [partQty, setPartQty] = useState('1');

  // Load stock info for planned parts
  const partIds = plannedItems.filter((i) => i.type === 'PART' && i.partId).map((i) => i.partId!);
  const { data: stockMap } = useQuery<Record<string, number>>({
    queryKey: ['part-stocks', partIds.join(',')],
    queryFn: async () => {
      if (partIds.length === 0) return {};
      const results = await Promise.all(
        partIds.map((pid) => apiFetch<{ currentStock: number }>(`/parts/${pid}`).catch(() => null)),
      );
      const map: Record<string, number> = {};
      partIds.forEach((pid, i) => { if (results[i]) map[pid] = results[i]!.currentStock ?? 0; });
      return map;
    },
    enabled: partIds.length > 0,
    staleTime: 30_000,
  });

  if (appointment && !initialized) {
    setNotes(appointment.notes || '');
    setAdvisorId(appointment.advisor?.id || '');
    if (appointment.plannedItems && Array.isArray(appointment.plannedItems)) {
      setPlannedItems(appointment.plannedItems as PlannedItem[]);
    }
    if (column === 'estimating' && appointment.scheduledStart) {
      const d = new Date(appointment.scheduledStart);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      setArrivalDate(`${y}-${m}-${day}`);
      setArrivalTime(`${h}:${min}`);
    }
    setInitialized(true);
  }

  async function handleDecline() {
    if (!declineReason) {
      setError('Выберите причину отказа');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cancelReason: declineReason,
          cancelComment: declineComment || null,
        }),
      });
      await apiFetch(`/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  function handleAddPlannedLabor() {
    if (!selectedService) return;
    const normHours = selectedService.normHours ? Number(selectedService.normHours) : 1;
    setPlannedItems([...plannedItems, {
      type: 'LABOR',
      description: selectedService.name,
      quantity: normHours,
      unitPrice: 2000,
      normHours,
      serviceId: selectedService.id,
    }]);
    setSelectedService(null);
    setShowAddPlanned(false);
  }

  function handleAddPlannedPart() {
    if (!selectedPart) return;
    setPlannedItems([...plannedItems, {
      type: 'PART',
      description: selectedPart.name,
      quantity: Number(partQty) || 1,
      unitPrice: Number(selectedPart.sellPrice),
      partId: selectedPart.id,
    }]);
    setSelectedPart(null);
    setPartQty('1');
    setShowAddPlanned(false);
  }

  function handleRemovePlannedItem(idx: number) {
    setPlannedItems(plannedItems.filter((_, i) => i !== idx));
  }

  async function handleSaveAppointment() {
    setSaving(true);
    setError('');
    try {
      const body: any = {
        notes: notes || null,
        advisorId: advisorId || null,
      };
      if (column === 'estimating') {
        body.plannedItems = plannedItems;
        if (arrivalDate) {
          body.scheduledStart = `${arrivalDate}T${arrivalTime}:00`;
          const endH = String(Math.min(Number(arrivalTime.split(':')[0]) + 1, 23)).padStart(2, '0');
          body.scheduledEnd = `${arrivalDate}T${endH}:${arrivalTime.split(':')[1]}:00`;
        }
      }
      await apiFetch(`/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      refetchAppt();
      queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleAction() {
    setSaving(true);
    setError('');
    try {
      if (column === 'appeal') {
        // Save notes and advisor before changing status
        await apiFetch(`/appointments/${appointmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ notes: notes || null, advisorId: advisorId || null }),
        });
        await apiFetch(`/appointments/${appointmentId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ESTIMATING' }),
        });
      } else if (column === 'estimating') {
        if (!arrivalDate) {
          setError('Укажите дату приезда');
          setSaving(false);
          return;
        }
        const scheduledStart = `${arrivalDate}T${arrivalTime}:00`;
        const endH = String(Math.min(Number(arrivalTime.split(':')[0]) + 1, 23)).padStart(2, '0');
        const scheduledEnd = `${arrivalDate}T${endH}:${arrivalTime.split(':')[1]}:00`;
        await apiFetch(`/appointments/${appointmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ scheduledStart, scheduledEnd, notes: notes || null, advisorId: advisorId || null, plannedItems }),
        });
        await apiFetch(`/appointments/${appointmentId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        });
      } else if (column === 'scheduled') {
        await apiFetch(`/work-orders/from-appointment/${appointmentId}`, { method: 'POST' });
      }
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
      refetchAppt();
    } finally {
      setSaving(false);
    }
  }

  const plannedLabors = plannedItems.filter((i) => i.type === 'LABOR');
  const plannedParts = plannedItems.filter((i) => i.type === 'PART');
  const plannedTotal = plannedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const canConfirm = column === 'estimating' ? !!(arrivalDate && plannedLabors.length > 0) : true;
  const actionLabel = column === 'appeal' ? 'На согласование' : column === 'estimating' ? 'Подтвердить' : column === 'scheduled' ? 'Создать заказ-наряд' : null;
  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl ${column === 'estimating' || (column === 'scheduled' && plannedItems.length > 0) ? 'max-w-2xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {column === 'appeal' ? 'Обращение' : column === 'estimating' ? 'Согласование' : 'Запись'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Загрузка...</div>
        ) : appointment ? (
          <div className="mt-4 space-y-4">
            {/* Client info */}
            <div className="cursor-pointer rounded-lg bg-gray-50 p-3 transition-colors hover:bg-primary-50/50 hover:ring-1 hover:ring-primary-300" onClick={() => setSubModal('client')}>
              <p className="text-xs font-medium text-gray-500">Клиент</p>
              <p className="text-sm font-semibold text-gray-900">
                {appointment.client.firstName} {appointment.client.lastName}
              </p>
              {appointment.client.phone && (
                <p className="text-xs text-gray-600">{appointment.client.phone}</p>
              )}
              {appointment.client.email && (
                <p className="text-xs text-gray-500">{appointment.client.email}</p>
              )}
            </div>

            {/* Vehicle info */}
            <div className="cursor-pointer rounded-lg bg-gray-50 p-3 transition-colors hover:bg-primary-50/50 hover:ring-1 hover:ring-primary-300" onClick={() => setSubModal('vehicle')}>
              <p className="text-xs font-medium text-gray-500">Автомобиль</p>
              <p className="text-sm font-semibold text-gray-900">
                {appointment.vehicle.make} {appointment.vehicle.model}
                {appointment.vehicle.year ? ` (${appointment.vehicle.year})` : ''}
              </p>
              {appointment.vehicle.licensePlate && (
                <p className="text-xs text-gray-600">{appointment.vehicle.licensePlate}</p>
              )}
              {appointment.vehicle.mileage != null && (
                <p className="text-xs text-gray-500">{appointment.vehicle.mileage.toLocaleString('ru-RU')} км</p>
              )}
            </div>

            {/* Dates (read-only) */}
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">Дата обращения</p>
              <p className="text-sm text-gray-900">
                {new Date(appointment.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {column === 'scheduled' && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-600">Дата записи (приезд)</p>
                <p className="text-sm font-semibold text-blue-900">
                  {new Date(appointment.scheduledStart).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
            {/* Advisor */}
            <div>
              <label className="block text-xs font-medium text-gray-600">Приёмщик</label>
              <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} className={inputCls}>
                <option value="">Не назначен</option>
                {advisors?.data?.map((a) => (
                  <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600">Заметки / жалобы</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Причина обращения..."
                className={inputCls}
              />
            </div>

            {/* Arrival date/time — only on estimating step */}
            {column === 'estimating' && (
              <div>
                <label className="block text-xs font-medium text-gray-600">Дата и время приезда *</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} className={inputCls} />
                  <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            {/* Planned items — estimating (editable) and scheduled (read-only) */}
            {(column === 'estimating' || (column === 'scheduled' && plannedItems.length > 0)) && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-gray-700">
                    Работы и материалы ({plannedItems.length})
                  </span>
                  {plannedTotal > 0 && (
                    <span className="text-sm font-bold text-gray-900">{formatMoney(plannedTotal)}</span>
                  )}
                </div>
                <div className="border-t border-gray-200">
                  {/* Tabs */}
                  <div className="flex border-b border-gray-100">
                    <button
                      type="button"
                      onClick={() => setPlannedTab('LABOR')}
                      className={`flex-1 px-3 py-2 text-xs font-medium ${plannedTab === 'LABOR' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Работы ({plannedLabors.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlannedTab('PART')}
                      className={`flex-1 px-3 py-2 text-xs font-medium ${plannedTab === 'PART' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Материалы ({plannedParts.length})
                    </button>
                  </div>

                  <div className="px-3 py-2">
                    {plannedTab === 'LABOR' ? (
                      <>
                        {plannedLabors.length > 0 ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-left text-gray-500">
                                <th className="pb-1 font-medium">Наименование</th>
                                <th className="pb-1 font-medium text-right w-16">Норма</th>
                                <th className="pb-1 font-medium text-right w-20">Всего</th>
                                <th className="pb-1 font-medium text-right">в т.ч. НДС</th>
                                {column === 'estimating' && <th className="pb-1 w-6"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {plannedItems.map((item, idx) => item.type === 'LABOR' && (
                                <tr key={idx} className="border-b border-gray-50">
                                  <td className="py-1.5 text-gray-700">{item.description}</td>
                                  <td className="py-1.5 text-right text-gray-600">{item.normHours ?? item.quantity}</td>
                                  <td className="py-1.5 text-right font-medium text-gray-700">{formatMoney(item.unitPrice * item.quantity)}</td>
                                  <td className="py-1.5 text-right text-gray-400">{formatVat(item.unitPrice * item.quantity)}</td>
                                  {column === 'estimating' && (
                                    <td className="py-1.5 text-right">
                                      <button onClick={() => handleRemovePlannedItem(idx)} className="text-red-400 hover:text-red-600">&times;</button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="py-3 text-center text-xs text-gray-400">Нет работ</p>
                        )}
                        {column === 'estimating' && (
                        <div className="mt-2">
                          {showAddPlanned && plannedTab === 'LABOR' ? (
                            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
                              <SearchableServiceSelect
                                inputClassName={inputCls}
                                onSelect={(svc) => setSelectedService(svc)}
                              />
                              {selectedService && (() => {
                                const norm = selectedService.normHours ? Number(selectedService.normHours) : 1;
                                const total = 2000 * norm;
                                return (
                                  <div className="rounded bg-white px-3 py-2 text-xs text-gray-600 space-y-0.5">
                                    <div className="flex justify-between"><span>{selectedService.name}</span></div>
                                    <div className="flex justify-between"><span>Цена н/ч:</span><span className="font-medium">2 000 ₽</span></div>
                                    <div className="flex justify-between"><span>Норма:</span><span className="font-medium">{norm}</span></div>
                                    <div className="flex justify-between"><span>Всего:</span><span className="font-semibold text-gray-900">{formatMoney(total)}</span></div>
                                  </div>
                                );
                              })()}
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setShowAddPlanned(false); setSelectedService(null); }} className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Отмена</button>
                                <button type="button" onClick={handleAddPlannedLabor} disabled={!selectedService} className="flex-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">Добавить</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setShowAddPlanned(true); setPlannedTab('LABOR'); }} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Добавить работу</button>
                          )}
                        </div>
                        )}
                      </>
                    ) : (
                      <>
                        {plannedParts.length > 0 ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 text-left text-gray-500">
                                <th className="pb-1 font-medium">Наименование</th>
                                <th className="pb-1 font-medium text-right w-16">Кол-во</th>
                                <th className="pb-1 font-medium text-right w-16">Остаток</th>
                                <th className="pb-1 font-medium text-right w-20">Всего</th>
                                <th className="pb-1 font-medium text-right">в т.ч. НДС</th>
                                {column === 'estimating' && <th className="pb-1 w-6"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {plannedItems.map((item, idx) => {
                                if (item.type !== 'PART') return null;
                                const stock = item.partId && stockMap ? stockMap[item.partId] : undefined;
                                const outOfStock = stock !== undefined && stock < item.quantity;
                                return (
                                <tr key={idx} className="border-b border-gray-50">
                                  <td className="py-1.5 text-gray-700">{item.description}</td>
                                  <td className="py-1.5 text-right text-gray-600">{item.quantity}</td>
                                  <td className={`py-1.5 text-right font-medium ${outOfStock ? 'text-red-600' : 'text-green-600'}`}>
                                    {stock !== undefined ? stock : '—'}
                                  </td>
                                  <td className="py-1.5 text-right font-medium text-gray-700">{formatMoney(item.unitPrice * item.quantity)}</td>
                                  <td className="py-1.5 text-right text-gray-400">{formatVat(item.unitPrice * item.quantity)}</td>
                                  {column === 'estimating' && (
                                    <td className="py-1.5 text-right">
                                      <button onClick={() => handleRemovePlannedItem(idx)} className="text-red-400 hover:text-red-600">&times;</button>
                                    </td>
                                  )}
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <p className="py-3 text-center text-xs text-gray-400">Нет материалов</p>
                        )}
                        {column === 'estimating' && (
                        <div className="mt-2">
                          {showAddPlanned && plannedTab === 'PART' ? (
                            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
                              <SearchablePartSelect
                                inputClassName={inputCls}
                                onSelect={(p) => setSelectedPart(p)}
                              />
                              {selectedPart && (
                                <div className="rounded bg-white px-3 py-2 text-xs text-gray-600">
                                  {selectedPart.name} — {formatMoney(selectedPart.sellPrice)}
                                </div>
                              )}
                              <input type="number" min={1} value={partQty} onChange={(e) => setPartQty(e.target.value)} placeholder="Кол-во" className={inputCls} />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setShowAddPlanned(false); setSelectedPart(null); setPartQty('1'); }} className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Отмена</button>
                                <button type="button" onClick={handleAddPlannedPart} disabled={!selectedPart} className="flex-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">Добавить</button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setShowAddPlanned(true); setPlannedTab('PART'); }} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Добавить материал</button>
                          )}
                        </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Totals */}
                  {plannedTotal > 0 && (
                    <div className="flex justify-end gap-4 border-t border-gray-100 px-4 py-2">
                      <div className="text-xs text-gray-500">
                        Работы: <span className="font-semibold text-gray-700">{formatMoney(plannedLabors.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Материалы: <span className="font-semibold text-gray-700">{formatMoney(plannedParts.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</span>
                      </div>
                      <div className="text-sm font-bold text-gray-900">
                        Итого: {formatMoney(plannedTotal)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Decline form */}
            {showDecline && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-medium text-red-800">Причина отказа</p>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Выберите причину</option>
                  <option value="Дорого">Дорого</option>
                  <option value="Долго ждать">Долго ждать</option>
                  <option value="Передумал">Передумал</option>
                  <option value="Обратился в другой сервис">Обратился в другой сервис</option>
                  <option value="Не отвечает">Не отвечает</option>
                  <option value="Другое">Другое</option>
                </select>
                <input
                  type="text"
                  value={declineComment}
                  onChange={(e) => setDeclineComment(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  className={inputCls}
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowDecline(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Назад
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving ? '...' : 'Отказать'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {!showDecline && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowDecline(true)}
                  disabled={saving}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Отказ
                </button>
                {column === 'estimating' && (
                  <button
                    onClick={handleSaveAppointment}
                    disabled={saving}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving ? '...' : 'Сохранить'}
                  </button>
                )}
                {actionLabel && (
                  <button
                    onClick={handleAction}
                    disabled={saving || !canConfirm}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? '...' : actionLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-red-500">Не удалось загрузить данные</div>
        )}
      </div>
    </div>

    {subModal === 'client' && appointment && (
      <ClientHistoryModal clientId={appointment.client.id} client={appointment.client} onClose={() => setSubModal(null)} />
    )}
    {subModal === 'vehicle' && appointment && (
      <VehicleHistoryModal vehicleId={appointment.vehicle.id} vehicle={appointment.vehicle} onClose={() => setSubModal(null)} />
    )}
    </>
  );
}

// --- Client History Modal ---

function ClientHistoryModal({
  clientId,
  client,
  onClose,
}: {
  clientId: string;
  client: { firstName: string; lastName: string; phone: string | null; email: string | null };
  onClose: () => void;
}) {
  const { data: fullClient } = useQuery<{
    id: string; firstName: string; lastName: string; middleName: string | null;
    phone: string | null; email: string | null; dateOfBirth: string | null; createdAt: string;
  }>({
    queryKey: ['client-history', clientId],
    queryFn: () => apiFetch(`/users/${clientId}`),
  });

  const { data: vehicles } = useQuery<{
    data: { id: string; make: string; model: string; year: number | null; licensePlate: string | null; mileage: number | null }[];
  }>({
    queryKey: ['client-history-vehicles', clientId],
    queryFn: () => apiFetch(`/vehicles?clientId=${clientId}&limit=50`),
  });

  const { data: workOrders } = useQuery<{
    data: { id: string; orderNumber: string; status: string; totalAmount: string | number; createdAt: string;
      vehicle: { make: string; model: string; licensePlate: string | null } }[];
    meta: { total: number };
  }>({
    queryKey: ['client-history-wo', clientId],
    queryFn: () => apiFetch(`/work-orders?clientId=${clientId}&limit=50&sort=createdAt&order=desc`),
  });

  const c = fullClient || client;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Клиент</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <div className="text-lg font-medium text-gray-900">
            {c.firstName} {c.lastName} {(fullClient as any)?.middleName || ''}
          </div>
          {c.phone && <div className="mt-1 text-sm text-gray-600">{c.phone}</div>}
          {c.email && <div className="text-sm text-gray-600">{c.email}</div>}
          {fullClient?.dateOfBirth && (
            <div className="mt-1 text-sm text-gray-500">
              Дата рождения: {new Date(fullClient.dateOfBirth).toLocaleDateString('ru-RU')}
            </div>
          )}
          {fullClient?.createdAt && (
            <div className="text-sm text-gray-500">
              Клиент с: {new Date(fullClient.createdAt).toLocaleDateString('ru-RU')}
            </div>
          )}
        </div>

        <h3 className="mt-5 text-sm font-semibold uppercase text-gray-500">
          Автомобили {vehicles?.data && `(${vehicles.data.length})`}
        </h3>
        {!vehicles ? (
          <div className="mt-2 text-center text-sm text-gray-500">Загрузка...</div>
        ) : vehicles.data.length === 0 ? (
          <div className="mt-2 text-center text-sm text-gray-500">Нет автомобилей</div>
        ) : (
          <div className="mt-2 space-y-2">
            {vehicles.data.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-medium text-gray-900">
                  {v.make} {v.model} {v.year ? `(${v.year})` : ''}
                </div>
                {v.licensePlate && <div className="text-xs font-mono text-gray-500">{v.licensePlate}</div>}
                {v.mileage != null && <div className="text-xs text-gray-400">{v.mileage.toLocaleString('ru-RU')} км</div>}
              </div>
            ))}
          </div>
        )}

        <h3 className="mt-5 text-sm font-semibold uppercase text-gray-500">
          История заказов {workOrders?.meta?.total != null && `(${workOrders.meta.total})`}
        </h3>

        {!workOrders ? (
          <div className="mt-3 text-center text-sm text-gray-500">Загрузка...</div>
        ) : workOrders.data.length === 0 ? (
          <div className="mt-3 text-center text-sm text-gray-500">Заказов нет</div>
        ) : (
          <div className="mt-3 space-y-2">
            {workOrders.data.map((wo) => (
              <a
                key={wo.id}
                href={`/work-orders/${wo.id}`}
                className="block rounded-lg border border-gray-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-primary-600">{wo.orderNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CARD_BADGE_COLORS[wo.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[wo.status] || wo.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {wo.vehicle.make} {wo.vehicle.model}
                    {wo.vehicle.licensePlate ? ` \u00B7 ${wo.vehicle.licensePlate}` : ''}
                  </span>
                  <span className="font-medium text-gray-900">{formatMoney(wo.totalAmount)}</span>
                </div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {new Date(wo.createdAt).toLocaleDateString('ru-RU')}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Vehicle History Modal ---

function VehicleHistoryModal({
  vehicleId,
  vehicle,
  onClose,
}: {
  vehicleId: string;
  vehicle: { make: string; model: string; licensePlate: string | null; year: number | null; mileage: number | null };
  onClose: () => void;
}) {
  const { data: fullVehicle } = useQuery<{
    id: string; make: string; model: string; year: number | null; vin: string | null;
    licensePlate: string | null; color: string | null; mileage: number | null; createdAt: string;
    client: { id: string; firstName: string; lastName: string; phone: string | null; email: string };
    workOrders: { id: string; orderNumber: string; status: string; totalAmount: string | number; createdAt: string }[];
  }>({
    queryKey: ['vehicle-history', vehicleId],
    queryFn: () => apiFetch(`/vehicles/${vehicleId}`),
  });

  const v = fullVehicle || vehicle;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Автомобиль</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 p-4">
          <div className="text-lg font-medium text-gray-900">
            {v.make} {v.model} {v.year ? `(${v.year})` : ''}
          </div>
          {v.licensePlate && <div className="mt-1 font-mono text-sm text-gray-600">{v.licensePlate}</div>}
          {fullVehicle?.vin && <div className="text-xs text-gray-500">VIN: {fullVehicle.vin}</div>}
          {fullVehicle?.color && <div className="text-sm text-gray-500">Цвет: {fullVehicle.color}</div>}
          {v.mileage != null && (
            <div className="text-sm text-gray-500">Пробег: {v.mileage.toLocaleString('ru-RU')} км</div>
          )}
          {fullVehicle?.client && (
            <div className="mt-2 text-sm text-gray-500">
              Владелец: {fullVehicle.client.firstName} {fullVehicle.client.lastName}
            </div>
          )}
        </div>

        <h3 className="mt-5 text-sm font-semibold uppercase text-gray-500">
          История заказов {fullVehicle?.workOrders && `(${fullVehicle.workOrders.length})`}
        </h3>

        {!fullVehicle ? (
          <div className="mt-3 text-center text-sm text-gray-500">Загрузка...</div>
        ) : fullVehicle.workOrders.length === 0 ? (
          <div className="mt-3 text-center text-sm text-gray-500">Заказов нет</div>
        ) : (
          <div className="mt-3 space-y-2">
            {fullVehicle.workOrders.map((wo) => (
              <a
                key={wo.id}
                href={`/work-orders/${wo.id}`}
                className="block rounded-lg border border-gray-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-primary-600">{wo.orderNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CARD_BADGE_COLORS[wo.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[wo.status] || wo.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium text-gray-900">{formatMoney(wo.totalAmount)}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {new Date(wo.createdAt).toLocaleDateString('ru-RU')}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Work Order Detail Modal ---

interface WorkOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  diagnosticNotes: string | null;
  inspectionChecklist: InspectionChecklist | null;
  totalLabor: string | number;
  totalParts: string | number;
  totalAmount: string | number;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; vin: string | null; mileage: number | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  mechanic: { id: string; firstName: string; lastName: string } | null;
  items: {
    id: string;
    type: string;
    description: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    normHours: number | null;
    recommended: boolean;
    approvedByClient: boolean | null;
    mechanics: { id: string; contributionPercent: number; mechanic: { id: string; firstName: string; lastName: string } }[];
  }[];
  workLogs: {
    id: string;
    description: string;
    hoursWorked: number;
    logDate: string;
    mechanic: { id: string; firstName: string; lastName: string } | null;
  }[];
}

function WorkOrderDetailModal({
  workOrderId,
  onClose,
  onUpdate,
}: {
  workOrderId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: wo, isLoading, refetch: refetchWo } = useQuery<WorkOrderDetail>({
    queryKey: ['work-order-detail', workOrderId],
    queryFn: () => apiFetch(`/work-orders/${workOrderId}`),
    staleTime: 0,
  });

  const { data: mechanics } = useQuery<{ data: { id: string; firstName: string; lastName: string }[] }>({
    queryKey: ['mechanics-modal'],
    queryFn: () => apiFetch('/users?limit=50&role=MECHANIC'),
  });

  const [complaints, setComplaints] = useState('');
  const [checklist, setChecklist] = useState<InspectionChecklist>(createEmptyChecklist());
  const [mechanicId, setMechanicId] = useState('');
  const [mileage, setMileage] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Add item
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemTab, setAddItemTab] = useState<'LABOR' | 'PART'>('LABOR');
  const [selectedService, setSelectedService] = useState<{ id: string; name: string; price: string | number; normHours: string | number | null } | null>(null);
  const [selectedPart, setSelectedPart] = useState<{ id: string; name: string; sellPrice: string | number; brand: string | null } | null>(null);
  const [partQty, setPartQty] = useState('1');

  if (wo && !initialized) {
    setComplaints(wo.clientComplaints || '');
    if (wo.inspectionChecklist) {
      setChecklist({ ...createEmptyChecklist(), ...wo.inspectionChecklist });
    }
    // Use WO mechanic, or fallback to first mechanic from items
    let initMechanicId = wo.mechanic?.id || '';
    if (!initMechanicId && wo.items.length > 0) {
      const firstItemMechanic = wo.items.find((i) => i.mechanics?.length > 0)?.mechanics[0]?.mechanic;
      if (firstItemMechanic) initMechanicId = firstItemMechanic.id;
    }
    setMechanicId(initMechanicId);
    setMileage(wo.vehicle.mileage != null ? String(wo.vehicle.mileage) : '');
    setInitialized(true);
  }

  const next = wo ? WO_NEXT_STATUS[wo.status] : null;
  const isEditable = wo && !['CLOSED', 'CANCELLED'].includes(wo.status);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Обновляем пробег на автомобиле (только в большую сторону)
      const newMileage = mileage ? Number(mileage) : null;
      if (wo && newMileage != null) {
        const currentMileage = wo.vehicle.mileage || 0;
        if (newMileage < currentMileage) {
          setError('Пробег не может быть меньше текущего (' + currentMileage.toLocaleString('ru-RU') + ' км)');
          setSaving(false);
          return;
        }
        if (newMileage !== currentMileage) {
          await apiFetch(`/vehicles/${wo.vehicle.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ mileage: newMileage }),
          });
        }
      }
      await apiFetch(`/work-orders/${workOrderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clientComplaints: complaints || null,
          inspectionChecklist: checklist,
          mechanicId: mechanicId || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleNextStatus() {
    if (!next) return;
    // Требуем механика для любого перехода вперёд
    const MECHANIC_REQUIRED = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'];
    if (!mechanicId && MECHANIC_REQUIRED.includes(wo?.status || '')) {
      setError('Назначьте механика перед переводом заказ-наряда');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Сохраняем механика перед переходом статуса
      if (mechanicId && wo && !wo.mechanic?.id) {
        await apiFetch(`/work-orders/${workOrderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ mechanicId }),
        });
      }
      await apiFetch(`/work-orders/${workOrderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next.status }),
      });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
      refetchWo();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddServiceFromChecklist(svc: { id: string; name: string; normHours: string | number | null }) {
    setSaving(true);
    setError('');
    try {
      const normHours = svc.normHours ? Number(svc.normHours) : 1;
      await apiFetch(`/work-orders/${workOrderId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'LABOR',
          description: svc.name,
          quantity: normHours,
          unitPrice: 2000,
          normHours,
          serviceId: svc.id,
          recommended: true,
          mechanicId: mechanicId || undefined,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка добавления');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRecommendation(itemKey: string, description: string) {
    // Find the recommended WO item matching this checklist entry
    const item = wo?.items.find((i) => i.recommended && i.description === description);
    if (!item) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${item.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления');
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveItem(itemId: string, approved: boolean) {
    setSaving(true);
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ approvedByClient: approved }),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка согласования');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLabor() {
    if (!selectedService) return;
    setSaving(true);
    setError('');
    try {
      const normHours = selectedService.normHours ? Number(selectedService.normHours) : 1;
      await apiFetch(`/work-orders/${workOrderId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'LABOR',
          description: selectedService.name,
          quantity: normHours,
          unitPrice: 2000,
          normHours,
          serviceId: selectedService.id,
          mechanicId: mechanicId || undefined,
        }),
      });
      setSelectedService(null);
      setShowAddItem(false);
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка добавления');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPart() {
    if (!selectedPart) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/work-orders/${workOrderId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'PART',
          description: selectedPart.name,
          quantity: Number(partQty) || 1,
          unitPrice: Number(selectedPart.sellPrice),
          partId: selectedPart.id,
        }),
      });
      setSelectedPart(null);
      setPartQty('1');
      setShowAddItem(false);
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка добавления');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления');
    }
  }

  async function handleUpdateItem(itemId: string, data: { unitPrice?: number; quantity?: number; normHours?: number }) {
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка обновления');
    }
  }

  async function handleAddItemMechanic(itemId: string, newMechanicId: string) {
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}/mechanics`, {
        method: 'POST',
        body: JSON.stringify({ mechanicId: newMechanicId }),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка назначения мастера');
    }
  }

  async function handleUpdateItemMechanic(itemId: string, entryId: string, contributionPercent: number) {
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}/mechanics/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ contributionPercent }),
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка обновления %');
    }
  }

  async function handleRemoveItemMechanic(itemId: string, entryId: string) {
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${itemId}/mechanics/${entryId}`, {
        method: 'DELETE',
      });
      queryClient.invalidateQueries({ queryKey: ['work-order-detail', workOrderId] });
    } catch (err: any) {
      setError(err.message || 'Ошибка удаления мастера');
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{wo?.orderNumber || '...'}</h2>
            {wo && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CARD_BADGE_COLORS[wo.status] || 'bg-gray-100'}`}>
                {STATUS_LABELS[wo.status]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Загрузка...</div>
        ) : wo ? (
          <div className="mt-4 space-y-4">
            {/* Client + Vehicle (read-only) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Клиент</p>
                <p className="text-sm font-semibold text-gray-900">
                  {wo.client.firstName} {wo.client.lastName}
                </p>
                {wo.client.phone && <p className="text-xs text-gray-600">{wo.client.phone}</p>}
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Автомобиль</p>
                <p className="text-sm font-semibold text-gray-900">
                  {wo.vehicle.make} {wo.vehicle.model}
                  {wo.vehicle.year ? ` (${wo.vehicle.year})` : ''}
                </p>
                {wo.vehicle.licensePlate && <p className="text-xs text-gray-600">{wo.vehicle.licensePlate}</p>}
                {wo.vehicle.vin && <p className="text-xs text-gray-400 font-mono">{wo.vehicle.vin}</p>}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Пробег:</span>
                  {isEditable ? (
                    <input
                      type="number"
                      value={mileage}
                      min={wo.vehicle.mileage || 0}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder="км"
                      className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                    />
                  ) : (
                    <span className="text-xs font-medium text-gray-900">
                      {wo.vehicle.mileage != null ? wo.vehicle.mileage.toLocaleString('ru-RU') : '—'}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">км</span>
                </div>
              </div>
            </div>

            {/* Editable fields */}
            {isEditable && (
              <>
                {/* Complaints - relevant for NEW (intake) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">Жалобы клиента</label>
                  <textarea
                    value={complaints}
                    onChange={(e) => setComplaints(e.target.value)}
                    rows={2}
                    placeholder="Что беспокоит клиента..."
                    className={inputCls}
                  />
                </div>

                {/* Inspection checklist - relevant for DIAGNOSED+ */}
                {['DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(wo.status) && (
                  <InspectionChecklistEditor
                    checklist={checklist}
                    onChange={setChecklist}
                    onAddService={handleAddServiceFromChecklist}
                    onRemoveRecommendation={handleRemoveRecommendation}
                    woItems={wo.items}
                  />
                )}

                {/* Mechanic */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">Механик</label>
                  <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value)} className={inputCls}>
                    <option value="">Не назначен</option>
                    {mechanics?.data?.map((m) => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Items — collapsible with tabs */}
            {(() => {
              const regularItems = wo.items.filter((i) => !i.recommended);
              const recommendedItems = wo.items.filter((i) => i.recommended);
              const regularTotal = regularItems.reduce((sum, i) => sum + Number(i.totalPrice), 0);
              const regularLabor = regularItems.filter((i) => i.type === 'LABOR').reduce((sum, i) => sum + Number(i.totalPrice), 0);
              const regularParts = regularItems.filter((i) => i.type === 'PART').reduce((sum, i) => sum + Number(i.totalPrice), 0);
              const approvedRecommendedTotal = recommendedItems.filter((i) => i.approvedByClient === true).reduce((sum, i) => sum + Number(i.totalPrice), 0);
              const grandTotal = regularTotal + approvedRecommendedTotal;
              return (
                <>
                  <ItemsSection
                    items={regularItems}
                    totalLabor={regularLabor}
                    totalParts={regularParts}
                    totalAmount={regularTotal}
                    isEditable={!!isEditable}
                    showAddItem={showAddItem}
                    setShowAddItem={setShowAddItem}
                    addItemTab={addItemTab}
                    setAddItemTab={setAddItemTab}
                    selectedService={selectedService}
                    setSelectedService={setSelectedService}
                    selectedPart={selectedPart}
                    setSelectedPart={setSelectedPart}
                    partQty={partQty}
                    setPartQty={setPartQty}
                    saving={saving}
                    onAddLabor={handleAddLabor}
                    onAddPart={handleAddPart}
                    onDeleteItem={handleDeleteItem}
                    onUpdateItem={handleUpdateItem}
                    mechanics={mechanics?.data || []}
                    defaultMechanicId={mechanicId}
                    onAddItemMechanic={handleAddItemMechanic}
                    onUpdateItemMechanic={handleUpdateItemMechanic}
                    onRemoveItemMechanic={handleRemoveItemMechanic}
                  />

                  {recommendedItems.length > 0 && (
                    <RecommendedSection
                      items={recommendedItems}
                      status={wo.status}
                      saving={saving}
                      onApproveItem={handleApproveItem}
                      onDeleteItem={handleDeleteItem}
                    />
                  )}

                  {/* Общая сумма */}
                  <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-semibold text-gray-700">Общая сумма</span>
                    <span className="text-lg font-bold text-gray-900">{formatMoney(grandTotal)}</span>
                  </div>
                </>
              );
            })()}

            {/* Work logs */}
            {wo.workLogs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600">Журнал работ</p>
                <div className="mt-1 space-y-1">
                  {wo.workLogs.map((log) => (
                    <div key={log.id} className="rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">{formatShortDate(log.logDate)}</span>
                      {' — '}
                      {log.description}
                      {log.mechanic && (
                        <span className="ml-1 text-gray-400">({log.mechanic.firstName} {log.mechanic.lastName})</span>
                      )}
                      <span className="ml-1 text-gray-400">{log.hoursWorked}ч</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-2">
              {isEditable && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {saving ? '...' : 'Сохранить'}
                </button>
              )}
              {next && (() => {
                const MECHANIC_REQUIRED = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED'];
                const needsMechanic = MECHANIC_REQUIRED.includes(wo?.status || '') && !mechanicId;
                const laborItems = (wo?.items || []).filter((i: any) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true));
                const allLogsCompleted = (wo?.workLogs || []).length >= laborItems.length;
                const needsLogs = wo?.status === 'IN_PROGRESS' && next.status === 'COMPLETED' && !allLogsCompleted;
                return (
                  <>
                    <button
                      onClick={handleNextStatus}
                      disabled={saving || needsMechanic || needsLogs}
                      title={needsMechanic ? 'Назначьте механика' : needsLogs ? 'Отметьте все работы в Логах работ' : undefined}
                      className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? '...' : next.label}
                    </button>
                    {needsLogs && (
                      <p className="w-full text-xs text-amber-600 mt-1">
                        Отметьте все работы в{' '}
                        <a href={`/work-orders/${workOrderId}`} className="underline hover:text-amber-700">
                          Логах работ
                        </a>
                        {' '}перед переводом в &laquo;Готов&raquo;
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-red-500">Не удалось загрузить данные</div>
        )}
      </div>
    </div>
  );
}

// --- Inspection Checklist Components ---

// --- Editable table rows ---

type ItemRow = { id: string; type: string; description: string; quantity: number; unitPrice: string | number; totalPrice: string | number; normHours: number | null; mechanics: { id: string; contributionPercent: number; mechanic: { id: string; firstName: string; lastName: string } }[] };

function EditableLaborRow({
  item,
  isEditable,
  mechanics,
  defaultMechanicId,
  onUpdate,
  onDelete,
  onAddItemMechanic,
  onUpdateItemMechanic,
  onRemoveItemMechanic,
}: {
  item: ItemRow;
  isEditable: boolean;
  mechanics: { id: string; firstName: string; lastName: string }[];
  defaultMechanicId: string;
  onUpdate: (id: string, data: { unitPrice?: number; quantity?: number; normHours?: number }) => void;
  onDelete: (id: string) => void;
  onAddItemMechanic: (itemId: string, mechanicId: string) => void;
  onUpdateItemMechanic: (itemId: string, entryId: string, pct: number) => void;
  onRemoveItemMechanic: (itemId: string, entryId: string) => void;
}) {
  const [price, setPrice] = useState(Number(item.unitPrice));
  const [norm, setNorm] = useState(item.normHours ?? Number(item.quantity));
  const [total, setTotal] = useState(Number(item.totalPrice));
  const [addMechanicId, setAddMechanicId] = useState('');

  const editCls = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-gray-300 focus:border-primary-400 focus:bg-white focus:outline-none';

  function changePrice(val: string) {
    const p = Number(val);
    if (isNaN(p)) return;
    setPrice(p);
    setTotal(Math.round(p * norm * 100) / 100);
  }

  function changeNorm(val: string) {
    const n = Number(val);
    if (isNaN(n)) return;
    setNorm(n);
    setTotal(Math.round(price * n * 100) / 100);
  }

  function changeTotal(val: string) {
    const t = Number(val);
    if (isNaN(t)) return;
    setTotal(t);
    if (price > 0) {
      setNorm(Math.round((t / price) * 100) / 100);
    }
  }

  function save() {
    const origPrice = Number(item.unitPrice);
    const origNorm = item.normHours ?? Number(item.quantity);
    if (price === origPrice && norm === origNorm) return;
    onUpdate(item.id, { unitPrice: price, quantity: norm, normHours: norm });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  // Assigned mechanic IDs for filtering the "add" dropdown
  const assignedMechanicIds = new Set(item.mechanics.map((m) => m.mechanic.id));
  const availableMechanics = mechanics.filter((m) => !assignedMechanicIds.has(m.id));

  if (!isEditable) {
    return (
      <tr className="border-b border-gray-50">
        <td className="py-1.5">
          <div className="text-gray-700">{item.description}</div>
          {item.mechanics.length > 0 && (
            <div className="text-[10px] text-gray-400">
              {item.mechanics.map((entry, i) => (
                <span key={entry.id}>
                  {i > 0 && ', '}
                  {entry.mechanic.firstName} {entry.mechanic.lastName}
                  {(item.mechanics.length > 1 || entry.contributionPercent !== 100) && (
                    <span className="ml-0.5 text-primary-500">{entry.contributionPercent}%</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="py-1.5 text-right text-gray-600">{formatMoney(item.unitPrice)}</td>
        <td className="py-1.5 text-right text-gray-600">{item.normHours ?? Number(item.quantity)}</td>
        <td className="py-1.5 text-right font-medium text-gray-700">{formatMoney(item.totalPrice)}</td>
        <td className="py-1.5 text-right text-gray-400">{formatVat(item.totalPrice)}</td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-50">
      <td className="py-1.5">
        <div className="text-gray-700">{item.description}</div>
        {/* Assigned mechanics list */}
        <div className="mt-0.5 space-y-0.5">
          {item.mechanics.map((entry) => (
            <MechanicEntryRow
              key={entry.id}
              entry={entry}
              itemId={item.id}
              onUpdate={onUpdateItemMechanic}
              onRemove={onRemoveItemMechanic}
            />
          ))}
          {/* Add new mechanic */}
          {availableMechanics.length > 0 && (
            <div className="flex items-center gap-0.5">
              <select
                value={addMechanicId}
                onChange={(e) => setAddMechanicId(e.target.value)}
                className="flex-1 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-[10px] text-gray-500 focus:border-primary-400 focus:outline-none"
              >
                <option value="">Мастер...</option>
                {availableMechanics.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (addMechanicId) {
                    onAddItemMechanic(item.id, addMechanicId);
                    setAddMechanicId('');
                  }
                }}
                disabled={!addMechanicId}
                className="rounded bg-primary-50 px-1 py-0.5 text-[10px] font-medium text-primary-600 hover:bg-primary-100 disabled:opacity-30"
              >
                +
              </button>
            </div>
          )}
        </div>
      </td>
      <td className="py-1.5 text-right">
        <input type="number" value={price} onChange={(e) => changePrice(e.target.value)} onBlur={save} onKeyDown={handleKeyDown} min={0} step={100} className={editCls} />
      </td>
      <td className="py-1.5 text-right">
        <input type="number" value={norm} onChange={(e) => changeNorm(e.target.value)} onBlur={save} onKeyDown={handleKeyDown} min={0.01} step={0.1} className={editCls} />
      </td>
      <td className="py-1.5 text-right">
        <input type="number" value={total} onChange={(e) => changeTotal(e.target.value)} onBlur={save} onKeyDown={handleKeyDown} min={0} step={100} className={`${editCls} font-medium`} />
      </td>
      <td className="py-1.5 text-right text-gray-400">{formatVat(total)}</td>
      <td className="py-1.5 text-right">
        <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-600">&times;</button>
      </td>
    </tr>
  );
}

function MechanicEntryRow({
  entry,
  itemId,
  onUpdate,
  onRemove,
}: {
  entry: { id: string; contributionPercent: number; mechanic: { id: string; firstName: string; lastName: string } };
  itemId: string;
  onUpdate: (itemId: string, entryId: string, pct: number) => void;
  onRemove: (itemId: string, entryId: string) => void;
}) {
  const [pct, setPct] = useState(entry.contributionPercent);

  useEffect(() => {
    setPct(entry.contributionPercent);
  }, [entry.contributionPercent]);

  function savePct() {
    if (pct === entry.contributionPercent) return;
    const clamped = Math.max(1, Math.min(100, Math.round(pct)));
    setPct(clamped);
    onUpdate(itemId, entry.id, clamped);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  return (
    <div className="flex items-center gap-0.5">
      <span className="flex-1 text-[10px] text-gray-500 truncate">
        {entry.mechanic.firstName} {entry.mechanic.lastName}
      </span>
      <input
        type="number"
        value={pct}
        onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) setPct(v); }}
        onBlur={savePct}
        onKeyDown={handleKeyDown}
        min={1}
        max={100}
        className="w-10 rounded border border-gray-200 bg-gray-50 px-0.5 py-0.5 text-center text-[10px] text-gray-500 focus:border-primary-400 focus:outline-none"
      />
      <span className="text-[10px] text-gray-400">%</span>
      <button
        type="button"
        onClick={() => onRemove(itemId, entry.id)}
        className="text-[10px] text-red-400 hover:text-red-600 ml-0.5"
      >
        &times;
      </button>
    </div>
  );
}

function EditablePartRow({
  item,
  isEditable,
  onUpdate,
  onDelete,
}: {
  item: ItemRow;
  isEditable: boolean;
  onUpdate: (id: string, data: { unitPrice?: number; quantity?: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [price, setPrice] = useState(Number(item.unitPrice));
  const [qty, setQty] = useState(Number(item.quantity));
  const [total, setTotal] = useState(Number(item.totalPrice));

  const editCls = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-gray-300 focus:border-primary-400 focus:bg-white focus:outline-none';

  function changePrice(val: string) {
    const p = Number(val);
    if (isNaN(p)) return;
    setPrice(p);
    setTotal(Math.round(p * qty * 100) / 100);
  }

  function changeQty(val: string) {
    const q = Number(val);
    if (isNaN(q)) return;
    setQty(q);
    setTotal(Math.round(price * q * 100) / 100);
  }

  function save() {
    const origPrice = Number(item.unitPrice);
    const origQty = Number(item.quantity);
    if (price === origPrice && qty === origQty) return;
    onUpdate(item.id, { unitPrice: price, quantity: qty });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  if (!isEditable) {
    return (
      <tr className="border-b border-gray-50">
        <td className="py-1.5 text-gray-700">{item.description}</td>
        <td className="py-1.5 text-right text-gray-600">{formatMoney(item.unitPrice)}</td>
        <td className="py-1.5 text-right text-gray-600">{Number(item.quantity)}</td>
        <td className="py-1.5 text-right font-medium text-gray-700">{formatMoney(item.totalPrice)}</td>
        <td className="py-1.5 text-right text-gray-400">{formatVat(item.totalPrice)}</td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-50">
      <td className="py-1.5 text-gray-700">{item.description}</td>
      <td className="py-1.5 text-right">
        <input type="number" value={price} onChange={(e) => changePrice(e.target.value)} onBlur={save} onKeyDown={handleKeyDown} min={0} step={1} className={editCls} />
      </td>
      <td className="py-1.5 text-right">
        <input type="number" value={qty} onChange={(e) => changeQty(e.target.value)} onBlur={save} onKeyDown={handleKeyDown} min={1} step={1} className={editCls} />
      </td>
      <td className="py-1.5 text-right font-medium text-gray-700">{formatMoney(total)}</td>
      <td className="py-1.5 text-right text-gray-400">{formatVat(total)}</td>
      <td className="py-1.5 text-right">
        <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-600">&times;</button>
      </td>
    </tr>
  );
}

function InspectionChecklistEditor({
  checklist,
  onChange,
  onAddService,
  onRemoveRecommendation,
  woItems,
}: {
  checklist: InspectionChecklist;
  onChange: (c: InspectionChecklist) => void;
  onAddService: (svc: { id: string; name: string; normHours: string | number | null }) => void;
  onRemoveRecommendation: (itemKey: string, description: string) => void;
  woItems: { id: string; description: string; recommended: boolean }[];
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [suggestForItem, setSuggestForItem] = useState<string | null>(null);
  const [suggestService, setSuggestService] = useState<{ id: string; name: string; normHours: string | number | null } | null>(null);
  const [autoRecommending, setAutoRecommending] = useState<string | null>(null);
  const checklistRef = useRef(checklist);
  checklistRef.current = checklist;

  async function autoRecommend(itemKey: string) {
    const cfg = AUTO_RECOMMEND_CONFIG[itemKey];
    if (!cfg) return;
    setAutoRecommending(itemKey);
    try {
      const res = await apiFetch(`/services?limit=5&sort=name&order=asc&search=${encodeURIComponent(cfg.searchQuery)}`) as { data?: { id: string; name: string; price: string | number; normHours: string | number | null }[] };
      const svc = res?.data?.[0];
      if (svc) {
        onChange({
          ...checklistRef.current,
          [itemKey]: { ...checklistRef.current[itemKey], recommended: true, recommendedDescription: svc.name },
        });
        onAddService(svc);
      } else {
        // Услуга не найдена — показываем ручной выбор
        setSuggestForItem(itemKey);
        setSuggestService(null);
      }
    } catch {
      setSuggestForItem(itemKey);
      setSuggestService(null);
    } finally {
      setAutoRecommending(null);
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleItem(itemKey: string) {
    const wasChecked = checklist[itemKey]?.checked;
    const entry = checklist[itemKey];
    if (wasChecked && entry?.recommended) {
      // Unchecking an item that has a recommendation — find and remove WO item
      const desc = entry.recommendedDescription;
      if (desc) {
        onRemoveRecommendation(itemKey, desc);
      } else {
        // Fallback for old entries without savedDescription: find last recommended item
        const lastRec = [...woItems].reverse().find((i) => i.recommended);
        if (lastRec) onRemoveRecommendation(itemKey, lastRec.description);
      }
      onChange({
        ...checklist,
        [itemKey]: { ...checklist[itemKey], checked: false, recommended: false, recommendedDescription: undefined },
      });
    } else {
      onChange({
        ...checklist,
        [itemKey]: { ...checklist[itemKey], checked: !wasChecked },
      });
      if (!wasChecked) {
        // Проверяем: если у ползунка критическое значение — авторекомендация
        const sliderCfg = SLIDER_CONFIG[itemKey];
        const level = entry?.level ?? sliderCfg?.defaultValue;
        if (sliderCfg && level != null && isCriticalLevel(itemKey, level)) {
          autoRecommend(itemKey);
        } else {
          setSuggestForItem(itemKey);
          setSuggestService(null);
        }
      }
    }
  }

  function setNote(itemKey: string, note: string) {
    onChange({
      ...checklist,
      [itemKey]: { ...checklist[itemKey], note },
    });
  }

  function setLevel(itemKey: string, level: number) {
    onChange({
      ...checklist,
      [itemKey]: { ...checklist[itemKey], level },
    });
    // Если пункт уже отмечен, не рекомендован, и значение стало критическим — авторекомендация
    const entry = checklist[itemKey];
    if (entry?.checked && !entry?.recommended && !autoRecommending && isCriticalLevel(itemKey, level)) {
      autoRecommend(itemKey);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600">Лист осмотра</label>
      <div className="mt-1 space-y-1">
        {INSPECTION_GROUPS.map((group) => {
          const expanded = expandedGroups[group.key] ?? false;
          const checkedCount = group.items.filter((i) => checklist[i.key]?.checked).length;
          const recommendedCount = group.items.filter((i) => checklist[i.key]?.recommended).length;
          return (
            <div key={group.key} className="rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-xs font-semibold text-gray-700">{group.label}</span>
                <span className="text-[11px] text-gray-400">
                  {checkedCount}/{group.items.length}{recommendedCount > 0 && <span className="ml-1 text-amber-600 font-medium">+{recommendedCount} рек.</span>} {expanded ? '\u25B2' : '\u25BC'}
                </span>
              </button>
              {expanded && (
                <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
                  {group.items.map((item) => {
                    const entry = checklist[item.key] || { checked: false, note: '' };
                    return (
                      <div key={item.key}>
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={entry.checked}
                            onChange={() => toggleItem(item.key)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-700">{item.label}</span>
                            {autoRecommending === item.key && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 animate-pulse">⟳ подбор...</span>
                            )}
                            {entry.recommended && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">● рек.</span>
                            )}
                            {SLIDER_CONFIG[item.key] && (() => {
                              const cfg = SLIDER_CONFIG[item.key];
                              const val = entry.level ?? cfg.defaultValue;
                              return (
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="text-[10px] text-gray-400 w-10">{cfg.label}</span>
                                  <input
                                    type="range"
                                    min={cfg.min}
                                    max={cfg.max}
                                    step={cfg.step}
                                    value={val}
                                    onChange={(e) => setLevel(item.key, Number(e.target.value))}
                                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary-600"
                                  />
                                  <span className="w-10 text-right text-[11px] font-medium text-gray-600">{val}{cfg.unit}</span>
                                </div>
                              );
                            })()}
                            <input
                              type="text"
                              value={entry.note}
                              onChange={(e) => setNote(item.key, e.target.value)}
                              placeholder="Комментарий..."
                              className="mt-0.5 block w-full rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 placeholder:text-gray-300 focus:border-primary-400 focus:outline-none"
                            />
                          </div>
                        </div>
                        {suggestForItem === item.key && (
                          <div className="mt-1 ml-6 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-xs font-medium text-amber-800 mb-1">Добавить работу?</p>
                            <div className="space-y-2">
                              <SearchableServiceSelect
                                onSelect={(svc) => setSuggestService(svc)}
                                inputClassName="w-full rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-gray-700 focus:border-amber-400 focus:outline-none"
                              />
                              {suggestService && (
                                <div className="text-[11px] text-amber-700">Выбрано: <span className="font-medium">{suggestService.name}</span></div>
                              )}
                              <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (suggestService && suggestForItem) {
                                    onChange({
                                      ...checklist,
                                      [suggestForItem]: { ...checklist[suggestForItem], recommended: true, recommendedDescription: suggestService.name },
                                    });
                                    onAddService(suggestService);
                                    setSuggestForItem(null);
                                    setSuggestService(null);
                                  }
                                }}
                                disabled={!suggestService}
                                className="rounded bg-amber-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                              >
                                Добавить
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSuggestForItem(null);
                                  setSuggestService(null);
                                }}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                              >
                                Пропустить
                              </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Items Section (collapsible, tabbed) ---

function formatVat(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0,00 ₽';
  const vat = num * 22 / 122;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(vat);
}

function ItemsSection({
  items,
  totalLabor,
  totalParts,
  totalAmount,
  isEditable,
  showAddItem,
  setShowAddItem,
  addItemTab,
  setAddItemTab,
  selectedService,
  setSelectedService,
  selectedPart,
  setSelectedPart,
  partQty,
  setPartQty,
  saving,
  onAddLabor,
  onAddPart,
  onDeleteItem,
  onUpdateItem,
  mechanics,
  defaultMechanicId,
  onAddItemMechanic,
  onUpdateItemMechanic,
  onRemoveItemMechanic,
}: {
  items: { id: string; type: string; description: string; quantity: number; unitPrice: string | number; totalPrice: string | number; normHours: number | null; recommended: boolean; approvedByClient: boolean | null; mechanics: { id: string; contributionPercent: number; mechanic: { id: string; firstName: string; lastName: string } }[] }[];
  totalLabor: string | number;
  totalParts: string | number;
  totalAmount: string | number;
  isEditable: boolean;
  showAddItem: boolean;
  setShowAddItem: (v: boolean) => void;
  addItemTab: 'LABOR' | 'PART';
  setAddItemTab: (v: 'LABOR' | 'PART') => void;
  selectedService: { id: string; name: string; price: string | number; normHours: string | number | null } | null;
  setSelectedService: (v: { id: string; name: string; price: string | number; normHours: string | number | null } | null) => void;
  selectedPart: { id: string; name: string; sellPrice: string | number; brand: string | null } | null;
  setSelectedPart: (v: { id: string; name: string; sellPrice: string | number; brand: string | null } | null) => void;
  partQty: string;
  setPartQty: (v: string) => void;
  saving: boolean;
  onAddLabor: () => void;
  onAddPart: () => void;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, data: { unitPrice?: number; quantity?: number; normHours?: number }) => void;
  mechanics: { id: string; firstName: string; lastName: string }[];
  defaultMechanicId: string;
  onAddItemMechanic: (itemId: string, mechanicId: string) => void;
  onUpdateItemMechanic: (itemId: string, entryId: string, pct: number) => void;
  onRemoveItemMechanic: (itemId: string, entryId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'LABOR' | 'PART'>('LABOR');

  const laborItems = items.filter((i) => i.type === 'LABOR');
  const partItems = items.filter((i) => i.type === 'PART');
  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="rounded-lg border border-gray-200">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold text-gray-700">
          Работы и материалы ({items.length})
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{formatMoney(totalAmount)}</span>
          <span className="text-xs text-gray-400">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setActiveTab('LABOR')}
              className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === 'LABOR' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Работы ({laborItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PART')}
              className={`flex-1 px-3 py-2 text-xs font-medium ${activeTab === 'PART' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Материалы ({partItems.length})
            </button>
          </div>

          {/* Tab content */}
          <div className="px-3 py-2">
            {activeTab === 'LABOR' ? (
              <>
                {laborItems.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="pb-1 font-medium">Наименование</th>
                        <th className="pb-1 font-medium text-right w-20">Цена н/ч</th>
                        <th className="pb-1 font-medium text-right w-16">Норма</th>
                        <th className="pb-1 font-medium text-right w-20">Всего</th>
                        <th className="pb-1 font-medium text-right">в т.ч. НДС</th>
                        {isEditable && <th className="pb-1 w-6"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {laborItems.map((item) => (
                        <EditableLaborRow
                          key={item.id}
                          item={item}
                          isEditable={isEditable}
                          mechanics={mechanics}
                          defaultMechanicId={defaultMechanicId}
                          onUpdate={onUpdateItem}
                          onDelete={onDeleteItem}
                          onAddItemMechanic={onAddItemMechanic}
                          onUpdateItemMechanic={onUpdateItemMechanic}
                          onRemoveItemMechanic={onRemoveItemMechanic}
                        />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-3 text-center text-xs text-gray-400">Нет работ</p>
                )}

                {/* Add labor */}
                {isEditable && (
                  <div className="mt-2">
                    {showAddItem && addItemTab === 'LABOR' ? (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
                        <SearchableServiceSelect
                          onSelect={(svc) => setSelectedService(svc)}
                          inputClassName={inputCls}
                        />
                        {selectedService && (() => {
                          const norm = selectedService.normHours ? Number(selectedService.normHours) : 1;
                          const total = 2000 * norm;
                          return (
                            <div className="rounded bg-white px-3 py-2 text-xs text-gray-600 space-y-0.5">
                              <div className="flex justify-between"><span>Выбрано:</span><span className="font-medium text-gray-900 truncate ml-2">{selectedService.name}</span></div>
                              <div className="flex justify-between"><span>Цена н/ч:</span><span className="font-medium">2 000 ₽</span></div>
                              <div className="flex justify-between"><span>Норма:</span><span className="font-medium">{norm}</span></div>
                              <div className="flex justify-between"><span>Всего:</span><span className="font-semibold text-gray-900">{formatMoney(total)}</span></div>
                              <div className="flex justify-between"><span>в т.ч. НДС:</span><span>{formatVat(total)}</span></div>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setShowAddItem(false); setSelectedService(null); }}
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={onAddLabor}
                            disabled={saving || !selectedService}
                            className="flex-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setShowAddItem(true); setAddItemTab('LABOR'); }}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700"
                      >
                        + Добавить работу
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {partItems.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="pb-1 font-medium">Наименование</th>
                        <th className="pb-1 font-medium text-right w-20">Цена</th>
                        <th className="pb-1 font-medium text-right w-16">Кол-во</th>
                        <th className="pb-1 font-medium text-right w-20">Всего</th>
                        <th className="pb-1 font-medium text-right">в т.ч. НДС</th>
                        {isEditable && <th className="pb-1 w-6"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {partItems.map((item) => (
                        <EditablePartRow
                          key={item.id}
                          item={item}
                          isEditable={isEditable}
                          onUpdate={onUpdateItem}
                          onDelete={onDeleteItem}
                        />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-3 text-center text-xs text-gray-400">Нет материалов</p>
                )}

                {/* Add part */}
                {isEditable && (
                  <div className="mt-2">
                    {showAddItem && addItemTab === 'PART' ? (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
                        <SearchablePartSelect
                          onSelect={(p) => setSelectedPart(p)}
                          inputClassName={inputCls}
                        />
                        <input
                          type="number"
                          min={1}
                          value={partQty}
                          onChange={(e) => setPartQty(e.target.value)}
                          placeholder="Кол-во"
                          className={inputCls}
                        />
                        {selectedPart && (() => {
                          const total = Number(selectedPart.sellPrice) * (Number(partQty) || 1);
                          return (
                            <div className="rounded bg-white px-3 py-2 text-xs text-gray-600 space-y-0.5">
                              <div className="flex justify-between"><span>Выбрано:</span><span className="font-medium text-gray-900 truncate ml-2">{selectedPart.name}</span></div>
                              <div className="flex justify-between"><span>Цена:</span><span className="font-medium">{formatMoney(selectedPart.sellPrice)}</span></div>
                              <div className="flex justify-between"><span>Кол-во:</span><span className="font-medium">{Number(partQty) || 1}</span></div>
                              <div className="flex justify-between"><span>Всего:</span><span className="font-semibold text-gray-900">{formatMoney(total)}</span></div>
                              <div className="flex justify-between"><span>в т.ч. НДС:</span><span>{formatVat(total)}</span></div>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setShowAddItem(false); setSelectedPart(null); setPartQty('1'); }}
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            onClick={onAddPart}
                            disabled={saving || !selectedPart}
                            className="flex-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setShowAddItem(true); setAddItemTab('PART'); }}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700"
                      >
                        + Добавить материал
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer totals */}
          <div className="flex justify-end gap-4 border-t border-gray-100 px-4 py-2">
            <div className="text-xs text-gray-500">
              Работы: <span className="font-semibold text-gray-700">{formatMoney(totalLabor)}</span>
            </div>
            <div className="text-xs text-gray-500">
              Материалы: <span className="font-semibold text-gray-700">{formatMoney(totalParts)}</span>
            </div>
            <div className="text-sm font-bold text-gray-900">
              Итого: {formatMoney(totalAmount)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendedSection({
  items,
  status,
  saving,
  onApproveItem,
  onDeleteItem,
}: {
  items: { id: string; type: string; description: string; quantity: number; unitPrice: string | number; totalPrice: string | number; normHours: number | null; recommended: boolean; approvedByClient: boolean | null }[];
  status: string;
  saving: boolean;
  onApproveItem: (itemId: string, approved: boolean) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const canApprove = ['DIAGNOSED', 'APPROVED'].includes(status);

  const approvedCount = items.filter((i) => i.approvedByClient === true).length;
  const approvedTotal = items
    .filter((i) => i.approvedByClient === true)
    .reduce((sum, i) => sum + Number(i.totalPrice), 0);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50"
      >
        <span className="text-sm font-semibold text-amber-800">
          Рекомендовано ({items.length})
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-900">{formatMoney(approvedTotal)}</span>
          <span className="text-xs text-amber-400">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-200">
          <div className="px-3 py-2 space-y-1">
            {items.map((item) => {
              const isApproved = item.approvedByClient === true;
              const isDeclined = item.approvedByClient === false;

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded px-3 py-2 text-xs ${
                    isDeclined
                      ? 'bg-red-50 text-gray-400 line-through'
                      : isApproved
                        ? 'bg-green-50 text-gray-700'
                        : 'bg-white text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isApproved && <span className="text-green-600 text-sm">{'\u2713'}</span>}
                    {isDeclined && <span className="text-red-500 text-sm">{'\u2717'}</span>}
                    {!isApproved && !isDeclined && <span className="text-amber-400 text-sm">{'\u25CF'}</span>}
                    <span className="truncate">{item.description}</span>
                    <span className="text-gray-400 shrink-0">
                      {item.type === 'LABOR' ? `${item.quantity} н/ч` : `\u00D7${item.quantity}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="font-medium">{formatMoney(item.totalPrice)}</span>
                    {canApprove && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={saving || isApproved}
                          onClick={() => onApproveItem(item.id, true)}
                          className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                            isApproved
                              ? 'bg-green-200 text-green-800 cursor-default'
                              : 'bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50'
                          }`}
                          title="Одобрить"
                        >
                          {'\u2713'}
                        </button>
                        <button
                          type="button"
                          disabled={saving || isDeclined}
                          onClick={() => onApproveItem(item.id, false)}
                          className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                            isDeclined
                              ? 'bg-red-200 text-red-800 cursor-default'
                              : 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50'
                          }`}
                          title="Отклонить"
                        >
                          {'\u2717'}
                        </button>
                      </div>
                    )}
                    {!canApprove && !isApproved && !isDeclined && (
                      <span className="text-amber-500 text-[10px]">ожидание</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-4 border-t border-amber-200 px-4 py-2">
            <div className="text-xs text-amber-700">
              Одобрено: <span className="font-semibold">{items.filter((i) => i.approvedByClient === true).length} из {items.length}</span>
            </div>
            <div className="text-sm font-bold text-amber-900">
              Сумма: {formatMoney(approvedTotal)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Searchable Service Select ──────────────────────────────────────────────

function SearchableServiceSelect({
  onSelect,
  inputClassName,
}: {
  onSelect: (service: { id: string; name: string; price: string | number; normHours: string | number | null }) => void;
  inputClassName: string;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data } = useQuery<{ data: { id: string; name: string; price: string | number; normHours: string | number | null }[] }>({
    queryKey: ['services-search', debouncedSearch],
    queryFn: () => apiFetch(`/services?limit=20&sort=name&order=asc&search=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.length >= 2,
  });

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => { if (search.length >= 2) setShowDropdown(true); }}
        placeholder="Введите название работы (мин. 2 символа)..."
        className={inputClassName}
      />
      {showDropdown && data?.data && data.data.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {data.data.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s); setSearch(''); setShowDropdown(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-primary-50"
            >
              <span className="text-sm text-gray-900">{s.name}</span>
              <span className="ml-2 whitespace-nowrap text-xs text-gray-500">
                {s.normHours ? `${Number(s.normHours)} н/ч` : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
      {showDropdown && debouncedSearch.length >= 2 && data?.data?.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500 shadow-lg">
          Не найдено
        </div>
      )}
    </div>
  );
}

// ─── Searchable Part Select ─────────────────────────────────────────────────

function SearchablePartSelect({
  onSelect,
  inputClassName,
}: {
  onSelect: (part: { id: string; name: string; sellPrice: string | number; brand: string | null }) => void;
  inputClassName: string;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data } = useQuery<{ data: { id: string; name: string; sellPrice: string | number; brand: string | null }[] }>({
    queryKey: ['parts-search', debouncedSearch],
    queryFn: () => apiFetch(`/parts?limit=20&sort=name&order=asc&search=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.length >= 2,
  });

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => { if (search.length >= 2) setShowDropdown(true); }}
        placeholder="Введите название или артикул (мин. 2 символа)..."
        className={inputClassName}
      />
      {showDropdown && data?.data && data.data.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {data.data.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(p); setSearch(''); setShowDropdown(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-primary-50"
            >
              <span className="text-sm text-gray-900 truncate">{p.name}</span>
              <span className="ml-2 whitespace-nowrap text-xs text-gray-500">
                {formatMoney(p.sellPrice)}
              </span>
            </button>
          ))}
        </div>
      )}
      {showDropdown && debouncedSearch.length >= 2 && data?.data?.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500 shadow-lg">
          Не найдено
        </div>
      )}
    </div>
  );
}

// --- AI Work Order Modal ---

type AiModalStep = 'input' | 'parsing' | 'preview' | 'creating' | 'done';

interface AiCandidateVehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string | null;
  vin: string | null;
}

interface AiCandidateClient {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  vehicles: AiCandidateVehicle[];
}

interface AiParseResult {
  client: { existingId: string | null; firstName: string | null; lastName: string | null; phone: string | null; isNew: boolean };
  candidateClients: AiCandidateClient[];
  vehicle: { existingId: string | null; make: string | null; model: string | null; year: number | null; licensePlate: string | null; vin: string | null; isNew: boolean };
  clientComplaints: string;
  suggestedServices: { serviceId: string; name: string; price: number; normHours: number; usageCount?: number }[];
  suggestedParts: { partId: string; name: string; sellPrice: number; quantity: number; inStock: boolean; usageCount?: number }[];
  suggestedMechanic: { mechanicId: string; firstName: string; lastName: string; activeOrdersCount: number } | null;
  spravochnikUsed?: boolean;
}

function AiWorkOrderModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<AiModalStep>('input');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<AiParseResult | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState('');
  const [createdOrderNumber, setCreatedOrderNumber] = useState('');

  // Editable fields for preview
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editMake, setEditMake] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editComplaints, setEditComplaints] = useState('');
  const [selectedServices, setSelectedServices] = useState<boolean[]>([]);
  const [selectedParts, setSelectedParts] = useState<boolean[]>([]);
  const [adjusting, setAdjusting] = useState(false);

  async function handleParse() {
    if (!description.trim()) return;
    setError('');
    setStep('parsing');
    try {
      const result = await apiFetch<AiParseResult>('/ai-work-order/parse', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() }),
      });
      setPreview(result);
      // Init editable fields
      setEditFirstName(result.client.firstName || '');
      setEditLastName(result.client.lastName || '');
      setEditPhone(result.client.phone || '');
      setEditMake(result.vehicle.make || '');
      setEditModel(result.vehicle.model || '');
      setEditYear(result.vehicle.year ? String(result.vehicle.year) : '');
      setEditPlate(result.vehicle.licensePlate || '');
      setEditComplaints(result.clientComplaints || '');
      setSelectedServices(result.suggestedServices.map(() => true));
      setSelectedParts(result.suggestedParts.map(() => true));
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Ошибка анализа');
      setStep('input');
    }
  }

  async function handleCreate() {
    if (!preview) return;
    setError('');
    setStep('creating');
    try {
      const services = preview.suggestedServices.filter((_, i) => selectedServices[i]);
      const parts = preview.suggestedParts.filter((_, i) => selectedParts[i]);

      const body: any = {
        clientComplaints: editComplaints,
        services: services.map((s) => ({ serviceId: s.serviceId, name: s.name, price: s.price, normHours: s.normHours })),
        parts: parts.map((p) => ({ partId: p.partId, name: p.name, sellPrice: p.sellPrice, quantity: p.quantity })),
      };

      if (preview.client.existingId) {
        body.existingClientId = preview.client.existingId;
      } else {
        body.newClient = { firstName: editFirstName, lastName: editLastName, phone: editPhone || undefined };
      }

      if (preview.vehicle.existingId) {
        body.existingVehicleId = preview.vehicle.existingId;
      } else {
        body.newVehicle = {
          make: sanitizeMakeModel(editMake),
          model: sanitizeMakeModel(editModel),
          year: editYear ? Number(editYear) : undefined,
          licensePlate: sanitizePlate(editPlate) || undefined,
        };
      }

      if (preview.suggestedMechanic) {
        body.mechanicId = preview.suggestedMechanic.mechanicId;
      }

      const result = await apiFetch<any>('/ai-work-order/create', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreatedOrderId(result.id);
      setCreatedOrderNumber(result.orderNumber || '');
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Ошибка создания');
      setStep('preview');
    }
  }

  async function handleAdjust(vehicle: { make: string; model: string; year: number | null }) {
    if (!preview) return;
    setAdjusting(true);
    try {
      const result = await apiFetch<{
        suggestedServices: { serviceId: string; name: string; price: number; normHours: number }[];
        suggestedParts: { partId: string; name: string; sellPrice: number; quantity: number; inStock: boolean }[];
        explanation: string;
      }>('/ai-work-order/adjust', {
        method: 'POST',
        body: JSON.stringify({
          vehicle: { make: vehicle.make, model: vehicle.model, year: vehicle.year || undefined },
          complaint: editComplaints,
          currentServices: preview.suggestedServices.map((s) => ({ serviceId: s.serviceId, name: s.name })),
          currentParts: preview.suggestedParts.map((p) => ({ partId: p.partId, name: p.name })),
        }),
      });
      setPreview({
        ...preview,
        suggestedServices: result.suggestedServices,
        suggestedParts: result.suggestedParts,
      });
      setSelectedServices(result.suggestedServices.map(() => true));
      setSelectedParts(result.suggestedParts.map(() => true));
    } catch {
      // ignore — keep current suggestions
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'input' && '✦ Создать заявку с ИИ'}
            {step === 'parsing' && '✦ Анализ описания...'}
            {step === 'preview' && '✦ Превью заказ-наряда'}
            {step === 'creating' && '✦ Создание заявки...'}
            {step === 'done' && '✦ Заявка создана'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Step: input */}
        {step === 'input' && (
          <div>
            <p className="mb-3 text-sm text-gray-500">
              Опишите ситуацию: кто приехал, на чём, с какой проблемой. ИИ подберёт услуги, запчасти и механика.
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Например: Приехала Камри 2019 госномер А123БВ, стук в передней подвеске"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              rows={4}
              autoFocus
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleParse}
                disabled={!description.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                Анализировать
              </button>
            </div>
          </div>
        )}

        {/* Step: parsing */}
        {step === 'parsing' && (
          <div className="flex flex-col items-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
            <p className="mt-4 text-sm text-gray-500">ИИ анализирует описание...</p>
          </div>
        )}

        {/* Step: preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Client */}
            <div className="rounded-lg border border-gray-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Клиент {preview.client.isNew ? <span className="text-xs font-normal text-green-600">(новый)</span> : preview.candidateClients.length > 1 ? <span className="text-xs font-normal text-amber-600">(выберите из базы)</span> : <span className="text-xs font-normal text-blue-600">(найден в базе)</span>}
              </h3>
              {preview.client.isNew ? (
                <div className="grid grid-cols-3 gap-2">
                  <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Фамилия" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                  <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="Имя" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Телефон" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                </div>
              ) : preview.candidateClients.length > 1 ? (
                <select
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={preview.client.existingId || ''}
                  onChange={(e) => {
                    const selected = preview.candidateClients.find((c) => c.id === e.target.value);
                    if (selected) {
                      const firstVehicle = selected.vehicles[0];
                      setPreview({
                        ...preview,
                        client: { existingId: selected.id, firstName: selected.firstName, lastName: selected.lastName, phone: selected.phone, isNew: false },
                        vehicle: firstVehicle
                          ? { existingId: firstVehicle.id, make: firstVehicle.make, model: firstVehicle.model, year: firstVehicle.year, licensePlate: firstVehicle.licensePlate, vin: firstVehicle.vin, isNew: false }
                          : { existingId: null, make: null, model: null, year: null, licensePlate: null, vin: null, isNew: true },
                      });
                      if (firstVehicle) handleAdjust(firstVehicle);
                    }
                  }}
                >
                  {preview.candidateClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.lastName} {c.firstName}{c.middleName ? ` ${c.middleName}` : ''}{c.phone ? ` • ${c.phone}` : ''}{c.vehicles.length > 0 ? ` — ${c.vehicles.map((v) => `${v.make} ${v.model}`).join(', ')}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-600">{preview.client.lastName} {preview.client.firstName} {preview.client.phone && `• ${preview.client.phone}`}</p>
              )}
            </div>

            {/* Vehicle */}
            <div className="rounded-lg border border-gray-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                Автомобиль {preview.vehicle.isNew ? <span className="text-xs font-normal text-green-600">(новый)</span> : (() => {
                  const sel = preview.candidateClients.find((c) => c.id === preview.client.existingId);
                  return sel && sel.vehicles.length > 1 ? <span className="text-xs font-normal text-amber-600">(выберите)</span> : <span className="text-xs font-normal text-blue-600">(найден в базе)</span>;
                })()}
              </h3>
              {preview.vehicle.isNew ? (
                <div className="grid grid-cols-4 gap-2">
                  <input value={editMake} onChange={(e) => setEditMake(e.target.value)} placeholder="Марка" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                  <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="Модель" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                  <input value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="Год" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                  <input value={editPlate} onChange={(e) => setEditPlate(e.target.value)} placeholder="Госномер" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                </div>
              ) : (() => {
                const sel = preview.candidateClients.find((c) => c.id === preview.client.existingId);
                const vehicles = sel?.vehicles || [];
                if (vehicles.length > 1) {
                  return (
                    <select
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                      value={preview.vehicle.existingId || ''}
                      onChange={(e) => {
                        const v = vehicles.find((veh) => veh.id === e.target.value);
                        if (v) {
                          setPreview({
                            ...preview,
                            vehicle: { existingId: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate, vin: v.vin, isNew: false },
                          });
                          handleAdjust(v);
                        }
                      }}
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.make} {v.model}{v.year ? ` (${v.year})` : ''}{v.licensePlate ? ` • ${v.licensePlate}` : ''}
                        </option>
                      ))}
                    </select>
                  );
                }
                return (
                  <p className="text-sm text-gray-600">
                    {preview.vehicle.make} {preview.vehicle.model} {preview.vehicle.year && `(${preview.vehicle.year})`} {preview.vehicle.licensePlate && `• ${preview.vehicle.licensePlate}`}
                  </p>
                );
              })()}
            </div>

            {/* Complaints */}
            <div className="rounded-lg border border-gray-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Жалобы клиента</h3>
              <textarea
                value={editComplaints}
                onChange={(e) => setEditComplaints(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                rows={2}
              />
            </div>

            {/* Source indicator */}
            {preview.spravochnikUsed !== undefined && (
              <div className={`rounded-lg px-3 py-1.5 text-xs font-medium ${preview.spravochnikUsed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                {preview.spravochnikUsed ? 'Из справочника (на основе истории обслуживания)' : 'AI-подбор'}
              </div>
            )}

            {/* Services */}
            {preview.suggestedServices.length > 0 && (
              <div className={`rounded-lg border border-gray-200 p-3 ${adjusting ? 'opacity-50' : ''}`}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Услуги {adjusting && <span className="text-xs font-normal text-amber-600 animate-pulse">корректировка...</span>}</h3>
                <div className="space-y-1">
                  {preview.suggestedServices.map((s, i) => (
                    <label key={s.serviceId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedServices[i] ?? true}
                        onChange={(e) => {
                          const next = [...selectedServices];
                          next[i] = e.target.checked;
                          setSelectedServices(next);
                        }}
                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="whitespace-nowrap text-gray-500">{formatMoney(s.price)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Parts */}
            {preview.suggestedParts.length > 0 && (
              <div className={`rounded-lg border border-gray-200 p-3 ${adjusting ? 'opacity-50' : ''}`}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Запчасти {adjusting && <span className="text-xs font-normal text-amber-600 animate-pulse">корректировка...</span>}</h3>
                <div className="space-y-1">
                  {preview.suggestedParts.map((p, i) => (
                    <label key={p.partId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedParts[i] ?? true}
                        onChange={(e) => {
                          const next = [...selectedParts];
                          next[i] = e.target.checked;
                          setSelectedParts(next);
                        }}
                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="flex-1 truncate">{p.name} {p.quantity > 1 && `x${p.quantity}`}</span>
                      {p.usageCount && <span className="whitespace-nowrap text-xs text-emerald-600">{p.usageCount}x</span>}
                      <span className="whitespace-nowrap text-gray-500">{formatMoney(p.sellPrice)}</span>
                      {!p.inStock && <span className="text-xs text-red-500">нет на складе</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Mechanic */}
            {preview.suggestedMechanic && (
              <div className="rounded-lg border border-gray-200 p-3">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Механик</h3>
                <p className="text-sm text-gray-600">
                  {preview.suggestedMechanic.lastName} {preview.suggestedMechanic.firstName}
                  <span className="ml-2 text-xs text-gray-400">активных ЗН: {preview.suggestedMechanic.activeOrdersCount}</span>
                </p>
              </div>
            )}

            {/* Total */}
            {(() => {
              const servicesTotal = preview.suggestedServices.filter((_, i) => selectedServices[i]).reduce((sum, s) => sum + s.price, 0);
              const partsTotal = preview.suggestedParts.filter((_, i) => selectedParts[i]).reduce((sum, p) => sum + p.sellPrice * p.quantity, 0);
              return (
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Работы:</span><span>{formatMoney(servicesTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Запчасти:</span><span>{formatMoney(partsTotal)}</span></div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Итого:</span><span>{formatMoney(servicesTotal + partsTotal)}</span></div>
                </div>
              );
            })()}

            <div className="flex justify-between">
              <button
                onClick={() => setStep('input')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Назад
              </button>
              <button
                onClick={handleCreate}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
              >
                Создать заявку
              </button>
            </div>
          </div>
        )}

        {/* Step: creating */}
        {step === 'creating' && (
          <div className="flex flex-col items-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
            <p className="mt-4 text-sm text-gray-500">Создаём заявку...</p>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="flex flex-col items-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="mt-4 text-lg font-semibold text-gray-900">Заявка создана</p>
            <p className="mt-1 text-sm text-gray-500">
              Карточка в колонке «Согласование» — согласуйте с клиентом
            </p>
            <div className="mt-6">
              <button
                onClick={onSuccess}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
