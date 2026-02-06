'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// --- Types ---

interface AppointmentDetail {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  source: string | null;
  adChannel: string | null;
  notes: string | null;
  cancelReason: string | null;
  cancelComment: string | null;
  cancelledFrom: string | null;
  plannedItems: any[] | null;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  advisorId: string | null;
  vehicleId: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; mileage: number | null };
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

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ESTIMATING', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'],
  ESTIMATING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// --- Helpers ---

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// --- Main Page ---

export default function AppointmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data: apt, isLoading } = useQuery<AppointmentDetail>({
    queryKey: ['appointment', id],
    queryFn: () => apiFetch(`/appointments/${id}`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointment', id] }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiFetch(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointment', id] }),
  });

  if (isLoading) return <div className="py-8 text-center text-gray-500">Загрузка...</div>;
  if (!apt) return <div className="py-8 text-center text-gray-500">Заявка не найдена</div>;

  const allowedTransitions = TRANSITIONS[apt.status] || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/appointments" className="text-gray-400 hover:text-gray-600">
            &larr;
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Заявка</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[apt.status] || 'bg-gray-100'}`}>
            {STATUS_LABELS[apt.status] || apt.status}
          </span>
        </div>
        <div className="flex gap-2">
          {allowedTransitions.filter((s) => s !== 'CANCELLED' && s !== 'NO_SHOW').map((status) => (
            <button
              key={status}
              onClick={() => statusMutation.mutate(status)}
              disabled={statusMutation.isPending}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          {allowedTransitions.includes('NO_SHOW') && (
            <button
              onClick={() => {
                if (confirm('Отметить как «Не явился»?')) statusMutation.mutate('NO_SHOW');
              }}
              disabled={statusMutation.isPending}
              className="rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
            >
              Не явился
            </button>
          )}
          {allowedTransitions.includes('CANCELLED') && (
            <button
              onClick={() => {
                if (confirm('Отменить заявку?')) statusMutation.mutate('CANCELLED');
              }}
              disabled={statusMutation.isPending}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Отменить
            </button>
          )}
        </div>
      </div>

      {statusMutation.isError && (
        <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(statusMutation.error as any)?.message || 'Ошибка смены статуса'}
        </div>
      )}

      {/* Info Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Client & Vehicle */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Клиент</h3>
          <div className="mt-2 text-sm">
            <div className="font-medium text-gray-900">{apt.client.firstName} {apt.client.lastName}</div>
            {apt.client.phone && <div className="text-gray-500">{apt.client.phone}</div>}
            {apt.client.email && <div className="text-gray-500">{apt.client.email}</div>}
          </div>
          <h3 className="mt-4 text-sm font-semibold uppercase text-gray-500">Автомобиль</h3>
          <div className="mt-2 text-sm">
            <div className="font-medium text-gray-900">
              {apt.vehicle.make} {apt.vehicle.model} {apt.vehicle.year ? `(${apt.vehicle.year})` : ''}
            </div>
            {apt.vehicle.licensePlate && (
              <div className="font-mono text-gray-500">{apt.vehicle.licensePlate}</div>
            )}
            {apt.vehicle.mileage != null && (
              <div className="text-xs text-gray-500">Пробег: {apt.vehicle.mileage.toLocaleString('ru-RU')} км</div>
            )}
          </div>
        </div>

        {/* Appointment Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Информация</h3>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Запись на</span>
              <span className="text-gray-900">{formatDate(apt.scheduledStart)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Окончание</span>
              <span className="text-gray-900">{formatDate(apt.scheduledEnd)}</span>
            </div>
            <AssignField
              label="Приёмщик"
              currentValue={apt.advisor ? `${apt.advisor.firstName} ${apt.advisor.lastName}` : null}
              fetchUrl="/users?limit=100&sort=firstName&order=asc&role=RECEPTIONIST"
              onAssign={(userId) => updateMutation.mutate({ advisorId: userId || null })}
            />
            {apt.source && (
              <div className="flex justify-between">
                <span className="text-gray-500">Источник</span>
                <span className="text-gray-900">{apt.source}</span>
              </div>
            )}
            {apt.adChannel && (
              <div className="flex justify-between">
                <span className="text-gray-500">Рекл. канал</span>
                <span className="text-gray-900">{apt.adChannel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Создана</span>
              <span className="text-gray-900">{formatDate(apt.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Cancel Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Заметки</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {apt.notes || '—'}
          </p>

          {apt.status === 'CANCELLED' && (
            <>
              <h3 className="mt-4 text-sm font-semibold uppercase text-red-500">Отмена</h3>
              <div className="mt-2 space-y-1 text-sm">
                {apt.cancelledFrom && (
                  <div className="text-gray-500">
                    Был статус: <span className="font-medium text-gray-700">{STATUS_LABELS[apt.cancelledFrom] || apt.cancelledFrom}</span>
                  </div>
                )}
                {apt.cancelReason && (
                  <div className="text-gray-700">{apt.cancelReason}</div>
                )}
                {apt.cancelComment && (
                  <div className="text-gray-500 italic">{apt.cancelComment}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Planned Items */}
      {apt.plannedItems && apt.plannedItems.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Планируемые работы</h3>
          <div className="mt-3 space-y-2">
            {apt.plannedItems.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                {typeof item === 'string' ? item : item.description || item.name || JSON.stringify(item)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Assign Field (reusable) ---

function AssignField({
  label,
  currentValue,
  fetchUrl,
  onAssign,
}: {
  label: string;
  currentValue: string | null;
  fetchUrl: string;
  onAssign: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { data } = useQuery<{ data: any[] }>({
    queryKey: ['assign-field', fetchUrl],
    queryFn: () => apiFetch(fetchUrl),
    enabled: editing,
  });

  if (editing) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-gray-500">{label}</span>
        <select
          autoFocus
          className="w-48 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
          defaultValue=""
          onChange={(e) => {
            onAssign(e.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
        >
          <option value="">Не назначен</option>
          {data?.data?.map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.firstName} {item.lastName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-900 hover:bg-primary-50 hover:text-primary-600"
        title="Нажмите для изменения"
      >
        {currentValue || '—'}
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );
}
