'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Part {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  oemNumber: string | null;
  costPrice: string;
  sellPrice: string;
  currentStock: number;
  minStock: number;
  unit: string;
  isActive: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  data: Part[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function formatPrice(price: string | number): string {
  return Number(price).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['parts', page, search],
    queryFn: () => apiFetch(`/parts?page=${page}&limit=20&sort=name&order=asc${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/parts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parts'] }),
  });

  function handleEdit(part: Part) {
    setEditingPart(part);
    setShowModal(true);
  }

  function handleCreate() {
    setEditingPart(null);
    setShowModal(true);
  }

  function handleDelete(part: Part) {
    if (confirm(`Удалить запчасть «${part.name}»?`)) {
      deleteMutation.mutate(part.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Склад запчастей</h1>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить запчасть
        </button>
      </div>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Поиск по названию, артикулу, бренду..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Запчасти не найдены</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Название</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Артикул</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Себестоимость</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Цена продажи</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Остаток</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Ед.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Статус</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((part) => (
                  <tr key={part.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{part.name}</div>
                      {part.brand && (
                        <div className="text-xs text-gray-500">{part.brand}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {part.sku || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatPrice(part.costPrice)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 font-medium">
                      {formatPrice(part.sellPrice)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={part.currentStock <= part.minStock ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {part.currentStock}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {part.unit}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          part.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {part.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button
                        onClick={() => handleEdit(part)}
                        className="text-primary-600 hover:text-primary-800"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(part)}
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
        <PartModal
          part={editingPart}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['parts'] });
          }}
        />
      )}
    </div>
  );
}

function PartModal({
  part,
  onClose,
  onSuccess,
}: {
  part: Part | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(part?.name || '');
  const [sku, setSku] = useState(part?.sku || '');
  const [brand, setBrand] = useState(part?.brand || '');
  const [oemNumber, setOemNumber] = useState(part?.oemNumber || '');
  const [costPrice, setCostPrice] = useState(part ? String(part.costPrice) : '');
  const [sellPrice, setSellPrice] = useState(part ? String(part.sellPrice) : '');
  const [currentStock, setCurrentStock] = useState(String(part?.currentStock ?? 0));
  const [minStock, setMinStock] = useState(String(part?.minStock ?? 0));
  const [unit, setUnit] = useState(part?.unit || 'шт');
  const [isActive, setIsActive] = useState(part?.isActive ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const body: any = {
      name,
      sku: sku || undefined,
      brand: brand || undefined,
      oemNumber: oemNumber || undefined,
      costPrice: Number(costPrice),
      sellPrice: Number(sellPrice),
      currentStock: Number(currentStock),
      minStock: Number(minStock),
      unit,
    };

    if (part) {
      body.isActive = isActive;
    }

    try {
      if (part) {
        await apiFetch(`/parts/${part.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/parts', { method: 'POST', body: JSON.stringify(body) });
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
          {part ? 'Редактировать запчасть' : 'Новая запчасть'}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Артикул (SKU)</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Бренд</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">OEM номер</label>
            <input
              type="text"
              value={oemNumber}
              onChange={(e) => setOemNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Себестоимость (руб.) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Цена продажи (руб.) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Остаток</label>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Мин. остаток</label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ед. изм.</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="шт">шт</option>
                <option value="л">л</option>
                <option value="кг">кг</option>
                <option value="м">м</option>
                <option value="компл">компл</option>
              </select>
            </div>
          </div>

          {part && (
            <div>
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
              {saving ? 'Сохранение...' : part ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
