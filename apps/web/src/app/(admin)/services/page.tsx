'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: string;
  estimatedMinutes: number;
  normHours: string | null;
  complexityLevel: number;
  serviceUsage: 'PLANNING' | 'PRODUCTION' | 'BOTH';
  isActive: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: Service[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const SERVICE_USAGE_LABELS: Record<string, string> = {
  PLANNING: 'Планирование',
  PRODUCTION: 'Производство',
  BOTH: 'Оба',
};

const COMPLEXITY_LABELS: Record<number, string> = {
  1: 'Простая',
  2: 'Средняя',
  3: 'Сложная',
  4: 'Очень сложная',
  5: 'Экспертная',
};

function formatPrice(price: string | number): string {
  return Number(price).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['services', page, search],
    queryFn: () => apiFetch(`/services?page=${page}&limit=20&sort=name&order=asc${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  function handleEdit(service: Service) {
    setEditingService(service);
    setShowModal(true);
  }

  function handleCreate() {
    setEditingService(null);
    setShowModal(true);
  }

  function handleDelete(service: Service) {
    if (confirm(`Удалить услугу «${service.name}»?`)) {
      deleteMutation.mutate(service.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Каталог услуг</h1>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить услугу
        </button>
      </div>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Услуги не найдены</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Название</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Цена</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Время</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Нормо-часы</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Тип</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Сложность</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{service.name}</div>
                      {service.description && (
                        <div className="text-xs text-gray-500">{service.description}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatPrice(service.price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatMinutes(service.estimatedMinutes)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {service.normHours ? `${service.normHours} н/ч` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {SERVICE_USAGE_LABELS[service.serviceUsage]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {COMPLEXITY_LABELS[service.complexityLevel] || service.complexityLevel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          service.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {service.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => handleEdit(service)}
                        className="text-primary-600 hover:text-primary-800"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(service)}
                        className="ml-3 text-red-600 hover:text-red-800"
                      >
                        Удалить
                      </button>
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
        <ServiceModal
          service={editingService}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['services'] });
          }}
        />
      )}
    </div>
  );
}

function ServiceModal({
  service,
  onClose,
  onSuccess,
}: {
  service: Service | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(service?.name || '');
  const [description, setDescription] = useState(service?.description || '');
  const [price, setPrice] = useState(service ? String(service.price) : '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(service?.estimatedMinutes ?? 60));
  const [normHours, setNormHours] = useState(service?.normHours ? String(service.normHours) : '');
  const [complexityLevel, setComplexityLevel] = useState(String(service?.complexityLevel ?? 1));
  const [serviceUsage, setServiceUsage] = useState(service?.serviceUsage || 'BOTH');
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body: any = {
      name,
      description: description || undefined,
      price: Number(price),
      estimatedMinutes: Number(estimatedMinutes),
      normHours: normHours ? Number(normHours) : undefined,
      complexityLevel: Number(complexityLevel),
      serviceUsage,
    };

    if (service) {
      body.isActive = isActive;
    }

    try {
      if (service) {
        await apiFetch(`/services/${service.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/services', { method: 'POST', body: JSON.stringify(body) });
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
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900">
          {service ? 'Редактировать услугу' : 'Новая услуга'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Название *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Цена (руб.) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Время (мин.)</label>
              <input
                type="number"
                min="1"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Нормо-часы</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={normHours}
                onChange={(e) => setNormHours(e.target.value)}
                placeholder="Необязательно"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Сложность</label>
              <select
                value={complexityLevel}
                onChange={(e) => setComplexityLevel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="1">1 — Простая</option>
                <option value="2">2 — Средняя</option>
                <option value="3">3 — Сложная</option>
                <option value="4">4 — Очень сложная</option>
                <option value="5">5 — Экспертная</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Тип использования</label>
              <select
                value={serviceUsage}
                onChange={(e) => setServiceUsage(e.target.value as any)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="BOTH">Оба (планирование и производство)</option>
                <option value="PLANNING">Только планирование</option>
                <option value="PRODUCTION">Только производство</option>
              </select>
            </div>
            {service && (
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Активна
                </label>
              </div>
            )}
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
              {saving ? 'Сохранение...' : service ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
