/**
 * Этап 2: Импорт запчастей — объединение 3 источников
 *
 * Источники:
 *   1. export_nomenclature.json (679K) — названия, артикулы, коды
 *   2. export_prices.json (50K)        — costPrice / sellPrice по кодам
 *   3. order_details.json (25K заказов) — goods из заказов (медианная цена)
 *
 * Группы:
 *   A) В номенклатуре И в заказах (14,784) — costPrice/sellPrice из prices, sku из nomenclature
 *   B) Только в заказах (4)                — costPrice=медиана из orders, sellPrice=costPrice
 *   C) Только в номенклатуре с ценой (2,624) — costPrice/sellPrice из prices, sku из nomenclature
 *
 * Итого: ~17,412 уникальных запчастей
 *
 * Запуск: cd /Users/khatlamadzieva/STO-CRM && ADMIN_PASSWORD=xxx npx tsx scripts/import-parts.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Конфигурация ──────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'https://crm.onemotors.ru/api/v1';
const TENANT_SLUG = process.env.TENANT_SLUG || 'onemotors';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onemotors.ru';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const REQUEST_DELAY_MS = 20;
const LOG_EVERY = 500;

const NOMENCLATURE_PATH = '/tmp/tipo-sto/export_nomenclature.json';
const PRICES_PATH = '/tmp/tipo-sto/export_prices.json';
const ORDER_DETAILS_PATH = '/tmp/tipo-sto/order_details.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-parts-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface NomenclatureItem {
  code: string;
  name: string;
  article: string;
  full_name: string;
}

interface PriceItem {
  code: string;
  name: string;
  price_type: string;
  price: number;
}

interface OrderDetail {
  works: { name: string; qty: number; price: number; sum: number }[];
  goods: { name: string; qty: number; price: number; sum: number }[];
}

interface PartRecord {
  name: string;
  sku: string;
  costPrice: number;
  sellPrice: number;
  source: 'both' | 'orders_only' | 'nomenclature_only';
}

// ─── Утилиты ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let errorLogStream: fs.WriteStream;

function logError(context: string, error: unknown): void {
  const msg = `[${new Date().toISOString()}] ${context}: ${error instanceof Error ? error.message : String(error)}\n`;
  errorLogStream.write(msg);
}

// ─── API-клиент ────────────────────────────────────────────────────────────────

let accessToken = '';

async function apiRequest(method: string, endpoint: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

async function login(): Promise<void> {
  console.log(`Авторизация: ${ADMIN_EMAIL} @ ${TENANT_SLUG}...`);
  const { ok, status, data } = await apiRequest('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });
  if (!ok) throw new Error(`Ошибка авторизации (${status}): ${JSON.stringify(data)}`);
  accessToken = data.accessToken;
  console.log('Авторизация успешна.');
}

async function apiRequestWithRetry(method: string, endpoint: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const result = await apiRequest(method, endpoint, body);
  if (result.status === 401) {
    await login();
    return apiRequest(method, endpoint, body);
  }
  return result;
}

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-parts.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import parts (3-source merge) started at ${new Date().toISOString()} ===\n`);

  // ─── Шаг 1: Загрузить номенклатуру ─────────────────────────────────────────
  console.log('Загрузка export_nomenclature.json (679K записей, ~130MB)...');
  const nomenclature: NomenclatureItem[] = JSON.parse(fs.readFileSync(NOMENCLATURE_PATH, 'utf-8'));
  console.log(`  Записей номенклатуры: ${nomenclature.length}`);

  // Строим map: code → {name, article} и name(lower) → [{code, article}]
  const nomByCode = new Map<string, { name: string; article: string }>();
  const nomByName = new Map<string, { code: string; article: string }[]>();

  for (const item of nomenclature) {
    const name = normalizeName(item.name);
    if (!name) continue;

    nomByCode.set(item.code, { name, article: item.article?.trim() || '' });

    const key = name.toLowerCase();
    let list = nomByName.get(key);
    if (!list) {
      list = [];
      nomByName.set(key, list);
    }
    list.push({ code: item.code, article: item.article?.trim() || '' });
  }
  console.log(`  Уникальных кодов: ${nomByCode.size}`);
  console.log(`  Уникальных имён: ${nomByName.size}`);

  // ─── Шаг 2: Загрузить цены ─────────────────────────────────────────────────
  console.log('Загрузка export_prices.json...');
  const pricesRaw: PriceItem[] = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf-8'));
  console.log(`  Записей цен: ${pricesRaw.length}`);

  // Строим map: code → {costPrice, sellPrice}
  // Для дубликатов (несколько записей одного типа) берём максимальную цену
  const priceByCode = new Map<string, { costPrice: number; sellPrice: number }>();

  for (const p of pricesRaw) {
    let entry = priceByCode.get(p.code);
    if (!entry) {
      entry = { costPrice: 0, sellPrice: 0 };
      priceByCode.set(p.code, entry);
    }

    if (p.price_type === 'Основной тип цен закупки') {
      entry.costPrice = Math.max(entry.costPrice, p.price);
    } else if (p.price_type === 'Основной тип цен продажи') {
      entry.sellPrice = Math.max(entry.sellPrice, p.price);
    }
    // Игнорируем "Оптовая цена" и "Цена закупки плюс 10 %"
  }

  // Заполняем пустые: если есть только одна цена, используем её для обоих
  for (const [, entry] of priceByCode) {
    if (entry.costPrice > 0 && entry.sellPrice === 0) {
      entry.sellPrice = entry.costPrice;
    } else if (entry.sellPrice > 0 && entry.costPrice === 0) {
      entry.costPrice = entry.sellPrice;
    }
  }

  console.log(`  Уникальных кодов с ценами: ${priceByCode.size}`);

  // ─── Шаг 3: Загрузить goods из заказов ──────────────────────────────────────
  console.log('Загрузка order_details.json...');
  const orderDetails: Record<string, OrderDetail> = JSON.parse(fs.readFileSync(ORDER_DETAILS_PATH, 'utf-8'));
  console.log(`  Заказов: ${Object.keys(orderDetails).length}`);

  // Собираем уникальные goods с их ценами
  const orderGoods = new Map<string, { name: string; prices: number[] }>();

  for (const [, detail] of Object.entries(orderDetails)) {
    for (const good of detail.goods) {
      const name = normalizeName(good.name);
      if (!name) continue;
      const key = name.toLowerCase();

      let agg = orderGoods.get(key);
      if (!agg) {
        agg = { name, prices: [] };
        orderGoods.set(key, agg);
      }
      agg.prices.push(good.price);
    }
  }

  console.log(`  Уникальных товаров из заказов: ${orderGoods.size}`);

  // ─── Шаг 4: Объединение 3 источников ───────────────────────────────────────
  console.log('\nОбъединение источников...');

  const parts = new Map<string, PartRecord>(); // key = name.toLowerCase()

  // Группа A: в заказах — ищем совпадение в номенклатуре
  let groupA = 0, groupB = 0, groupC = 0;

  for (const [key, orderGood] of orderGoods) {
    const nomEntries = nomByName.get(key);

    if (nomEntries && nomEntries.length > 0) {
      // Группа A: есть в обоих — берём цены из 1С, артикул из номенклатуры
      groupA++;

      // Выбираем запись номенклатуры, у которой есть цена; если несколько — первую с ценой
      let bestCode = nomEntries[0].code;
      let bestArticle = nomEntries[0].article;
      for (const ne of nomEntries) {
        if (priceByCode.has(ne.code)) {
          bestCode = ne.code;
          bestArticle = ne.article;
          break;
        }
      }

      const prices = priceByCode.get(bestCode);
      const medianOrderPrice = round2(median(orderGood.prices));

      parts.set(key, {
        name: orderGood.name,
        sku: bestArticle,
        costPrice: prices ? round2(prices.costPrice) : medianOrderPrice,
        sellPrice: prices ? round2(prices.sellPrice) : medianOrderPrice,
        source: 'both',
      });
    } else {
      // Группа B: только в заказах
      groupB++;
      const medianPrice = round2(median(orderGood.prices));

      parts.set(key, {
        name: orderGood.name,
        sku: '',
        costPrice: medianPrice,
        sellPrice: medianPrice,
        source: 'orders_only',
      });
    }
  }

  // Группа C: только в номенклатуре (с ценой, не в заказах)
  const processedCodes = new Set<string>();
  for (const [code, prices] of priceByCode) {
    const nomItem = nomByCode.get(code);
    if (!nomItem) continue; // код есть в ценах, но нет в номенклатуре — пропускаем

    const key = nomItem.name.toLowerCase();
    if (parts.has(key)) continue; // уже добавлена из заказов
    if (processedCodes.has(key)) continue; // уже обработана из другого кода

    processedCodes.add(key);
    groupC++;

    parts.set(key, {
      name: nomItem.name,
      sku: nomItem.article,
      costPrice: round2(prices.costPrice),
      sellPrice: round2(prices.sellPrice),
      source: 'nomenclature_only',
    });
  }

  console.log(`  Группа A (в обоих):         ${groupA}`);
  console.log(`  Группа B (только заказы):    ${groupB}`);
  console.log(`  Группа C (только номенкл.):  ${groupC}`);
  console.log(`  ИТОГО уникальных:            ${parts.size}`);

  // Сортировка
  const partsList = [...parts.values()].sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nПримеры запчастей:`);
  for (const p of partsList.slice(0, 5)) {
    console.log(`  "${p.name}" — cost: ${p.costPrice}₽, sell: ${p.sellPrice}₽, sku: ${p.sku || '—'} [${p.source}]`);
  }

  // ─── Шаг 5: Импорт через API ───────────────────────────────────────────────
  await login();

  const stats = { created: 0, errors: 0 };
  const startTime = Date.now();

  console.log(`\nНачинаем импорт ${partsList.length} запчастей...\n`);

  for (let i = 0; i < partsList.length; i++) {
    const part = partsList[i];

    if ((i + 1) % LOG_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = Math.round((i + 1) / (Number(elapsed) || 1));
      const eta = Math.round((partsList.length - i - 1) / (rate || 1));
      console.log(`  [${i + 1}/${partsList.length}] ${elapsed}s (${rate}/s, ETA ${eta}s) — создано: ${stats.created}, ошибок: ${stats.errors}`);
    }

    try {
      const payload: any = {
        name: part.name,
        costPrice: part.costPrice,
        sellPrice: part.sellPrice,
        unit: 'шт',
      };
      if (part.sku) payload.sku = part.sku;

      const { ok, status, data } = await apiRequestWithRetry('POST', '/parts', payload);

      if (ok) {
        stats.created++;
      } else {
        throw new Error(`(${status}): ${JSON.stringify(data)}`);
      }
    } catch (err) {
      stats.errors++;
      logError(`Part "${part.name}" [${part.source}]`, err);
    }

    await delay(REQUEST_DELAY_MS);
  }

  // ─── Шаг 6: Итог ───────────────────────────────────────────────────────────
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════════╗
║  ИМПОРТ ЗАПЧАСТЕЙ (3 ИСТОЧНИКА) ЗАВЕРШЁН  ║
╠════════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                        ║
╠────────────────────────────────────────────╣
║  Источники:                               ║
║    В обоих (A):     ${String(groupA).padStart(6)}                    ║
║    Только заказы(B): ${String(groupB).padStart(5)}                    ║
║    Только номенкл(C):${String(groupC).padStart(5)}                    ║
║    Итого:           ${String(partsList.length).padStart(6)}                    ║
╠────────────────────────────────────────────╣
║  Результат:                               ║
║    Создано:         ${String(stats.created).padStart(6)}                    ║
║    Ошибки:          ${String(stats.errors).padStart(6)}                    ║
╚════════════════════════════════════════════╝`;

  console.log(summary);
  errorLogStream.write(`\n${summary}\n`);
  errorLogStream.end();

  if (stats.errors > 0) {
    console.log(`\nОшибки записаны в: ${ERROR_LOG_PATH}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
