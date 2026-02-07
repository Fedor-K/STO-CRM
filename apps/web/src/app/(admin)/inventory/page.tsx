'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// ===== Types =====

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isActive: boolean;
}

interface WarehouseBreakdown {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  reserved: number;
}

interface StockItem {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  manufacturer: string | null;
  oemNumber: string | null;
  unit: string;
  costPrice: string;
  sellPrice: string;
  minStock: number;
  code1C: string | null;
  totalQuantity: number;
  totalReserved: number;
  available: number;
  warehouses: WarehouseBreakdown[];
}

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

interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function formatPrice(price: string | number): string {
  return Number(price).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}

// ===== Main Page =====

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'parts'>('stock');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Склад</h1>
      </div>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('stock')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === 'stock'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Остатки
        </button>
        <button
          onClick={() => setTab('parts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === 'parts'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Каталог запчастей
        </button>
      </div>

      <div className="mt-4">
        {tab === 'stock' ? <StockTab /> : <PartsTab />}
      </div>
    </div>
  );
}

// ===== Stock Tab =====

function StockTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch('/inventory/warehouses'),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<StockItem>>({
    queryKey: ['stock-summary', page, search, warehouseId],
    queryFn: () =>
      apiFetch(
        `/inventory/stock/summary?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`,
      ),
  });

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Поиск по названию, артикулу, бренду..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {warehouses && warehouses.length > 0 && (
          <select
            value={warehouseId}
            onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Все склады</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="mt-8 text-center text-gray-500">Загрузка...</div>
      ) : !data?.data.length ? (
        <div className="mt-8 text-center text-gray-500">Нет данных об остатках</div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Название</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Артикул</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Производитель</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Остаток</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Резерв</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Свободно</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Ед.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Цена</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.data.map((item) => (
                  <>
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        {item.brand && (
                          <div className="text-xs text-gray-500">{item.brand}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {item.sku || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {item.manufacturer || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right font-medium">
                        <span className={item.totalQuantity <= item.minStock ? 'text-red-600' : 'text-gray-900'}>
                          {item.totalQuantity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-orange-600">
                        {item.totalReserved > 0 ? item.totalReserved : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right font-medium text-green-700">
                        {item.available}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {item.unit}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-right text-gray-900 font-medium">
                        {formatPrice(item.sellPrice)}
                      </td>
                    </tr>
                    {expandedId === item.id && item.warehouses.length > 0 && (
                      <tr key={`${item.id}-detail`}>
                        <td colSpan={8} className="bg-gray-50 px-8 py-2">
                          <div className="text-xs text-gray-500 mb-1 font-medium">Разбивка по складам:</div>
                          <div className="flex flex-wrap gap-4">
                            {item.warehouses.map((wh) => (
                              <div key={wh.warehouseId} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-600">{wh.warehouseName}:</span>
                                <span className="font-medium">{wh.quantity}</span>
                                {wh.reserved > 0 && (
                                  <span className="text-orange-600 text-xs">(резерв: {wh.reserved})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
    </>
  );
}

// ===== Parts Tab (catalog CRUD) =====

function PartsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Part>>({
    queryKey: ['parts', page, search],
    queryFn: () => apiFetch(`/parts?page=${page}&limit=20&sort=name&order=asc${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/parts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parts'] }),
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="Поиск по названию, артикулу, бренду..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          onClick={() => { setEditingPart(null); setShowModal(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Добавить запчасть
        </button>
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
                      {part.brand && <div className="text-xs text-gray-500">{part.brand}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{part.sku || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatPrice(part.costPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 font-medium">{formatPrice(part.sellPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={part.currentStock <= part.minStock ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {part.currentStock}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{part.unit}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        part.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {part.isActive ? 'Активна' : 'Неактивна'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <button onClick={() => { setEditingPart(part); setShowModal(true); }} className="text-primary-600 hover:text-primary-800">
                        Изменить
                      </button>
                      <button
                        onClick={() => { if (confirm(`Удалить запчасть «${part.name}»?`)) deleteMutation.mutate(part.id); }}
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
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">Назад</button>
                <button onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))} disabled={page === data.meta.totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">Вперёд</button>
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <PartModal
          part={editingPart}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); queryClient.invalidateQueries({ queryKey: ['parts'] }); }}
        />
      )}
    </>
  );
}

// ===== Part Edit Modal =====

function PartModal({ part, onClose, onSuccess }: { part: Part | null; onClose: () => void; onSuccess: () => void }) {
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
    if (part) body.isActive = isActive;

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
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">{part ? 'Редактировать запчасть' : 'Новая запчасть'}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Название *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Артикул (SKU)</label>
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Бренд</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">OEM номер</label>
            <input type="text" value={oemNumber} onChange={(e) => setOemNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Себестоимость (руб.) *</label>
              <input type="number" step="0.01" min="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Цена продажи (руб.) *</label>
              <input type="number" step="0.01" min="0" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Остаток</label>
              <input type="number" min="0" value={currentStock} onChange={(e) => setCurrentStock(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Мин. остаток</label>
              <input type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ед. изм.</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
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
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                Активна
              </label>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Отмена</button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : part ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
