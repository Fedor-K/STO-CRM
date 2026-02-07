'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  INSPECTION_GROUPS,
  SLIDER_CONFIG,
  createEmptyChecklist,
  type InspectionChecklist,
} from '@sto-crm/shared';

interface WorkOrderItem {
  id: string;
  type: 'LABOR' | 'PART';
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  totalPrice: string | number;
  normHours: string | number | null;
  vatRate: string | null;
  vatAmount: string | number | null;
  recommended: boolean;
  approvedByClient: boolean | null;
}

interface WorkLogEntry {
  id: string;
  description: string;
  hoursWorked: string | number;
  logDate: string;
  mechanic: { id: string; firstName: string; lastName: string };
}

interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string } | null;
}

interface WorkOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  diagnosticNotes: string | null;
  inspectionChecklist: InspectionChecklist | null;
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
  vehicle: { id: string; make: string; model: string; licensePlate: string | null; year: number | null; vin: string | null; mileage: number | null };
  items: WorkOrderItem[];
  workLogs: WorkLogEntry[];
  activities: ActivityEntry[];
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

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  CREATED: 'bg-green-500',
  STATUS_CHANGE: 'bg-blue-500',
  ITEM_ADDED: 'bg-indigo-500',
  ITEM_UPDATED: 'bg-amber-500',
  ITEM_DELETED: 'bg-red-500',
  UPDATED: 'bg-gray-400',
  WORK_LOG: 'bg-yellow-500',
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

  const [tab, setTab] = useState<'labor' | 'parts' | 'logs' | 'activity'>('labor');
  const [showAddItem, setShowAddItem] = useState(false);
  const [editItem, setEditItem] = useState<WorkOrderDetail['items'][0] | null>(null);

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

  const updateFieldMutation = useMutation({
    mutationFn: (data: Record<string, string | null>) =>
      apiFetch(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-order', id] }),
  });

  if (isLoading) return <div className="py-8 text-center text-gray-500">Загрузка...</div>;
  if (!wo) return <div className="py-8 text-center text-gray-500">Заказ-наряд не найден</div>;

  const allowedTransitions = TRANSITIONS[wo.status] || [];
  const laborItems = wo.items.filter((i) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true));
  const allLogsCompleted = wo.workLogs.length >= laborItems.length;
  const needsLogsForCompleted = wo.status === 'IN_PROGRESS' && !allLogsCompleted;
  const isLocked = wo.status === 'CLOSED' || wo.status === 'CANCELLED';

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
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
          {allowedTransitions.filter((s) => s !== 'CANCELLED').map((status) => {
            const disabled = statusMutation.isPending || (status === 'COMPLETED' && needsLogsForCompleted);
            return (
              <button
                key={status}
                onClick={() => statusMutation.mutate(status)}
                disabled={disabled}
                title={status === 'COMPLETED' && needsLogsForCompleted ? 'Отметьте все работы в Логах работ' : undefined}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {STATUS_LABELS[status]}
              </button>
            );
          })}
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
          {needsLogsForCompleted && (
            <p className="text-xs text-amber-600">
              <button type="button" onClick={() => setTab('logs')} className="underline hover:text-amber-700">
                Отметьте все работы как выполненные
              </button>
              {' '}перед переводом в &laquo;Готов&raquo;
            </p>
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
            {wo.vehicle.mileage != null && (
              <div className="text-xs text-gray-500">Пробег: {wo.vehicle.mileage.toLocaleString('ru-RU')} км</div>
            )}
          </div>
        </div>

        {/* Work Order Info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase text-gray-500">Информация</h3>
          <div className="mt-2 space-y-2 text-sm">
            <AssignField
              label="Механик"
              currentValue={wo.mechanic ? `${wo.mechanic.firstName} ${wo.mechanic.lastName}` : null}
              fetchUrl="/users?limit=100&sort=firstName&order=asc&role=MECHANIC"
              onAssign={(userId) => updateFieldMutation.mutate({ mechanicId: userId || null })}
              disabled={isLocked}
            />
            <AssignField
              label="Приёмщик"
              currentValue={wo.advisor ? `${wo.advisor.firstName} ${wo.advisor.lastName}` : null}
              fetchUrl="/users?limit=100&sort=firstName&order=asc&role=RECEPTIONIST"
              onAssign={(userId) => updateFieldMutation.mutate({ advisorId: userId || null })}
              disabled={isLocked}
            />
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

      {/* Complaints */}
      {wo.clientComplaints && (
        <div className="mt-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold uppercase text-gray-500">Жалобы клиента</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{wo.clientComplaints}</p>
          </div>
        </div>
      )}

      {/* Inspection Checklist */}
      {wo.inspectionChecklist && (
        <div className="mt-6">
          <InspectionChecklistReadonly checklist={wo.inspectionChecklist} />
        </div>
      )}

      {/* Tabs: Items / Logs */}
      <div className="mt-6">
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab('labor')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'labor' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Работы ({wo.items.filter((i) => i.type === 'LABOR').length})
          </button>
          <button
            onClick={() => setTab('parts')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'parts' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Материалы ({wo.items.filter((i) => i.type === 'PART').length})
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'logs' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Логи работ ({wo.workLogs.length}/{wo.items.filter((i) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true)).length})
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'activity' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Хронология ({wo.activities.length})
          </button>
        </div>

        {(tab === 'labor' || tab === 'parts') && (() => {
          const filterType = tab === 'labor' ? 'LABOR' : 'PART';
          const filtered = wo.items.filter((i) => i.type === filterType);
          return (
          <div className="mt-4">
            {!isLocked && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => setShowAddItem(true)}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                Добавить позицию
              </button>
            </div>
            )}

            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                {tab === 'labor' ? 'Нет работ' : 'Нет материалов'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Описание</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Кол-во</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Цена</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Сумма</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">НДС</th>
                      {!isLocked && <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <span>{item.description}</span>
                          {item.recommended && (
                            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.approvedByClient === true
                                ? 'bg-green-100 text-green-700'
                                : item.approvedByClient === false
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                            }`}>
                              {item.approvedByClient === true
                                ? 'Одобрено'
                                : item.approvedByClient === false
                                  ? 'Отклонено'
                                  : 'Рекомендация'}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{Number(item.quantity)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">{formatMoney(item.unitPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{formatMoney(item.totalPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                          {item.vatRate ? (
                            <span title={item.vatAmount ? formatMoney(item.vatAmount) : undefined}>
                              {item.vatRate}
                            </span>
                          ) : '—'}
                        </td>
                        {!isLocked && (
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
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })()}

        {tab === 'logs' && (
          <WorkLogsTab
            workOrder={wo}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ['work-order', id] })}
          />
        )}

        {tab === 'activity' && (
          <div className="mt-4">
            {wo.activities.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">Нет записей</div>
            ) : (
              <div className="relative ml-4">
                {/* Vertical line */}
                <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-4">
                  {wo.activities.map((act) => {
                    const dotColor = ACTIVITY_DOT_COLORS[act.type] || 'bg-gray-400';
                    const time = new Date(act.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <div key={act.id} className="relative flex items-start gap-3 pl-5">
                        <div className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${dotColor} ring-2 ring-white`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">{act.description}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            <span>{time}</span>
                            {act.user && (
                              <span>{act.user.firstName} {act.user.lastName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
    </div>
  );
}

function WorkLogsTab({
  workOrder,
  onComplete,
}: {
  workOrder: WorkOrderDetail;
  onComplete: () => void;
}) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const laborItems = workOrder.items.filter(
    (i) => i.type === 'LABOR' && (!i.recommended || i.approvedByClient === true),
  );

  // Match work logs to items by description+index (handles duplicates)
  const completedItemIds = new Set<string>();
  const logByItemId = new Map<string, WorkLogEntry>();
  const usedLogIds = new Set<string>();

  for (const item of laborItems) {
    const log = workOrder.workLogs.find(
      (l) => l.description === item.description && !usedLogIds.has(l.id),
    );
    if (log) {
      completedItemIds.add(item.id);
      logByItemId.set(item.id, log);
      usedLogIds.add(log.id);
    }
  }

  async function handleToggle(item: WorkOrderItem) {
    if (completedItemIds.has(item.id)) return;
    setCompleting(item.id);
    setError('');
    try {
      await apiFetch(`/work-orders/${workOrder.id}/work-logs`, {
        method: 'POST',
        body: JSON.stringify({
          description: item.description,
          hoursWorked: item.normHours ? Number(item.normHours) : 1,
        }),
      });
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Ошибка при сохранении');
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {laborItems.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Нет согласованных работ</div>
      ) : (
        <div className="space-y-2">
          {laborItems.map((item) => {
            const done = completedItemIds.has(item.id);
            const isLoading = completing === item.id;
            const log = logByItemId.get(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-lg border p-4 ${
                  done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                }`}
              >
                <button
                  onClick={() => handleToggle(item)}
                  disabled={done || isLoading}
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    done
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-300 hover:border-primary-500'
                  } disabled:cursor-default`}
                >
                  {done && (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isLoading && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${done ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                    {item.description}
                  </p>
                  <span className="text-xs text-gray-500">
                    {Number(item.quantity)} x {formatMoney(item.unitPrice)}
                    {item.normHours ? ` \u00B7 ${Number(item.normHours)} н/ч` : ''}
                  </span>
                </div>
                {done && log && (
                  <div className="text-right text-xs text-gray-500">
                    <div>{log.mechanic.firstName} {log.mechanic.lastName}</div>
                    <div>{formatDate(log.logDate)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

function AssignField({
  label,
  currentValue,
  fetchUrl,
  fieldType = 'user',
  onAssign,
  disabled = false,
}: {
  label: string;
  currentValue: string | null;
  fetchUrl: string;
  fieldType?: 'user' | 'bay';
  onAssign: (id: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { data } = useQuery<{ data: any[] }>({
    queryKey: ['assign-field', fetchUrl],
    queryFn: () => apiFetch(fetchUrl),
    enabled: editing,
  });

  if (disabled) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-900">{currentValue || '—'}</span>
      </div>
    );
  }

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
              {fieldType === 'bay' ? item.name : `${item.firstName} ${item.lastName}`}
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

function InspectionChecklistReadonly({ checklist }: { checklist: InspectionChecklist }) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const merged = { ...createEmptyChecklist(), ...checklist };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold uppercase text-gray-500">Лист осмотра</h3>
      <div className="mt-3 space-y-2">
        {INSPECTION_GROUPS.map((group) => {
          const expanded = expandedGroups[group.key] ?? false;
          const checkedCount = group.items.filter((i) => merged[i.key]?.checked).length;
          return (
            <div key={group.key} className="rounded-lg border border-gray-100">
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-700">{group.label}</span>
                <span className="text-xs text-gray-400">
                  {checkedCount}/{group.items.length} {expanded ? '\u25B2' : '\u25BC'}
                </span>
              </button>
              {expanded && (
                <div className="border-t border-gray-50 px-3 py-2 space-y-1">
                  {group.items.map((item) => {
                    const entry = merged[item.key];
                    return (
                      <div key={item.key} className="flex items-start gap-2 py-0.5">
                        <span className={`mt-0.5 inline-block h-4 w-4 flex-shrink-0 rounded text-center text-xs leading-4 ${entry?.checked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {entry?.checked ? '\u2713' : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${entry?.checked ? 'text-gray-900' : 'text-gray-500'}`}>{item.label}</span>
                          {SLIDER_CONFIG[item.key] && entry?.level != null && (() => {
                            const cfg = SLIDER_CONFIG[item.key];
                            const pct = ((entry.level - cfg.min) / (cfg.max - cfg.min)) * 100;
                            const barColor = cfg.label === 'Влага'
                              ? (entry.level < 2 ? 'bg-green-500' : entry.level < 3.5 ? 'bg-yellow-500' : 'bg-red-500')
                              : (pct > 60 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500');
                            return (
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 w-10">{cfg.label}</span>
                                <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                                  <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-10 text-right text-[11px] font-medium text-gray-600">{entry.level}{cfg.unit}</span>
                              </div>
                            );
                          })()}
                          {entry?.note && (
                            <p className="text-xs text-gray-500 italic">{entry.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
