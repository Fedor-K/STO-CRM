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
  notes: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null };
  serviceBay: { id: string; name: string; type: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждена',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не явился',
};

const STATUS_BG: Record<string, string> = {
  PENDING: 'bg-yellow-400',
  CONFIRMED: 'bg-blue-500',
  IN_PROGRESS: 'bg-green-500',
  COMPLETED: 'bg-gray-400',
  CANCELLED: 'bg-gray-300',
  NO_SHOW: 'bg-red-400',
};

const STATUS_BLOCK: Record<string, string> = {
  PENDING: 'bg-yellow-100 border-yellow-400 text-yellow-900',
  ESTIMATING: 'bg-amber-100 border-amber-400 text-amber-900',
  CONFIRMED: 'bg-blue-100 border-blue-400 text-blue-900',
  IN_PROGRESS: 'bg-green-100 border-green-400 text-green-900',
  COMPLETED: 'bg-gray-100 border-gray-300 text-gray-600',
  CANCELLED: 'bg-gray-50 border-gray-200 text-gray-400',
  NO_SHOW: 'bg-red-100 border-red-300 text-red-800',
};

const APPOINTMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ESTIMATING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  ESTIMATING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const HOURS_START = 6;
const HOURS_END = 20;
const HOUR_HEIGHT = 60; // px per hour

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const d1 = monday.getDate();
  const d2 = sunday.getDate();
  const m1 = monday.getMonth();
  const m2 = sunday.getMonth();
  const y = monday.getFullYear();

  if (m1 === m2) {
    return `${d1}–${d2} ${MONTH_NAMES[m1]} ${y}`;
  }
  return `${d1} ${MONTH_NAMES[m1]} – ${d2} ${MONTH_NAMES[m2]} ${y}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const from = formatDateISO(weekStart) + 'T00:00:00Z';
  const to = formatDateISO(weekEnd) + 'T00:00:00Z';

  const { data: appointments, isLoading } = useQuery<AppointmentData[]>({
    queryKey: ['calendar-appointments', from, to],
    queryFn: () => apiFetch(`/appointments/calendar?from=${from}&to=${to}`),
  });

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const hours = useMemo(() => {
    return Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);
  }, []);

  const today = new Date();

  function goToday() {
    setWeekStart(getMonday(new Date()));
  }

  function goPrev() {
    setWeekStart((w) => addDays(w, -7));
  }

  function goNext() {
    setWeekStart((w) => addDays(w, 7));
  }

  function getAppointmentsForDay(day: Date) {
    if (!appointments) return [];
    return appointments.filter((a) => {
      const start = new Date(a.scheduledStart);
      return isSameDay(start, day);
    });
  }

  function layoutAppointments(dayAppts: AppointmentData[]) {
    const items = dayAppts.map((appt) => {
      const start = new Date(appt.scheduledStart);
      const end = new Date(appt.scheduledEnd);
      const startH = start.getHours() + start.getMinutes() / 60;
      const endH = end.getHours() + end.getMinutes() / 60;
      return { appt, startH, endH };
    }).sort((a, b) => a.startH - b.startH || a.endH - b.endH);

    const columns: { endH: number }[][] = [];
    const result: { appt: AppointmentData; col: number; totalCols: number }[] = [];

    for (const item of items) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const colItems = columns[c];
        if (colItems[colItems.length - 1].endH <= item.startH) {
          colItems.push(item);
          result.push({ appt: item.appt, col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([item]);
        result.push({ appt: item.appt, col: columns.length - 1, totalCols: 0 });
      }
    }

    const totalCols = columns.length;
    return result.map((r) => ({ ...r, totalCols }));
  }

  function getBlockStyle(appt: AppointmentData, col: number, totalCols: number) {
    const start = new Date(appt.scheduledStart);
    const end = new Date(appt.scheduledEnd);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const clampedStart = Math.max(startHour, HOURS_START);
    const clampedEnd = Math.min(endHour, HOURS_END);
    if (clampedEnd <= clampedStart) return null;
    const top = (clampedStart - HOURS_START) * HOUR_HEIGHT;
    const height = (clampedEnd - clampedStart) * HOUR_HEIGHT;
    const widthPct = 100 / totalCols;
    const leftPct = col * widthPct;
    return {
      top: `${top}px`,
      height: `${Math.max(height, 20)}px`,
      left: `${leftPct}%`,
      width: `${widthPct}%`,
    };
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Календарь записей</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            &larr; Пред. неделя
          </button>
          <button
            onClick={goToday}
            className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Сегодня
          </button>
          <button
            onClick={goNext}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            След. неделя &rarr;
          </button>
        </div>
      </div>

      <p className="mt-2 text-lg font-medium text-gray-600">{formatWeekRange(weekStart)}</p>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200">
            <div className="border-r border-gray-200" />
            {days.map((day, i) => {
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={i}
                  className={`border-r border-gray-200 px-2 py-3 text-center text-sm font-medium last:border-r-0 ${
                    isToday ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <div>{DAY_NAMES[i]}</div>
                  <div className={`text-lg ${isToday ? 'font-bold' : ''}`}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Time labels column */}
            <div className="border-r border-gray-200">
              {hours.map((h) => (
                <div
                  key={h}
                  className="flex items-start justify-end border-b border-gray-100 pr-2 text-xs text-gray-400"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="-mt-2">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day, dayIdx) => {
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={dayIdx}
                  className={`relative border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-primary-50/30' : ''}`}
                  style={{ height: `${(HOURS_END - HOURS_START) * HOUR_HEIGHT}px` }}
                >
                  {/* Hour lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-gray-100"
                      style={{ top: `${(h - HOURS_START) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* Now indicator */}
                  {isToday && (() => {
                    const now = new Date();
                    const nowHour = now.getHours() + now.getMinutes() / 60;
                    if (nowHour >= HOURS_START && nowHour <= HOURS_END) {
                      const top = (nowHour - HOURS_START) * HOUR_HEIGHT;
                      return (
                        <div
                          className="absolute left-0 right-0 z-10 border-t-2 border-red-500"
                          style={{ top: `${top}px` }}
                        >
                          <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Appointment blocks */}
                  {layoutAppointments(dayAppointments).map(({ appt, col, totalCols }) => {
                    const style = getBlockStyle(appt, col, totalCols);
                    if (!style) return null;
                    const colors = STATUS_BLOCK[appt.status] || 'bg-gray-100 border-gray-300 text-gray-700';
                    return (
                      <div
                        key={appt.id}
                        className={`absolute z-20 cursor-pointer overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-xs shadow-sm transition-opacity hover:opacity-90 ${colors}`}
                        style={style}
                        onClick={() => setSelectedAppointment(appt)}
                        title={`${appt.client.firstName} ${appt.client.lastName} — ${appt.vehicle.make} ${appt.vehicle.model}`}
                      >
                        <div className="truncate font-medium">
                          {formatTime(appt.scheduledStart)}–{formatTime(appt.scheduledEnd)}
                        </div>
                        <div className="truncate">
                          {appt.client.firstName} {appt.client.lastName}
                        </div>
                        <div className="truncate text-[10px] opacity-75">
                          {appt.vehicle.make} {appt.vehicle.model}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={() => {
            queryClient.invalidateQueries({ queryKey: ['calendar-appointments'] });
          }}
          onCreateWorkOrder={(woId) => {
            router.push(`/work-orders/${woId}`);
          }}
        />
      )}
    </div>
  );
}

function AppointmentDetailModal({
  appointment,
  onClose,
  onStatusChange,
  onCreateWorkOrder,
}: {
  appointment: AppointmentData;
  onClose: () => void;
  onStatusChange: () => void;
  onCreateWorkOrder: (woId: string) => void;
}) {
  const [error, setError] = useState('');

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      setError('');
      onStatusChange();
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || 'Ошибка смены статуса');
    },
  });

  const createWOMutation = useMutation({
    mutationFn: (appointmentId: string) =>
      apiFetch(`/work-orders/from-appointment/${appointmentId}`, { method: 'POST' }),
    onSuccess: (data: any) => {
      onCreateWorkOrder(data.id);
    },
    onError: (err: any) => {
      setError(err.message || 'Ошибка создания заказ-наряда');
    },
  });

  const transitions = APPOINTMENT_TRANSITIONS[appointment.status] || [];

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-gray-900">Детали записи</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="text-sm text-gray-500">Статус:</span>
            <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BLOCK[appointment.status] || ''}`}>
              {STATUS_LABELS[appointment.status] || appointment.status}
            </span>
          </div>

          <div>
            <span className="text-sm text-gray-500">Время:</span>
            <span className="ml-2 text-sm font-medium text-gray-900">
              {formatDateTime(appointment.scheduledStart)} — {formatDateTime(appointment.scheduledEnd)}
            </span>
          </div>

          <div>
            <span className="text-sm text-gray-500">Клиент:</span>
            <span className="ml-2 text-sm font-medium text-gray-900">
              {appointment.client.firstName} {appointment.client.lastName}
            </span>
            {appointment.client.phone && (
              <span className="ml-2 text-sm text-gray-500">{appointment.client.phone}</span>
            )}
          </div>

          <div>
            <span className="text-sm text-gray-500">Автомобиль:</span>
            <span className="ml-2 text-sm font-medium text-gray-900">
              {appointment.vehicle.make} {appointment.vehicle.model}
              {appointment.vehicle.year ? ` (${appointment.vehicle.year})` : ''}
            </span>
            {appointment.vehicle.licensePlate && (
              <span className="ml-2 font-mono text-sm text-gray-500">{appointment.vehicle.licensePlate}</span>
            )}
          </div>

          {appointment.serviceBay && (
            <div>
              <span className="text-sm text-gray-500">Пост:</span>
              <span className="ml-2 text-sm font-medium text-gray-900">{appointment.serviceBay.name}</span>
            </div>
          )}

          {appointment.advisor && (
            <div>
              <span className="text-sm text-gray-500">Приёмщик:</span>
              <span className="ml-2 text-sm font-medium text-gray-900">
                {appointment.advisor.firstName} {appointment.advisor.lastName}
              </span>
            </div>
          )}

          {appointment.notes && (
            <div>
              <span className="text-sm text-gray-500">Заметки:</span>
              <p className="mt-1 text-sm text-gray-700">{appointment.notes}</p>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {transitions.map((status) => (
            <button
              key={status}
              onClick={() => statusMutation.mutate({ id: appointment.id, status })}
              disabled={statusMutation.isPending}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {STATUS_LABELS[status]}
            </button>
          ))}

          {['PENDING', 'CONFIRMED'].includes(appointment.status) && (
            <button
              onClick={() => createWOMutation.mutate(appointment.id)}
              disabled={createWOMutation.isPending}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {createWOMutation.isPending ? 'Создание...' : 'Создать ЗН'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
