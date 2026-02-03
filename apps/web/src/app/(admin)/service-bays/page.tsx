'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface ServiceBay {
  id: string;
  name: string;
  type: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: ServiceBay[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ServiceBaysPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingBay, setEditingBay] = useState<ServiceBay | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['service-bays'],
    queryFn: () => apiFetch('/service-bays?limit=50&sort=name&order=asc'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/service-bays/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service-bays'] }),
  });

  function handleDelete(bay: ServiceBay) {
    if (confirm(`Удалить пост «${bay.name}»?`)) {
      deleteMutation.mutate(bay.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Рабочие посты</h1>
        <button
          onClick={() => { setEditingBay(null); setShowModal(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить пост
        </button>
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Рабочие посты не найдены</div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((bay) => (
            <div
              key={bay.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">{bay.name}</h3>
                  {bay.type && <p className="mt-0.5 text-xs text-gray-500">{bay.type}</p>}
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    bay.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {bay.isActive ? 'Активен' : 'Неактивен'}
                </span>
              </div>
              <div className="mt-3 flex gap-3 text-sm">
                <button
                  onClick={() => { setEditingBay(bay); setShowModal(true); }}
                  className="text-primary-600 hover:text-primary-800"
                >
                  Изменить
                </button>
                <button
                  onClick={() => handleDelete(bay)}
                  className="text-red-600 hover:text-red-800"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <BayModal
          bay={editingBay}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['service-bays'] });
          }}
        />
      )}
    </div>
  );
}

function BayModal({
  bay,
  onClose,
  onSuccess,
}: {
  bay: ServiceBay | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(bay?.name || '');
  const [type, setType] = useState(bay?.type || '');
  const [isActive, setIsActive] = useState(bay?.isActive ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body: any = { name, type: type || undefined };
    if (bay) body.isActive = isActive;

    try {
      if (bay) {
        await apiFetch(`/service-bays/${bay.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/service-bays', { method: 'POST', body: JSON.stringify(body) });
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">
          {bay ? 'Редактировать пост' : 'Новый рабочий пост'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Название *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Подъёмник №1"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Тип</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Подъёмник / Яма / Бокс"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {bay && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Активен
            </label>
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
              {saving ? 'Сохранение...' : bay ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
