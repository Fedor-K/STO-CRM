'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

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
}

interface PaginatedResponse {
  data: ClientData[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<ClientData | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['clients', page, search],
    queryFn: () =>
      apiFetch(`/users?page=${page}&limit=20&sort=createdAt&order=desc&role=CLIENT${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const { data: vehicles } = useQuery<{ data: VehicleData[] }>({
    queryKey: ['client-vehicles', expandedClient],
    queryFn: () => apiFetch(`/vehicles?limit=50&clientId=${expandedClient}`),
    enabled: !!expandedClient,
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
          placeholder="Поиск по имени, телефону, email..."
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
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Клиент</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Телефон</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Дата регистрации</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
                        className="text-left"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {client.firstName} {client.lastName}
                        </div>
                        <div className="text-xs text-primary-600 hover:underline">
                          {expandedClient === client.id ? 'Скрыть авто' : 'Показать авто'}
                        </div>
                      </button>
                      {expandedClient === client.id && (
                        <div className="mt-2 space-y-1">
                          {vehicles?.data?.length ? (
                            vehicles.data.map((v) => (
                              <div key={v.id} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">
                                {v.make} {v.model}
                                {v.year ? ` (${v.year})` : ''}
                                {v.licensePlate ? ` — ${v.licensePlate}` : ''}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-gray-400">Нет автомобилей</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{client.phone || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{client.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(client.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => { setEditClient(client); setShowModal(true); }}
                        className="mr-3 text-primary-600 hover:text-primary-800"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить клиента ${client.firstName} ${client.lastName}?`)) {
                            deleteMutation.mutate(client.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-800"
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
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
            email,
            phone: phone || undefined,
          }),
        });
      } else {
        const finalEmail = email || `${phone.replace(/\D/g, '')}@client.local`;
        await apiFetch('/users', {
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email {isEdit ? '' : '(необязательно)'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isEdit ? '' : 'Если не указан — сгенерируется автоматически'}
              className={inputCls}
              required={isEdit}
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
