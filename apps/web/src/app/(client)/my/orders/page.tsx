'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface WorkOrder {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  totalAmount: string | number;
  createdAt: string;
  vehicle: { id: string; make: string; model: string; licensePlate: string | null };
  mechanic: { id: string; firstName: string; lastName: string } | null;
  serviceBay: { id: string; name: string } | null;
  _count: { items: number };
}

interface PaginatedResponse {
  data: WorkOrder[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Принят',
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
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-purple-100 text-purple-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const STATUS_STEPS = ['NEW', 'DIAGNOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CLOSED'];

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export default function MyOrdersPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['client-orders', page],
    queryFn: () => apiFetch(`/work-orders?page=${page}&limit=20&sort=createdAt&order=desc`),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">История ремонтов</h1>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">У вас пока нет заказ-нарядов</div>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {data.data.map((wo) => {
              const currentStepIndex = STATUS_STEPS.indexOf(wo.status);
              const isCancelled = wo.status === 'CANCELLED';

              return (
                <div key={wo.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-primary-600">
                        {wo.orderNumber}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[wo.status] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[wo.status]}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{formatDate(wo.createdAt)}</span>
                  </div>

                  {/* Vehicle info */}
                  <div className="mt-2 text-sm text-gray-700">
                    {wo.vehicle.make} {wo.vehicle.model}
                    {wo.vehicle.licensePlate ? ` • ${wo.vehicle.licensePlate}` : ''}
                  </div>

                  {wo.clientComplaints && (
                    <p className="mt-1 text-sm text-gray-500">{wo.clientComplaints}</p>
                  )}

                  {/* Progress steps */}
                  {!isCancelled && (
                    <div className="mt-4">
                      <div className="flex items-center">
                        {STATUS_STEPS.map((step, index) => {
                          const isCompleted = index <= currentStepIndex;
                          const isCurrent = index === currentStepIndex;
                          return (
                            <div key={step} className="flex flex-1 items-center">
                              <div className="flex flex-col items-center">
                                <div
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                                    isCompleted
                                      ? 'bg-primary-600 text-white'
                                      : 'bg-gray-200 text-gray-400'
                                  } ${isCurrent ? 'ring-2 ring-primary-300' : ''}`}
                                >
                                  {isCompleted && index < currentStepIndex ? (
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    index + 1
                                  )}
                                </div>
                                <span className={`mt-1 text-[10px] ${isCurrent ? 'font-semibold text-primary-600' : 'text-gray-400'}`}>
                                  {STATUS_LABELS[step]}
                                </span>
                              </div>
                              {index < STATUS_STEPS.length - 1 && (
                                <div className={`mx-1 h-0.5 flex-1 ${index < currentStepIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                    <div className="text-sm text-gray-500">
                      {wo._count.items} позиций
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatMoney(wo.totalAmount)}
                    </div>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
