'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  licensePlate: string | null;
  color: string | null;
  mileage: number | null;
  clientId: string;
  client: Client;
  createdAt: string;
}

interface WorkOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number | string;
  createdAt: string;
}

interface PaginatedResponse {
  data: Vehicle[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

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
  NEW: 'bg-gray-200 text-gray-700',
  DIAGNOSED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-cyan-100 text-cyan-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function VehiclesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['vehicles', page, search],
    queryFn: () =>
      apiFetch(`/vehicles?page=${page}&limit=20&sort=make&order=asc${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  function handleDelete(v: Vehicle) {
    if (confirm(`Удалить автомобиль ${v.make} ${v.model} (${v.licensePlate || 'без госномера'})?`)) {
      deleteMutation.mutate(v.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Автомобили</h1>
        <button
          onClick={() => { setEditingVehicle(null); setShowModal(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить автомобиль
        </button>
      </div>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Поиск по марке, модели, госномеру, VIN..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Автомобили не найдены</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Автомобиль</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Госномер</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">VIN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Пробег</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Владелец</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((v) => {
                  const isExpanded = expandedId === v.id;
                  return (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : v.id)}
                        className="cursor-pointer hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {v.make} {v.model}
                          </div>
                          <div className="text-xs text-gray-500">
                            {[v.year, v.color].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-900">
                          {v.licensePlate || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-mono text-gray-500">
                          {v.vin || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                          {v.mileage ? `${v.mileage.toLocaleString('ru-RU')} км` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {v.client.firstName} {v.client.lastName}
                          </div>
                          {v.client.phone && (
                            <div className="text-xs text-gray-500">{v.client.phone}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingVehicle(v); setShowModal(true); }}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(v); }}
                            className="ml-3 text-red-600 hover:text-red-800"
                          >
                            Удалить
                          </button>
                          <svg
                            className={`ml-2 inline h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-6 py-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              {/* Vehicle details */}
                              <div className="rounded-lg border border-gray-100 bg-white p-4">
                                <h4 className="text-xs font-semibold uppercase text-gray-500">Автомобиль</h4>
                                <div className="mt-2 space-y-1 text-sm">
                                  <div className="font-medium text-gray-900">{v.make} {v.model}{v.year ? ` (${v.year})` : ''}</div>
                                  {v.licensePlate && <div className="text-gray-600">Госномер: <span className="font-medium font-mono">{v.licensePlate}</span></div>}
                                  {v.vin && <div className="text-gray-600">VIN: <span className="font-mono text-xs">{v.vin}</span></div>}
                                  {v.color && <div className="text-gray-600">Цвет: {v.color}</div>}
                                  {v.mileage != null && <div className="text-gray-600">Пробег: {v.mileage.toLocaleString('ru-RU')} км</div>}
                                </div>
                              </div>
                              {/* Owner details */}
                              <div className="rounded-lg border border-gray-100 bg-white p-4">
                                <h4 className="text-xs font-semibold uppercase text-gray-500">Владелец</h4>
                                <div className="mt-2 space-y-1 text-sm">
                                  <div className="font-medium text-gray-900">{v.client.lastName} {v.client.firstName}</div>
                                  {v.client.phone ? (
                                    <div className="text-gray-600">Тел: {v.client.phone}</div>
                                  ) : (
                                    <div className="text-gray-400">Нет телефона</div>
                                  )}
                                  <div className="text-gray-500 text-xs">{v.client.email}</div>
                                </div>
                              </div>
                            </div>
                            {/* Work order history */}
                            <VehicleWorkOrders vehicleId={v.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
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
        <VehicleModal
          vehicle={editingVehicle}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          }}
        />
      )}
    </div>
  );
}

function VehicleModal({
  vehicle,
  onClose,
  onSuccess,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [make, setMake] = useState(vehicle?.make || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : '');
  const [vin, setVin] = useState(vehicle?.vin || '');
  const [licensePlate, setLicensePlate] = useState(vehicle?.licensePlate || '');
  const [color, setColor] = useState(vehicle?.color || '');
  const [mileage, setMileage] = useState(vehicle?.mileage ? String(vehicle.mileage) : '');
  const [clientId, setClientId] = useState(vehicle?.clientId || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery<{ data: { id: string; firstName: string; lastName: string; email: string }[] }>({
    queryKey: ['clients-for-select'],
    queryFn: () => apiFetch('/users?limit=100&sort=firstName&order=asc'),
    enabled: !vehicle,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body: any = {
      make,
      model,
      year: year ? Number(year) : undefined,
      vin: vin || undefined,
      licensePlate: licensePlate || undefined,
      color: color || undefined,
      mileage: mileage ? Number(mileage) : undefined,
    };

    if (!vehicle) {
      if (!clientId) { setError('Выберите клиента'); setSaving(false); return; }
      body.clientId = clientId;
    }

    try {
      if (vehicle) {
        await apiFetch(`/vehicles/${vehicle.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/vehicles', { method: 'POST', body: JSON.stringify(body) });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">
          {vehicle ? 'Редактировать автомобиль' : 'Новый автомобиль'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!vehicle && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Клиент *</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              >
                <option value="">Выберите клиента</option>
                {clients?.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Марка *</label>
              <input
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Toyota"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Модель *</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Camry"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Год</label>
              <input
                type="number"
                min="1900"
                max="2030"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Цвет</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Пробег (км)</label>
              <input
                type="number"
                min="0"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Госномер</label>
              <input
                type="text"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                placeholder="А001АА177"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">VIN</label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                maxLength={17}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
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
              {saving ? 'Сохранение...' : vehicle ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VehicleWorkOrders({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading } = useQuery<{ workOrders: WorkOrderSummary[] }>({
    queryKey: ['vehicle-detail', vehicleId],
    queryFn: () => apiFetch(`/vehicles/${vehicleId}`),
  });

  const workOrders = data?.workOrders;

  if (isLoading) {
    return <div className="mt-4 text-sm text-gray-500">Загрузка истории...</div>;
  }

  if (!workOrders || workOrders.length === 0) {
    return <div className="mt-4 text-sm text-gray-400">Нет заказ-нарядов</div>;
  }

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase text-gray-500">История заказ-нарядов (последние 10)</h4>
      <div className="mt-2 overflow-hidden rounded-lg border border-gray-100 bg-white">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Номер</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Дата</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Статус</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workOrders.map((wo) => (
              <tr key={wo.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm">
                  <Link href={`/work-orders/${wo.id}`} className="font-medium text-primary-600 hover:text-primary-800">
                    {wo.orderNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 text-sm text-gray-600">
                  {new Date(wo.createdAt).toLocaleDateString('ru-RU')}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[wo.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[wo.status] || wo.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                  {Number(wo.totalAmount).toLocaleString('ru-RU')} ₽
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
