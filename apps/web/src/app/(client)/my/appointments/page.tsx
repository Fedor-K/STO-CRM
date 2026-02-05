'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает',
  CONFIRMED: 'Подтверждена',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не явился',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  NO_SHOW: 'bg-red-100 text-red-700',
};

interface Appointment {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  notes: string | null;
  vehicle: { make: string; model: string; licensePlate: string | null };
}

export default function MyAppointmentsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<{ data: Appointment[] }>({
    queryKey: ['my-appointments'],
    queryFn: () => apiFetch(`/appointments?clientId=${user?.id}&limit=50&sort=scheduledStart&order=desc`),
    enabled: !!user,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Мои записи</h1>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data?.length ? (
        <div className="mt-8 text-center text-gray-500">У вас пока нет записей</div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.data.map((appt) => (
            <div key={appt.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(appt.scheduledStart).toLocaleDateString('ru-RU', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(appt.scheduledStart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(appt.scheduledEnd).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] || 'bg-gray-100'}`}>
                  {STATUS_LABELS[appt.status] || appt.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700">
                {appt.vehicle.make} {appt.vehicle.model}
                {appt.vehicle.licensePlate && ` (${appt.vehicle.licensePlate})`}
              </p>
              {appt.notes && <p className="mt-1 text-sm text-gray-500">{appt.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
