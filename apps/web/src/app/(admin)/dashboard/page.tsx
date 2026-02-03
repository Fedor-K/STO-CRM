'use client';

import { useState, useMemo } from 'react';
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
          <button
            onClick={() => setShowAppointmentModal(true)}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            + Новая заявка
          </button>
        </div>

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
                          <WorkOrderFunnelCard key={wo.id} workOrder={wo} onUpdate={invalidateFunnel} />
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

      {showAppointmentModal && (
        <CreateAppointmentModal
          onClose={() => setShowAppointmentModal(false)}
          onSuccess={() => {
            setShowAppointmentModal(false);
            invalidateFunnel();
          }}
        />
      )}
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
  const [loading, setLoading] = useState(false);

  async function handleAction(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      if (column === 'appeal') {
        await apiFetch(`/appointments/${appointment.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
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

  const actionLabel = column === 'appeal' ? 'Подтвердить →' : column === 'scheduled' ? 'Принять авто →' : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm">
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
  NEW: { status: 'DIAGNOSED', label: 'Диагностика →' },
  DIAGNOSED: { status: 'APPROVED', label: 'Согласовать →' },
  APPROVED: { status: 'IN_PROGRESS', label: 'В работу →' },
  IN_PROGRESS: { status: 'COMPLETED', label: 'Готово →' },
  PAUSED: { status: 'IN_PROGRESS', label: 'Возобновить →' },
  COMPLETED: { status: 'INVOICED', label: 'Выставить счёт →' },
  INVOICED: { status: 'PAID', label: 'Оплачен →' },
  PAID: { status: 'CLOSED', label: 'Выдать →' },
};

function WorkOrderFunnelCard({ workOrder, onUpdate }: { workOrder: WorkOrderCard; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false);
  const next = WO_NEXT_STATUS[workOrder.status];

  async function handleNext(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!next) return;
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
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center justify-between">
        <Link href={`/work-orders/${workOrder.id}`} className="text-xs font-bold text-primary-600 hover:underline">
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
      {next && (
        <button
          onClick={handleNext}
          disabled={loading}
          className="mt-1.5 w-full rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? '...' : next.label}
        </button>
      )}
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

  // Client mode: 'existing' or 'new'
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientId, setClientId] = useState('');
  // New client fields
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
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
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [serviceBayId, setServiceBayId] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: clients, refetch: refetchClients } = useQuery<{ data: { id: string; firstName: string; lastName: string; email: string }[] }>({
    queryKey: ['clients-for-appt'],
    queryFn: () => apiFetch('/users?limit=100&sort=firstName&order=asc&role=CLIENT'),
  });

  const { data: vehicles, refetch: refetchVehicles } = useQuery<{ data: { id: string; make: string; model: string; licensePlate: string | null; clientId: string }[] }>({
    queryKey: ['vehicles-for-appt', clientId],
    queryFn: () => apiFetch(`/vehicles?limit=50${clientId ? `&clientId=${clientId}` : ''}`),
    enabled: !!clientId && !isNewClient,
  });

  const { data: bays } = useQuery<{ data: { id: string; name: string; type: string | null }[] }>({
    queryKey: ['bays-for-appt'],
    queryFn: () => apiFetch('/service-bays?isActive=true&limit=50'),
  });

  // Fetch schedule for selected bay + date
  const { data: baySchedule } = useQuery<{ data: { id: string; scheduledStart: string; scheduledEnd: string; client: { firstName: string; lastName: string }; vehicle: { make: string; model: string } }[] }>({
    queryKey: ['bay-schedule', serviceBayId, date],
    queryFn: () => apiFetch(`/appointments?limit=50&sort=scheduledStart&order=asc&from=${date}T00:00:00&to=${date}T23:59:59&serviceBayId=${serviceBayId}`),
    enabled: !!serviceBayId && !!date,
  });

  // Проверка конфликта времени на выбранном посту
  const hasConflict = useMemo(() => {
    if (!serviceBayId || !date || !startTime || !endTime || !baySchedule?.data?.length) return false;
    const reqStart = new Date(`${date}T${startTime}:00`);
    const reqEnd = new Date(`${date}T${endTime}:00`);
    return baySchedule.data.some((appt) => {
      const s = new Date(appt.scheduledStart);
      const e = new Date(appt.scheduledEnd);
      return s < reqEnd && e > reqStart;
    });
  }, [serviceBayId, date, startTime, endTime, baySchedule]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      let finalClientId = clientId;
      let finalVehicleId = vehicleId;

      // 1. Create new client if needed
      if (isNewClient) {
        if (!newFirstName || !newLastName || !newPhone) {
          setError('Заполните ФИО и телефон нового клиента');
          setSaving(false);
          return;
        }
        const email = newEmail || `${newPhone.replace(/\D/g, '')}@client.local`;
        const created: any = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            firstName: newFirstName,
            lastName: newLastName,
            phone: newPhone,
            email,
            password: crypto.randomUUID().slice(0, 12),
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

      if (!date) {
        setError('Укажите дату');
        setSaving(false);
        return;
      }

      // 3. Create appointment
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clientId: finalClientId,
          vehicleId: finalVehicleId,
          scheduledStart: `${date}T${startTime}:00`,
          scheduledEnd: `${date}T${endTime}:00`,
          serviceBayId: serviceBayId || undefined,
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
                onClick={() => { setIsNewClient(!isNewClient); setClientId(''); setVehicleId(''); setIsNewVehicle(false); }}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                {isNewClient ? 'Выбрать существующего' : '+ Новый клиент'}
              </button>
            </div>

            {isNewClient ? (
              <div className="mt-2 space-y-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Имя *"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className={inputCls}
                    required
                  />
                  <input
                    placeholder="Фамилия *"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className={inputCls}
                    required
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
              <select
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setVehicleId(''); setIsNewVehicle(false); }}
                className={inputCls}
                required
              >
                <option value="">Выберите клиента</option>
                {clients?.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
                ))}
              </select>
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

          {/* --- Date & Time --- */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Дата *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Начало *</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Конец *</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} required />
            </div>
          </div>

          {/* --- Service Bay --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Рабочий пост</label>
            <select value={serviceBayId} onChange={(e) => setServiceBayId(e.target.value)} className={inputCls}>
              <option value="">Не выбран</option>
              {bays?.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.type ? ` (${b.type})` : ''}</option>
              ))}
            </select>
            {serviceBayId && date && baySchedule?.data && baySchedule.data.length > 0 && (() => {
              const reqStart = new Date(`${date}T${startTime}:00`);
              const reqEnd = new Date(`${date}T${endTime}:00`);
              const conflicting = baySchedule.data.filter((appt) => {
                const s = new Date(appt.scheduledStart);
                const e = new Date(appt.scheduledEnd);
                return s < reqEnd && e > reqStart;
              });
              return (
                <div className={`mt-2 rounded-lg border p-2 ${conflicting.length > 0 ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  {conflicting.length > 0 && (
                    <p className="text-xs font-bold text-red-700">Конфликт! Пост занят в выбранное время:</p>
                  )}
                  {conflicting.length === 0 && (
                    <p className="text-xs font-medium text-amber-700">Занято на {new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} (без пересечений):</p>
                  )}
                  <ul className="mt-1 space-y-0.5">
                    {baySchedule.data.map((appt) => {
                      const isConflict = conflicting.some((c) => c.id === appt.id);
                      return (
                        <li key={appt.id} className={`text-xs ${isConflict ? 'font-bold text-red-700' : 'text-amber-600'}`}>
                          {new Date(appt.scheduledStart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          {' – '}
                          {new Date(appt.scheduledEnd).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}
                          {appt.client.firstName} {appt.client.lastName}
                          {' · '}
                          {appt.vehicle.make} {appt.vehicle.model}
                          {isConflict && ' ⛔'}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
            {serviceBayId && date && baySchedule?.data && baySchedule.data.length === 0 && (
              <p className="mt-1 text-xs text-green-600">Пост свободен весь день</p>
            )}
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
              disabled={saving || hasConflict}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              title={hasConflict ? 'Пост занят в выбранное время' : undefined}
            >
              {saving ? 'Сохранение...' : hasConflict ? 'Пост занят' : 'Записать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
