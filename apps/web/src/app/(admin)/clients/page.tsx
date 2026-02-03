'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// --- Types ---

interface ClientData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface VehicleData {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  year: number | null;
  vin: string | null;
  color: string | null;
  mileage: number | null;
}

interface AppointmentData {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  vehicle: { make: string; model: string; licensePlate: string | null };
  serviceBay: { name: string } | null;
}

interface WorkOrderData {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
  vehicle: { make: string; model: string; licensePlate: string | null };
  mechanic: { firstName: string; lastName: string } | null;
  _count: { items: number };
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// --- Helpers ---

const APPT_STATUS: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждена',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не явился',
};

const WO_STATUS: Record<string, string> = {
  NEW: 'Новый',
  DIAGNOSED: 'Диагностика',
  APPROVED: 'Согласован',
  IN_PROGRESS: 'В работе',
  PAUSED: 'Пауза',
  COMPLETED: 'Выполнен',
  INVOICED: 'Счёт',
  PAID: 'Оплачен',
  CLOSED: 'Закрыт',
  CANCELLED: 'Отменён',
};

const WO_STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  DIAGNOSED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-600',
  PAID: 'bg-emerald-100 text-emerald-700',
};

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// --- Page ---

// --- Detail modal constants ---

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

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

// --- Page ---

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<ClientData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<ClientData>>({
    queryKey: ['clients', page, search],
    queryFn: () =>
      apiFetch(`/users?page=${page}&limit=20&sort=createdAt&order=desc&role=CLIENT${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Клиенты</h1>
        <button
          onClick={() => { setEditClient(null); setShowModal(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + Новый клиент
        </button>
      </div>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Поиск по имени, телефону..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Клиентов не найдено</div>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            {data.data.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                isExpanded={expandedId === client.id}
                onToggle={() => setExpandedId(expandedId === client.id ? null : client.id)}
                onEdit={() => { setEditClient(client); setShowModal(true); }}
                onDelete={() => {
                  if (confirm(`Удалить клиента ${client.firstName} ${client.lastName}?`)) {
                    deleteMutation.mutate(client.id);
                  }
                }}
                onOpenAppointment={(id) => setSelectedAppointmentId(id)}
                onOpenWorkOrder={(id) => setSelectedWorkOrderId(id)}
              />
            ))}
          </div>

          {data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Всего: {data.meta.total}. Страница {data.meta.page} из {data.meta.totalPages}
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
                  onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                  disabled={page === data.meta.totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Вперёд
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
          }}
        />
      )}

      {selectedAppointmentId && (
        <AppointmentDetailModal
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
          onUpdate={() => {
            setSelectedAppointmentId(null);
            queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
          }}
        />
      )}

      {selectedWorkOrderId && (
        <WorkOrderDetailModal
          workOrderId={selectedWorkOrderId}
          onClose={() => setSelectedWorkOrderId(null)}
          onUpdate={() => {
            setSelectedWorkOrderId(null);
            queryClient.invalidateQueries({ queryKey: ['client-work-orders'] });
          }}
        />
      )}
    </div>
  );
}

// --- Client Card ---

function ClientCard({
  client,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onOpenAppointment,
  onOpenWorkOrder,
}: {
  client: ClientData;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenAppointment: (id: string) => void;
  onOpenWorkOrder: (id: string) => void;
}) {
  const { data: vehicles } = useQuery<PaginatedResponse<VehicleData>>({
    queryKey: ['client-vehicles', client.id],
    queryFn: () => apiFetch(`/vehicles?limit=50&clientId=${client.id}`),
    enabled: isExpanded,
  });

  const { data: appointments } = useQuery<PaginatedResponse<AppointmentData>>({
    queryKey: ['client-appointments', client.id],
    queryFn: () => apiFetch(`/appointments?limit=20&sort=scheduledStart&order=desc&clientId=${client.id}`),
    enabled: isExpanded,
  });

  const { data: workOrders } = useQuery<PaginatedResponse<WorkOrderData>>({
    queryKey: ['client-work-orders', client.id],
    queryFn: () => apiFetch(`/work-orders?limit=20&sort=createdAt&order=desc&clientId=${client.id}`),
    enabled: isExpanded,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center justify-between px-5 py-4 hover:bg-gray-50"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
            {client.firstName[0]}{client.lastName[0]}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {client.firstName} {client.lastName}
            </div>
            <div className="text-xs text-gray-500">{client.phone || 'Нет телефона'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">с {formatDate(client.createdAt)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-xs text-primary-600 hover:text-primary-800"
          >
            Изменить
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Удалить
          </button>
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
          {/* Vehicles */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-gray-500">Автомобили</h4>
            {vehicles?.data?.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {vehicles.data.map((v) => (
                  <div key={v.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {v.make} {v.model}
                      {v.year ? ` (${v.year})` : ''}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                      {v.licensePlate && <div>Госномер: <span className="font-medium text-gray-700">{v.licensePlate}</span></div>}
                      {v.vin && <div>VIN: <span className="font-mono text-gray-600">{v.vin}</span></div>}
                      {v.color && <div>Цвет: {v.color}</div>}
                      {v.mileage != null && <div>Пробег: {v.mileage.toLocaleString('ru-RU')} км</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Нет автомобилей</p>
            )}
          </div>

          {/* Appointments */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-gray-500">Записи</h4>
            {appointments?.data?.length ? (
              <div className="mt-2 space-y-1.5">
                {appointments.data.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => onOpenAppointment(a.id)}
                    className="flex cursor-pointer items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs transition hover:bg-gray-100"
                  >
                    <div>
                      <span className="font-medium text-gray-700">{formatDateTime(a.scheduledStart)}</span>
                      <span className="ml-2 text-gray-500">
                        {a.vehicle.make} {a.vehicle.model}
                        {a.vehicle.licensePlate ? ` (${a.vehicle.licensePlate})` : ''}
                      </span>
                      {a.serviceBay && <span className="ml-2 text-gray-400">{a.serviceBay.name}</span>}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      a.status === 'CANCELLED' || a.status === 'NO_SHOW' ? 'bg-red-100 text-red-600' :
                      a.status === 'COMPLETED' || a.status === 'IN_PROGRESS' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {APPT_STATUS[a.status] || a.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Нет записей</p>
            )}
          </div>

          {/* Work Orders */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-gray-500">Заказ-наряды</h4>
            {workOrders?.data?.length ? (
              <div className="mt-2 space-y-1.5">
                {workOrders.data.map((wo) => (
                  <div
                    key={wo.id}
                    onClick={() => onOpenWorkOrder(wo.id)}
                    className="flex cursor-pointer items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs transition hover:bg-gray-100"
                  >
                    <div>
                      <span className="font-bold text-primary-600">{wo.orderNumber}</span>
                      <span className="ml-2 text-gray-500">
                        {wo.vehicle.make} {wo.vehicle.model}
                        {wo.vehicle.licensePlate ? ` (${wo.vehicle.licensePlate})` : ''}
                      </span>
                      {wo.mechanic && (
                        <span className="ml-2 text-gray-400">
                          {wo.mechanic.firstName} {wo.mechanic.lastName}
                        </span>
                      )}
                      <span className="ml-2 text-gray-400">{formatDate(wo.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700">{formatMoney(wo.totalAmount)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${WO_STATUS_COLOR[wo.status] || 'bg-gray-100'}`}>
                        {WO_STATUS[wo.status] || wo.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Нет заказ-нарядов</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers (text sanitization) ---

const CYR_TO_LAT: Record<string, string> = {
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','У':'Y','Х':'X',
  'а':'a','в':'b','е':'e','к':'k','м':'m','н':'h','о':'o','р':'p','с':'c','т':'t','у':'y','х':'x',
};

function sanitizeMakeModel(val: string): string {
  const latin = val.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
  const cleaned = latin.replace(/[^a-zA-Z0-9\s\-]/g, '');
  return cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function sanitizePlate(val: string): string {
  const latin = val.split('').map(ch => CYR_TO_LAT[ch] || ch).join('');
  return latin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// --- Client Modal ---

function ClientModal({
  client,
  onClose,
  onSuccess,
}: {
  client: ClientData | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!client;
  const [firstName, setFirstName] = useState(client?.firstName || '');
  const [lastName, setLastName] = useState(client?.lastName || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Vehicle fields (only for create)
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [color, setColor] = useState('');
  const [mileage, setMileage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (isEdit) {
        await apiFetch(`/users/${client!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName,
            lastName,
            phone: phone || undefined,
          }),
        });
      } else {
        const finalEmail = `${phone.replace(/\D/g, '')}@client.local`;
        const created: any = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            firstName,
            lastName,
            email: finalEmail,
            password: crypto.randomUUID().slice(0, 12),
            phone: phone || undefined,
            role: 'CLIENT',
          }),
        });

        // Create vehicle if make+model provided
        if (make && model && created.id) {
          await apiFetch('/vehicles', {
            method: 'POST',
            body: JSON.stringify({
              clientId: created.id,
              make,
              model,
              year: year ? Number(year) : undefined,
              licensePlate: licensePlate || undefined,
              vin: vin || undefined,
              color: color || undefined,
              mileage: mileage ? Number(mileage) : undefined,
            }),
          });
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">
          {isEdit ? 'Редактировать клиента' : 'Новый клиент'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Имя *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Фамилия *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Телефон *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+79001234567"
              className={inputCls}
              required
            />
          </div>

          {/* Vehicle — only for new client */}
          {!isEdit && (
            <div className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-700">Автомобиль</p>
              <p className="text-[11px] text-gray-400">Кириллица конвертируется в латиницу автоматически</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Марка (Toyota, BMW)"
                  value={make}
                  onChange={(e) => setMake(sanitizeMakeModel(e.target.value))}
                  className={inputCls}
                />
                <input
                  placeholder="Модель (Camry, X5)"
                  value={model}
                  onChange={(e) => setModel(sanitizeMakeModel(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Год"
                  type="number"
                  min={1900}
                  max={2030}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={inputCls}
                />
                <input
                  placeholder="Цвет"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className={inputCls}
                />
                <input
                  placeholder="Пробег (км)"
                  type="number"
                  min={0}
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className={inputCls}
                />
              </div>
              <input
                placeholder="Госномер (A123BC77)"
                value={licensePlate}
                onChange={(e) => setLicensePlate(sanitizePlate(e.target.value))}
                className={inputCls}
              />
              <input
                placeholder="VIN (17 символов)"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
                className={`${inputCls} font-mono`}
                maxLength={17}
              />
            </div>
          )}

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
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
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
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  source: string | null;
  adChannel: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  serviceBay: { id: string; name: string; type: string | null } | null;
}

function AppointmentDetailModal({
  appointmentId,
  onClose,
  onUpdate,
}: {
  appointmentId: string;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: appointment, isLoading } = useQuery<AppointmentDetail>({
    queryKey: ['appointment-detail', appointmentId],
    queryFn: () => apiFetch(`/appointments/${appointmentId}`),
    staleTime: 0,
  });

  const { data: bays } = useQuery<{ data: { id: string; name: string; type: string | null }[] }>({
    queryKey: ['bays-modal'],
    queryFn: () => apiFetch('/service-bays?isActive=true&limit=50'),
  });

  const { data: advisors } = useQuery<{ data: { id: string; firstName: string; lastName: string }[] }>({
    queryKey: ['advisors-modal'],
    queryFn: () => apiFetch('/users?limit=50&role=RECEPTIONIST'),
  });

  const [notes, setNotes] = useState('');
  const [serviceBayId, setServiceBayId] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (appointment && !initialized) {
    setNotes(appointment.notes || '');
    setServiceBayId(appointment.serviceBay?.id || '');
    setAdvisorId(appointment.advisor?.id || '');
    const start = new Date(appointment.scheduledStart);
    const end = new Date(appointment.scheduledEnd);
    setDate(start.toISOString().slice(0, 10));
    setStartTime(start.toTimeString().slice(0, 5));
    setEndTime(end.toTimeString().slice(0, 5));
    setInitialized(true);
  }

  const isEditable = appointment && !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'IN_PROGRESS'].includes(appointment.status);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: notes || null,
          serviceBayId: serviceBayId || null,
          advisorId: advisorId || null,
          scheduledStart: `${date}T${startTime}:00`,
          scheduledEnd: `${date}T${endTime}:00`,
        }),
      });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Запись</h2>
            {appointment && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW' ? 'bg-red-100 text-red-600' :
                appointment.status === 'COMPLETED' || appointment.status === 'IN_PROGRESS' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {APPT_STATUS[appointment.status] || appointment.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Загрузка...</div>
        ) : appointment ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Клиент</p>
                <p className="text-sm font-semibold text-gray-900">
                  {appointment.client.firstName} {appointment.client.lastName}
                </p>
                {appointment.client.phone && <p className="text-xs text-gray-600">{appointment.client.phone}</p>}
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Автомобиль</p>
                <p className="text-sm font-semibold text-gray-900">
                  {appointment.vehicle.make} {appointment.vehicle.model}
                  {appointment.vehicle.year ? ` (${appointment.vehicle.year})` : ''}
                </p>
                {appointment.vehicle.licensePlate && <p className="text-xs text-gray-600">{appointment.vehicle.licensePlate}</p>}
              </div>
            </div>

            {isEditable ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Дата</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Начало</label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Конец</label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600">Рабочий пост</label>
                  <select value={serviceBayId} onChange={(e) => setServiceBayId(e.target.value)} className={inputCls}>
                    <option value="">Не выбран</option>
                    {bays?.data?.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.type ? ` (${b.type})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600">Приёмщик</label>
                  <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} className={inputCls}>
                    <option value="">Не назначен</option>
                    {advisors?.data?.map((a) => (
                      <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600">Заметки</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Причина обращения..."
                    className={inputCls}
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? '...' : 'Сохранить'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{date}</span>{' '}
                    {startTime} – {endTime}
                  </div>
                  {appointment.serviceBay && (
                    <div className="text-xs text-gray-500">Пост: <span className="font-medium text-gray-700">{appointment.serviceBay.name}</span></div>
                  )}
                  {appointment.advisor && (
                    <div className="text-xs text-gray-500">Приёмщик: <span className="font-medium text-gray-700">{appointment.advisor.firstName} {appointment.advisor.lastName}</span></div>
                  )}
                  {appointment.notes && (
                    <div className="text-xs text-gray-500">Заметки: {appointment.notes}</div>
                  )}
                  {appointment.source && (
                    <div className="text-xs text-gray-500">Источник: {appointment.source}</div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-red-500">Не удалось загрузить данные</div>
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
  totalLabor: string | number;
  totalParts: string | number;
  totalAmount: string | number;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; vin: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  mechanic: { id: string; firstName: string; lastName: string } | null;
  serviceBay: { id: string; name: string; type: string | null } | null;
  items: {
    id: string;
    type: string;
    description: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    normHours: number | null;
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

  const { data: bays } = useQuery<{ data: { id: string; name: string; type: string | null }[] }>({
    queryKey: ['bays-modal'],
    queryFn: () => apiFetch('/service-bays?isActive=true&limit=50'),
  });

  const [complaints, setComplaints] = useState('');
  const [diagNotes, setDiagNotes] = useState('');
  const [mechanicId, setMechanicId] = useState('');
  const [serviceBayId, setServiceBayId] = useState('');
  const [initialized, setInitialized] = useState(false);

  const [showAddItem, setShowAddItem] = useState(false);
  const [itemType, setItemType] = useState<'LABOR' | 'PART'>('LABOR');
  const [itemDesc, setItemDesc] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');

  if (wo && !initialized) {
    setComplaints(wo.clientComplaints || '');
    setDiagNotes(wo.diagnosticNotes || '');
    setMechanicId(wo.mechanic?.id || '');
    setServiceBayId(wo.serviceBay?.id || '');
    setInitialized(true);
  }

  const next = wo ? WO_NEXT_STATUS[wo.status] : null;
  const isEditable = wo && !['CLOSED', 'CANCELLED'].includes(wo.status);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/work-orders/${workOrderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clientComplaints: complaints || null,
          diagnosticNotes: diagNotes || null,
          mechanicId: mechanicId || null,
          serviceBayId: serviceBayId || null,
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
    setSaving(true);
    setError('');
    try {
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

  async function handleAddItem() {
    if (!itemDesc || !itemPrice) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/work-orders/${workOrderId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: itemType,
          description: itemDesc,
          quantity: Number(itemQty) || 1,
          unitPrice: Number(itemPrice),
        }),
      });
      setItemDesc('');
      setItemQty('1');
      setItemPrice('');
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
              </div>
            </div>

            {isEditable && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Жалобы клиента</label>
                  <textarea value={complaints} onChange={(e) => setComplaints(e.target.value)} rows={2} placeholder="Что беспокоит клиента..." className={inputCls} />
                </div>

                {['DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(wo.status) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Заметки диагностики</label>
                    <textarea value={diagNotes} onChange={(e) => setDiagNotes(e.target.value)} rows={2} placeholder="Результаты диагностики..." className={inputCls} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Механик</label>
                    <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value)} className={inputCls}>
                      <option value="">Не назначен</option>
                      {mechanics?.data?.map((m) => (
                        <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Рабочий пост</label>
                    <select value={serviceBayId} onChange={(e) => setServiceBayId(e.target.value)} className={inputCls}>
                      <option value="">Не выбран</option>
                      {bays?.data?.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}{b.type ? ` (${b.type})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {!isEditable && wo.clientComplaints && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Жалобы клиента</p>
                <p className="text-sm text-gray-700">{wo.clientComplaints}</p>
              </div>
            )}

            {!isEditable && wo.diagnosticNotes && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">Диагностика</p>
                <p className="text-sm text-gray-700">{wo.diagnosticNotes}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">Работы и запчасти</p>
                {isEditable && (
                  <button onClick={() => setShowAddItem(!showAddItem)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                    {showAddItem ? 'Отмена' : '+ Добавить'}
                  </button>
                )}
              </div>

              {showAddItem && (
                <div className="mt-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={itemType} onChange={(e) => setItemType(e.target.value as 'LABOR' | 'PART')} className={inputCls}>
                      <option value="LABOR">Работа</option>
                      <option value="PART">Запчасть</option>
                    </select>
                    <input placeholder="Кол-во" type="number" min={1} value={itemQty} onChange={(e) => setItemQty(e.target.value)} className={inputCls} />
                  </div>
                  <input placeholder="Описание *" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} className={inputCls} />
                  <input placeholder="Цена за ед. *" type="number" min={0} step={0.01} value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className={inputCls} />
                  <button onClick={handleAddItem} disabled={saving || !itemDesc || !itemPrice} className="w-full rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                    Добавить
                  </button>
                </div>
              )}

              {wo.items.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {wo.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                      <div className="flex-1">
                        <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-medium ${item.type === 'LABOR' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.type === 'LABOR' ? 'Работа' : 'Запчасть'}
                        </span>
                        <span className="text-gray-700">{item.description}</span>
                        <span className="ml-1 text-gray-400">{item.quantity} x {formatMoney(item.unitPrice)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-700">{formatMoney(item.totalPrice)}</span>
                        {isEditable && (
                          <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600" title="Удалить">&times;</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Нет позиций</p>
              )}
            </div>

            <div className="flex justify-end gap-4 rounded-lg bg-gray-50 px-4 py-2">
              <div className="text-xs text-gray-500">Работы: <span className="font-semibold text-gray-700">{formatMoney(wo.totalLabor)}</span></div>
              <div className="text-xs text-gray-500">Запчасти: <span className="font-semibold text-gray-700">{formatMoney(wo.totalParts)}</span></div>
              <div className="text-sm font-bold text-gray-900">Итого: {formatMoney(wo.totalAmount)}</div>
            </div>

            {wo.workLogs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600">Журнал работ</p>
                <div className="mt-1 space-y-1">
                  {wo.workLogs.map((log) => (
                    <div key={log.id} className="rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-700">{formatShortDate(log.logDate)}</span>
                      {' — '}{log.description}
                      {log.mechanic && <span className="ml-1 text-gray-400">({log.mechanic.firstName} {log.mechanic.lastName})</span>}
                      <span className="ml-1 text-gray-400">{log.hoursWorked}ч</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-2">
              {isEditable && (
                <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {saving ? '...' : 'Сохранить'}
                </button>
              )}
              {next && (
                <button onClick={handleNextStatus} disabled={saving} className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {saving ? '...' : next.label}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-red-500">Не удалось загрузить данные</div>
        )}
      </div>
    </div>
  );
}
