'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface WorkOrderCard {
  id: string;
  orderNumber: string;
  status: string;
  clientComplaints: string | null;
  totalAmount: string | number;
  createdAt: string;
  client: { id: string; firstName: string; lastName: string; phone: string | null };
  vehicle: { id: string; make: string; model: string; licensePlate: string | null };
  serviceBay: { id: string; name: string } | null;
  _count: { items: number };
}

interface PaginatedResponse {
  data: WorkOrderCard[];
  meta: { total: number; page: number; limit: number; totalPages: number };
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
};

function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!num) return '0 ₽';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function MyWorkOrdersPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['my-work-orders', page],
    queryFn: () => apiFetch(`/work-orders/my?page=${page}&limit=20`),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Мои заказ-наряды</h1>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">У вас нет активных заказ-нарядов</div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((wo) => (
              <Link
                key={wo.id}
                href={`/work-orders/${wo.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-primary-600">{wo.orderNumber}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_COLORS[wo.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[wo.status] || wo.status}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium text-gray-900">
                  {wo.client.firstName} {wo.client.lastName}
                </div>
                <div className="text-xs text-gray-500">
                  {wo.vehicle.make} {wo.vehicle.model}
                  {wo.vehicle.licensePlate ? ` • ${wo.vehicle.licensePlate}` : ''}
                </div>
                {wo.serviceBay && (
                  <div className="mt-1 text-xs text-gray-500">Пост: {wo.serviceBay.name}</div>
                )}
                {wo.clientComplaints && (
                  <div className="mt-1 line-clamp-2 text-xs text-gray-400">{wo.clientComplaints}</div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">{formatMoney(wo.totalAmount)}</span>
                  <span className="text-xs text-gray-400">{wo._count.items} поз.</span>
                </div>
              </Link>
            ))}
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
