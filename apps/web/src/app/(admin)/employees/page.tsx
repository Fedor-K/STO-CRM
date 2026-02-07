'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface UserData {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: UserData[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const EMPLOYEE_ROLES: Record<string, string> = {
  MECHANIC: 'Механик',
  RECEPTIONIST: 'Приёмщик',
  MANAGER: 'Менеджер',
  OWNER: 'Владелец',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  RECEPTIONIST: 'bg-teal-100 text-teal-700',
  MECHANIC: 'bg-orange-100 text-orange-700',
};

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['employees', page, roleFilter, search],
    queryFn: () =>
      apiFetch(
        `/users?page=${page}&limit=20&sort=lastName&order=asc${roleFilter ? `&role=${roleFilter}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>
        <button
          onClick={() => { setEditUser(null); setShowModal(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить сотрудника
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Все сотрудники</option>
          {Object.entries(EMPLOYEE_ROLES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск по имени..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Сотрудников не найдено</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">ФИО</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Телефон</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Роль</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {user.lastName} {user.firstName}{user.middleName ? ` ${user.middleName}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{user.phone || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100'}`}>
                        {EMPLOYEE_ROLES[user.role] || user.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {user.isActive ? (
                        <span className="text-green-600">Активен</span>
                      ) : (
                        <span className="text-red-600">Заблокирован</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => { setEditUser(user); setShowModal(true); }}
                        className="mr-3 text-primary-600 hover:text-primary-800"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить ${user.lastName} ${user.firstName}?`)) {
                            deleteMutation.mutate(user.id);
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
        <EmployeeModal
          user={editUser}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['employees'] });
          }}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  user,
  onClose,
  onSuccess,
}: {
  user: UserData | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!user;
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [middleName, setMiddleName] = useState(user?.middleName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [role, setRole] = useState(user?.role || 'MECHANIC');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (isEdit) {
        await apiFetch(`/users/${user!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName,
            lastName,
            middleName: middleName || undefined,
            phone: phone || undefined,
            role,
            isActive,
          }),
        });
      } else {
        const randomId = Math.random().toString(36).slice(2, 14);
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            firstName,
            lastName,
            middleName: middleName || undefined,
            phone: phone || undefined,
            role,
            email: `${randomId}@employee.local`,
            password: 'Employee2026!',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">
          {isEdit ? 'Редактировать сотрудника' : 'Новый сотрудник'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Фамилия *</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Имя *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Отчество</label>
            <input
              type="text"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+79001234567"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Роль *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {Object.entries(EMPLOYEE_ROLES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Активен</label>
            </div>
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
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
