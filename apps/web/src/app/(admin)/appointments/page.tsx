'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface AppointmentData {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  source: string | null;
  adChannel: string | null;
  notes: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null };
  serviceBay: { id: string; name: string; type: string | null } | null;
}

interface PaginatedResponse {
  data: AppointmentData[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждена',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не явился',
};

const APPOINTMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  NO_SHOW: 'bg-red-100 text-red-700',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [actionError, setActionError] = useState('');

  const createWOMutation = useMutation({
    mutationFn: (appointmentId: string) =>
      apiFetch(`/work-orders/from-appointment/${appointmentId}`, { method: 'POST' }),
    onSuccess: (data: any) => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      router.push(`/work-orders/${data.id}`);
    },
    onError: (err: any) => {
      setActionError(err.message || 'Ошибка создания заказ-наряда');
    },
  });

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['appointments', page, statusFilter],
    queryFn: () =>
      apiFetch(`/appointments?page=${page}&limit=20&sort=scheduledStart&order=asc${statusFilter ? `&status=${statusFilter}` : ''}`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/appointments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Ошибка удаления записи');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Записи на обслуживание</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Новая запись
        </button>
      </div>

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

      {actionError && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="ml-4 font-medium text-red-800 hover:text-red-900">✕</button>
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Записей не найдено</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Дата/Время</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Клиент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Автомобиль</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Пост</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((appt) => (
                  <tr key={appt.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{formatDateTime(appt.scheduledStart)}</div>
                      <div className="text-xs text-gray-500">до {formatTime(appt.scheduledEnd)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{appt.client.firstName} {appt.client.lastName}</div>
                      {appt.client.phone && <div className="text-xs text-gray-500">{appt.client.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{appt.vehicle.make} {appt.vehicle.model}</div>
                      {appt.vehicle.licensePlate && (
                        <div className="text-xs font-mono text-gray-500">{appt.vehicle.licensePlate}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {appt.serviceBay?.name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {(APPOINTMENT_TRANSITIONS[appt.status] || []).length > 0 ? (
                        <select
                          value={appt.status}
                          onChange={(e) => statusMutation.mutate({ id: appt.id, status: e.target.value })}
                          className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-gray-100'}`}
                        >
                          <option value={appt.status}>{STATUS_LABELS[appt.status]}</option>
                          {(APPOINTMENT_TRANSITIONS[appt.status] || []).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-gray-100'}`}>
                          {STATUS_LABELS[appt.status] || appt.status}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        {['PENDING', 'CONFIRMED'].includes(appt.status) && (
                          <button
                            onClick={() => createWOMutation.mutate(appt.id)}
                            disabled={createWOMutation.isPending}
                            className="text-primary-600 hover:text-primary-800 disabled:opacity-50"
                          >
                            {createWOMutation.isPending ? 'Создание...' : 'Создать ЗН'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Удалить запись от ${formatDateTime(appt.scheduledStart)}?`)) {
                              deleteMutation.mutate(appt.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        <AppointmentModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            queryClient.invalidateQueries({ queryKey: ['client-funnel'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          }}
        />
      )}
    </div>
  );
}

function AppointmentModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [serviceBayId, setServiceBayId] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery<{ data: { id: string; firstName: string; lastName: string; email: string }[] }>({
    queryKey: ['clients-for-appt'],
    queryFn: () => apiFetch('/users?limit=100&sort=firstName&order=asc&role=CLIENT'),
  });

  const { data: vehicles } = useQuery<{ data: { id: string; make: string; model: string; licensePlate: string | null; clientId: string }[] }>({
    queryKey: ['vehicles-for-appt', clientId],
    queryFn: () => apiFetch(`/vehicles?limit=50${clientId ? `&clientId=${clientId}` : ''}`),
    enabled: !!clientId,
  });

  const { data: bays } = useQuery<{ data: { id: string; name: string; type: string | null }[] }>({
    queryKey: ['bays-for-appt'],
    queryFn: () => apiFetch('/service-bays?isActive=true&limit=50'),
  });

  const { data: baySchedule } = useQuery<{ data: { id: string; scheduledStart: string; scheduledEnd: string; client: { firstName: string; lastName: string }; vehicle: { make: string; model: string } }[] }>({
    queryKey: ['bay-schedule', serviceBayId, date],
    queryFn: () => apiFetch(`/appointments?limit=50&sort=scheduledStart&order=asc&from=${date}T00:00:00&to=${date}T23:59:59&serviceBayId=${serviceBayId}`),
    enabled: !!serviceBayId && !!date,
  });

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
    if (!clientId || !vehicleId || !date) {
      setError('Заполните все обязательные поля');
      return;
    }
    setSaving(true);

    try {
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          vehicleId,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Новая запись</h2>

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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Дата *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Начало *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Конец *</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
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
            {hasConflict && (
              <p className="mt-1 text-xs font-bold text-red-600">Пост занят в выбранное время!</p>
            )}
            {serviceBayId && date && baySchedule?.data && baySchedule.data.length > 0 && !hasConflict && (
              <p className="mt-1 text-xs text-amber-600">На этот день есть записи (без пересечений)</p>
            )}
            {serviceBayId && date && baySchedule?.data && baySchedule.data.length === 0 && (
              <p className="mt-1 text-xs text-green-600">Пост свободен</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Источник обращения</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Не указан</option>
              <option value="phone">Телефон</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="website">Сайт</option>
              <option value="walk-in">Самозаход</option>
              <option value="referral">Рекомендация</option>
              <option value="repeat">Повторный визит</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Причина обращения, жалобы клиента..."
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
              disabled={saving || hasConflict}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : hasConflict ? 'Пост занят' : 'Записать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
