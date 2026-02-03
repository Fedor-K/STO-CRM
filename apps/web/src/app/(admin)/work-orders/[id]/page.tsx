'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface WorkOrderItem {
  id: string;
  type: 'LABOR' | 'PART';
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  totalPrice: string | number;
  normHours: string | number | null;
}

interface WorkLogEntry {
  id: string;
  description: string;
  hoursWorked: string | number;
  logDate: string;
  mechanic: { id: string; firstName: string; lastName: string };
}

interface WorkOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  diagnosticNotes: string | null;
  mileageAtIntake: number | null;
  fuelLevel: string | null;
  totalLabor: string | number;
  totalParts: string | number;
  totalAmount: string | number;
  createdAt: string;
  updatedAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  advisor: { id: string; firstName: string; lastName: string } | null;
  mechanic: { id: string; firstName: string; lastName: string } | null;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; vin: string | null };
  serviceBay: { id: string; name: string; type: string | null } | null;
  items: WorkOrderItem[];
  workLogs: WorkLogEntry[];
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Новый',
  DIAGNOSED: 'Диагностика',
  APPROVED: 'Согласован',
  IN_PROGRESS: 'В работе',
  PAUSED: 'Пауза',
  COMPLETED: 'Выполнен',
  INVOICED: 'Счёт выставлен',
  PAID: 'Оплачен',
  CLOSED: 'Закрыт',
  CANCELLED: 'Отменён',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  NEW: 'bg-gray-200 text-gray-700',
  DIAGNOSED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-purple-100 text-purple-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TRANSITIONS: Record<string, string[]> = {
  NEW: ['DIAGNOSED', 'CANCELLED'],
  DIAGNOSED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['INVOICED'],
  INVOICED: ['PAID'],
  PAID: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [tab, setTab] = useState<'items' | 'logs'>('items');
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItem, setEditItem] = useState<WorkOrderDetail['items'][0] | null>(null);
  const [showAddLog, setShowAddLog] = useState(false);

  const { data: wo, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ['work-order', id],
    queryFn: () => apiFetch(`/work-orders/${id}`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/work-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-order', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/work-orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => router.push('/work-orders'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/work-orders/${id}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-order', id] }),
  });

  if (isLoading) return <div className="py-8 text-center text-gray-500">Загрузка...</div>;
  if (!wo) return <div className="py-8 text-center text-gray-500">Заказ-наряд не найден</div>;

  const allowedTransitions = TRANSITIONS[wo.status] || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/work-orders" className="text-gray-400 hover:text-gray-600">
            &larr;
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {wo.orderNumber}
          </h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE_COLORS[wo.status] || 'bg-gray-100'}`}>
            {STATUS_LABELS[wo.status]}
          </span>
        </div>
        <div className="flex gap-2">
          {allowedTransitions.filter((s) => s !== 'CANCELLED').map((status) => (
            <button
              key={status}
              onClick={() => statusMutation.mutate(status)}
              disabled={statusMutation.isPending}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          {allowedTransitions.includes('CANCELLED') && (
            <button
              onClick={() => {
                if (confirm('Отменить заказ-наряд?')) statusMutation.mutate('CANCELLED');
              }}
              disabled={statusMutation.isPending}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Отменить
            </button>
          )}
          {wo.status === 'NEW' && (
            <button
              onClick={() => {
                if (confirm('Удалить заказ-наряд?')) deleteMutation.mutate();
              }}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Удалить
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
            <div className="font-medium text-gray-900">{wo.client.firstName} {wo.client.lastName}</div>
            {wo.client.phone && <div className="text-gray-500">{wo.client.phone}</div>}
            {wo.client.email && <div className="text-gray-500">{wo.client.email}</div>}
          </div>
          <h3 className="mt-4 text-sm font-semibold uppercase text-gray-500">Автомобиль</h3>
          <div className="mt-2 text-sm">
            <div className="font-medium text-gray-900">
              {wo.vehicle.make} {wo.vehicle.model} {wo.vehicle.year ? `(${wo.vehicle.year})` : ''}
            </div>
            {wo.vehicle.licensePlate && (
              <div className="font-mono text-gray-500">{wo.vehicle.licensePlate}</div>
            )}
            {wo.vehicle.vin && (
              <div className="text-xs text-gray-400">VIN: {wo.vehicle.vin}</div>
            )}
          </div>
        </div>

        {/* Work Order Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Информация</h3>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Механик</span>
              <span className="text-gray-900">{wo.mechanic ? `${wo.mechanic.firstName} ${wo.mechanic.lastName}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Приёмщик</span>
              <span className="text-gray-900">{wo.advisor ? `${wo.advisor.firstName} ${wo.advisor.lastName}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Пост</span>
              <span className="text-gray-900">{wo.serviceBay?.name || '—'}</span>
            </div>
            {wo.mileageAtIntake != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Пробег</span>
                <span className="text-gray-900">{wo.mileageAtIntake.toLocaleString('ru-RU')} км</span>
              </div>
            )}
            {wo.fuelLevel && (
              <div className="flex justify-between">
                <span className="text-gray-500">Топливо</span>
                <span className="text-gray-900">{wo.fuelLevel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Создан</span>
              <span className="text-gray-900">{formatDate(wo.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Итого</h3>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Работы</span>
              <span className="text-gray-900">{formatMoney(wo.totalLabor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Запчасти</span>
              <span className="text-gray-900">{formatMoney(wo.totalParts)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <span className="font-semibold text-gray-700">Общая сумма</span>
              <span className="text-lg font-bold text-gray-900">{formatMoney(wo.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Complaints / Diagnostics */}
      {(wo.clientComplaints || wo.diagnosticNotes) && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {wo.clientComplaints && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase text-gray-500">Жалобы клиента</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{wo.clientComplaints}</p>
            </div>
          )}
          {wo.diagnosticNotes && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase text-gray-500">Диагностика</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{wo.diagnosticNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs: Items / Logs */}
      <div className="mt-6">
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab('items')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'items' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Позиции ({wo.items.length})
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'logs' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Логи работ ({wo.workLogs.length})
          </button>
        </div>

        {tab === 'items' && (
          <div className="mt-4">
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setShowAddItem(true)}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                Добавить позицию
              </button>
            </div>

            {wo.items.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">Нет позиций</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Тип</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Описание</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Кол-во</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Цена</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Сумма</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {wo.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.type === 'LABOR' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.type === 'LABOR' ? 'Работа' : 'Запчасть'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{Number(item.quantity)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{formatMoney(item.unitPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{formatMoney(item.totalPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => setEditItem(item)}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Удалить позицию?')) deleteItemMutation.mutate(item.id);
                            }}
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
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="mt-4">
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setShowAddLog(true)}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                Добавить лог
              </button>
            </div>

            {wo.workLogs.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">Нет записей</div>
            ) : (
              <div className="space-y-3">
                {wo.workLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {log.mechanic.firstName} {log.mechanic.lastName}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(log.logDate)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{log.description}</p>
                    <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {Number(log.hoursWorked)} ч.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddItem && (
        <AddItemModal
          workOrderId={id}
          onClose={() => setShowAddItem(false)}
          onSuccess={() => {
            setShowAddItem(false);
            queryClient.invalidateQueries({ queryKey: ['work-order', id] });
          }}
        />
      )}
      {editItem && (
        <EditItemModal
          workOrderId={id}
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={() => {
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['work-order', id] });
          }}
        />
      )}
      {showAddLog && (
        <AddWorkLogModal
          workOrderId={id}
          onClose={() => setShowAddLog(false)}
          onSuccess={() => {
            setShowAddLog(false);
            queryClient.invalidateQueries({ queryKey: ['work-order', id] });
          }}
        />
      )}
    </div>
  );
}

function AddItemModal({
  workOrderId,
  onClose,
  onSuccess,
}: {
  workOrderId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<'LABOR' | 'PART'>('LABOR');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [normHours, setNormHours] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!description || !unitPrice) {
      setError('Заполните описание и цену');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/work-orders/${workOrderId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          description,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          normHours: normHours ? Number(normHours) : undefined,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Добавить позицию</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Тип</label>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={type === 'LABOR'} onChange={() => setType('LABOR')} />
                Работа
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={type === 'PART'} onChange={() => setType('PART')} />
                Запчасть
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Описание *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Кол-во</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.01"
                step="0.01"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Цена *</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            {type === 'LABOR' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Норм-ч.</label>
                <input
                  type="number"
                  value={normHours}
                  onChange={(e) => setNormHours(e.target.value)}
                  min="0"
                  step="any"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({
  workOrderId,
  item,
  onClose,
  onSuccess,
}: {
  workOrderId: string;
  item: WorkOrderDetail['items'][0];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [quantity, setQuantity] = useState(String(Number(item.quantity)));
  const [unitPrice, setUnitPrice] = useState(String(Number(item.unitPrice)));
  const [normHours, setNormHours] = useState(item.normHours ? String(Number(item.normHours)) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!description || !unitPrice) {
      setError('Заполните описание и цену');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/work-orders/${workOrderId}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          normHours: normHours ? Number(normHours) : undefined,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Редактировать позицию</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Тип: {item.type === 'LABOR' ? 'Работа' : 'Запчасть'}
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Описание *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Кол-во</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.01"
                step="0.01"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Цена *</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            {item.type === 'LABOR' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Норм-ч.</label>
                <input
                  type="number"
                  value={normHours}
                  onChange={(e) => setNormHours(e.target.value)}
                  min="0"
                  step="any"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddWorkLogModal({
  workOrderId,
  onClose,
  onSuccess,
}: {
  workOrderId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [description, setDescription] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!description || !hoursWorked) {
      setError('Заполните описание и часы');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/work-orders/${workOrderId}/work-logs`, {
        method: 'POST',
        body: JSON.stringify({
          description,
          hoursWorked: Number(hoursWorked),
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Добавить лог работы</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Описание *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Что было сделано..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Часы работы *</label>
            <input
              type="number"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
              min="0.1"
              step="any"
              placeholder="Например: 1.5"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
