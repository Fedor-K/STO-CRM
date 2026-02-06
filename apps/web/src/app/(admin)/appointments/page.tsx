'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

// --- Types ---

interface AppointmentRow {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; mileage: number | null };
}

interface PaginatedResponse {
  data: AppointmentRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// --- Constants ---

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  ESTIMATING: 'Согласование',
  CONFIRMED: 'Записан',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не явился',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-200 text-gray-700',
  ESTIMATING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-orange-100 text-orange-700',
};

// --- Helpers ---

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Main Page ---

export default function AppointmentsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: tableData, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['appointments-list', page, statusFilter],
    queryFn: () =>
      apiFetch(`/appointments?page=${page}&limit=20&sort=createdAt&order=desc${statusFilter ? `&status=${statusFilter}` : ''}`),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Заявки</h1>

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

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !tableData?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Заявок не найдено</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Дата</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Клиент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Автомобиль</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Приёмщик</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Заметки</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.data.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/appointments/${a.id}`)}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">
                        {a.client.firstName} {a.client.lastName}
                      </div>
                      {a.client.phone && (
                        <div className="text-xs text-gray-500">{a.client.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{a.vehicle.make} {a.vehicle.model}</div>
                      {a.vehicle.licensePlate && (
                        <div className="text-xs font-mono text-gray-500">{a.vehicle.licensePlate}</div>
                      )}
                      {a.vehicle.mileage != null && (
                        <div className="text-xs text-gray-400">{a.vehicle.mileage.toLocaleString('ru-RU')} км</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[a.status] || a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {a.advisor ? `${a.advisor.firstName} ${a.advisor.lastName}` : '—'}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-sm text-gray-500" title={a.notes || ''}>
                      {a.notes || '—'}
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
    </div>
  );
}
