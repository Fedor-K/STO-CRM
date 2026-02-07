/**
 * Этап 1: Импорт услуг из 1С (order_details.json → works[])
 *
 * Стратегия цен: последняя цена (из самого свежего заказа)
 * normHours: медиана qty
 *
 * Запуск: cd /Users/khatlamadzieva/STO-CRM && ADMIN_PASSWORD=xxx npx tsx scripts/import-services.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Конфигурация ──────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'https://crm.onemotors.ru/api/v1';
const TENANT_SLUG = process.env.TENANT_SLUG || 'onemotors';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onemotors.ru';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const REQUEST_DELAY_MS = 20;
const LOG_EVERY = 100;

const ORDER_DETAILS_PATH = '/tmp/tipo-sto/order_details.json';
const ORDER_HISTORY_PATH = '/tmp/tipo-sto/order_history.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-services-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface WorkItem {
  name: string;
  qty: number;
  price: number;
  sum: number;
}

interface OrderDetail {
  works: WorkItem[];
  goods: { name: string; qty: number; price: number; sum: number }[];
}

interface Order1C {
  number: string;
  date: string;
  sum: number;
  sum_works: number;
  sum_goods: number;
  car_code: string;
  car_name: string;
  car_vin: string;
  mileage: string;
}

interface Client1C {
  client_code: string;
  client_name: string;
  orders: Order1C[];
}

interface ServiceAgg {
  name: string;
  prices: { price: number; date: string }[];
  quantities: number[];
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

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-services.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import services started at ${new Date().toISOString()} ===\n`);

  // 1. Загрузить данные
  console.log('Загрузка order_details.json...');
  const orderDetails: Record<string, OrderDetail> = JSON.parse(fs.readFileSync(ORDER_DETAILS_PATH, 'utf-8'));
  console.log(`  Заказов с деталями: ${Object.keys(orderDetails).length}`);

  console.log('Загрузка order_history.json (для дат)...');
  const clients: Client1C[] = JSON.parse(fs.readFileSync(ORDER_HISTORY_PATH, 'utf-8'));

  // 2. Построить маппинг orderNumber → date
  const orderDateMap = new Map<string, string>();
  for (const client of clients) {
    for (const order of client.orders) {
      orderDateMap.set(order.number, order.date);
    }
  }
  console.log(`  Заказов с датами: ${orderDateMap.size}`);

  // 3. Агрегировать услуги
  console.log('Агрегация услуг...');
  const serviceMap = new Map<string, ServiceAgg>();

  for (const [orderNumber, detail] of Object.entries(orderDetails)) {
    const orderDate = orderDateMap.get(orderNumber) || '2020-01-01';

    for (const work of detail.works) {
      const name = normalizeName(work.name);
      if (!name) continue;

      let agg = serviceMap.get(name);
      if (!agg) {
        agg = { name, prices: [], quantities: [] };
        serviceMap.set(name, agg);
      }
      agg.prices.push({ price: work.price, date: orderDate });
      agg.quantities.push(work.qty);
    }
  }

  console.log(`  Уникальных услуг: ${serviceMap.size}`);

  // 4. Вычислить цены и normHours
  const services: { name: string; price: number; normHours: number; estimatedMinutes: number }[] = [];

  for (const [, agg] of serviceMap) {
    // Последняя цена (из самого свежего заказа)
    agg.prices.sort((a, b) => b.date.localeCompare(a.date));
    const lastPrice = agg.prices[0].price;

    // Медиана qty = normHours
    const normHours = median(agg.quantities);
    const estimatedMinutes = Math.round(normHours * 60);

    services.push({
      name: agg.name,
      price: lastPrice,
      normHours: Math.round(normHours * 100) / 100,
      estimatedMinutes: estimatedMinutes || 60,
    });
  }

  // Сортировка по имени для детерминированного порядка
  services.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nПримеры услуг:`);
  for (const s of services.slice(0, 5)) {
    console.log(`  "${s.name}" — ${s.price}₽, ${s.normHours}ч`);
  }

  // 5. Авторизация и импорт
  await login();

  const stats = { created: 0, skipped: 0, errors: 0 };
  const startTime = Date.now();

  console.log(`\nНачинаем импорт ${services.length} услуг...\n`);

  for (let i = 0; i < services.length; i++) {
    const svc = services[i];

    if ((i + 1) % LOG_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  [${i + 1}/${services.length}] ${elapsed}s — создано: ${stats.created}, пропущено: ${stats.skipped}`);
    }

    try {
      const { ok, status, data } = await apiRequest('POST', '/services', {
        name: svc.name,
        price: svc.price,
        normHours: svc.normHours,
        estimatedMinutes: svc.estimatedMinutes,
      });

      if (ok) {
        stats.created++;
      } else if (status === 409) {
        stats.skipped++;
      } else if (status === 401) {
        await login();
        const retry = await apiRequest('POST', '/services', {
          name: svc.name,
          price: svc.price,
          normHours: svc.normHours,
          estimatedMinutes: svc.estimatedMinutes,
        });
        if (retry.ok) {
          stats.created++;
        } else if (retry.status === 409) {
          stats.skipped++;
        } else {
          throw new Error(`(${retry.status}): ${JSON.stringify(retry.data)}`);
        }
      } else {
        throw new Error(`(${status}): ${JSON.stringify(data)}`);
      }
    } catch (err) {
      stats.errors++;
      logError(`Service "${svc.name}"`, err);
    }

    await delay(REQUEST_DELAY_MS);
  }

  // 6. Итог
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════╗
║     ИМПОРТ УСЛУГ ЗАВЕРШЁН            ║
╠════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                    ║
╠────────────────────────────────────────╣
║  Услуги:                              ║
║    Создано:    ${String(stats.created).padStart(6)}                  ║
║    Пропущено:  ${String(stats.skipped).padStart(6)}                  ║
║    Ошибки:     ${String(stats.errors).padStart(6)}                  ║
╚════════════════════════════════════════╝`;

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
