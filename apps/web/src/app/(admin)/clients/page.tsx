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

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<ClientData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
}: {
  client: ClientData;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
                  <div key={a.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs">
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
                  <div key={wo.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs">
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
