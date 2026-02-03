'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  licensePlate: string | null;
  color: string | null;
  mileage: number | null;
}

export default function MyVehiclesPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<{ data: Vehicle[] }>({
    queryKey: ['my-vehicles'],
    queryFn: () => apiFetch(`/vehicles?clientId=${user?.id}&limit=50`),
    enabled: !!user,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Мои автомобили</h1>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data?.length ? (
        <div className="mt-8 text-center text-gray-500">У вас пока нет автомобилей</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {data.data.map((v) => (
            <div key={v.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-lg font-medium text-gray-900">{v.make} {v.model}</h3>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                {v.year && <p>Год: {v.year}</p>}
                {v.color && <p>Цвет: {v.color}</p>}
                {v.licensePlate && <p>Госномер: <span className="font-mono">{v.licensePlate}</span></p>}
                {v.vin && <p>VIN: <span className="font-mono text-xs">{v.vin}</span></p>}
                {v.mileage && <p>Пробег: {v.mileage.toLocaleString('ru-RU')} км</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
