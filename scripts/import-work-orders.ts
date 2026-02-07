/**
 * Этап 4: Импорт заказ-нарядов из 1С
 *
 * Источники: order_history.json (заказы + клиенты + авто) + order_details.json (позиции)
 * Зависимости: клиенты (этап 0), авто (этап 0), услуги (этап 1), запчасти (этап 2)
 *
 * Алгоритм:
 * 1. Загружаем справочники из API (клиенты, авто, услуги, запчасти) для маппинга
 * 2. Для каждого заказа: создаём ЗН → добавляем позиции
 * 3. Финализация: массовое закрытие через SQL (показывает команду)
 *
 * Запуск: cd /Users/khatlamadzieva/STO-CRM && ADMIN_PASSWORD=xxx npx tsx scripts/import-work-orders.ts
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

const ORDER_HISTORY_PATH = '/tmp/tipo-sto/order_history.json';
const ORDER_DETAILS_PATH = '/tmp/tipo-sto/order_details.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-work-orders-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

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

interface WorkItem {
  name: string;
  qty: number;
  price: number;
  sum: number;
}

interface GoodItem {
  name: string;
  qty: number;
  price: number;
  sum: number;
}

interface OrderDetail {
  works: WorkItem[];
  goods: GoodItem[];
}

// ─── Утилиты ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
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

async function apiRequestWithRetry(method: string, endpoint: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const result = await apiRequest(method, endpoint, body);
  if (result.status === 401) {
    await login();
    return apiRequest(method, endpoint, body);
  }
  return result;
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

// ─── Загрузка справочников из API ──────────────────────────────────────────────

async function fetchAllPages<T>(endpoint: string, params: string = ''): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const sep = params ? '&' : '';
    const { ok, data } = await apiRequestWithRetry('GET', `${endpoint}?page=${page}&limit=${limit}${sep}${params}`);
    if (!ok) throw new Error(`Failed to fetch ${endpoint} page ${page}`);

    all.push(...data.data);

    if (page >= data.meta.totalPages) break;
    page++;
    await delay(REQUEST_DELAY_MS);
  }

  return all;
}

// ─── Парсинг госномера из car_name ─────────────────────────────────────────────

function extractPlateFromCarName(carName: string): string | undefined {
  const m = carName.match(/№\s*([A-Za-zА-Яа-яЁё0-9]+)/);
  return m ? m[1] : undefined;
}

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-work-orders.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import work orders started at ${new Date().toISOString()} ===\n`);

  // 1. Загрузить данные из файлов
  console.log('Загрузка order_history.json...');
  const clients1C: Client1C[] = JSON.parse(fs.readFileSync(ORDER_HISTORY_PATH, 'utf-8'));

  console.log('Загрузка order_details.json...');
  const orderDetails: Record<string, OrderDetail> = JSON.parse(fs.readFileSync(ORDER_DETAILS_PATH, 'utf-8'));

  // Собираем плоский список заказов с привязкой к client_code
  const allOrders: { order: Order1C; clientCode: string }[] = [];
  for (const client of clients1C) {
    for (const order of client.orders) {
      allOrders.push({ order, clientCode: client.client_code });
    }
  }

  // Сортировка по дате (для хронологического порядка номеров WO)
  allOrders.sort((a, b) => a.order.date.localeCompare(b.order.date));

  console.log(`  Всего заказов: ${allOrders.length}`);
  console.log(`  Деталей заказов: ${Object.keys(orderDetails).length}`);

  // 2. Авторизация
  await login();

  // 3. Загрузка справочников из API
  console.log('\nЗагрузка справочников из API...');

  console.log('  Загрузка клиентов...');
  const apiUsers = await fetchAllPages<any>('/users', 'role=CLIENT');
  const clientEmailMap = new Map<string, string>(); // email → userId
  for (const user of apiUsers) {
    clientEmailMap.set(user.email.toLowerCase(), user.id);
  }
  console.log(`  Клиентов загружено: ${clientEmailMap.size}`);

  console.log('  Загрузка автомобилей...');
  const apiVehicles = await fetchAllPages<any>('/vehicles');
  // Маппинг: VIN → vehicleId, plate → vehicleId
  const vehicleByVin = new Map<string, { id: string; clientId: string }>();
  const vehicleByPlate = new Map<string, { id: string; clientId: string }>();
  const vehiclesByClient = new Map<string, any[]>();
  for (const v of apiVehicles) {
    if (v.vin) vehicleByVin.set(v.vin.toUpperCase(), { id: v.id, clientId: v.clientId });
    if (v.licensePlate) vehicleByPlate.set(v.licensePlate.toUpperCase(), { id: v.id, clientId: v.clientId });
    const clientVehicles = vehiclesByClient.get(v.clientId) || [];
    clientVehicles.push(v);
    vehiclesByClient.set(v.clientId, clientVehicles);
  }
  console.log(`  Автомобилей загружено: ${apiVehicles.length} (VIN: ${vehicleByVin.size}, plate: ${vehicleByPlate.size})`);

  console.log('  Загрузка услуг...');
  const apiServices = await fetchAllPages<any>('/services');
  const serviceByName = new Map<string, string>(); // normalized name → serviceId
  for (const svc of apiServices) {
    serviceByName.set(normalizeName(svc.name), svc.id);
  }
  console.log(`  Услуг загружено: ${serviceByName.size}`);

  console.log('  Загрузка запчастей...');
  const apiParts = await fetchAllPages<any>('/parts');
  const partByName = new Map<string, string>(); // normalized name → partId
  for (const part of apiParts) {
    partByName.set(normalizeName(part.name), part.id);
  }
  console.log(`  Запчастей загружено: ${partByName.size}`);

  // 4. Импорт заказ-нарядов
  const stats = {
    ordersCreated: 0,
    ordersSkipped: 0,
    ordersNoClient: 0,
    ordersNoVehicle: 0,
    ordersNoDetails: 0,
    ordersError: 0,
    itemsCreated: 0,
    itemsError: 0,
    laborItems: 0,
    partItems: 0,
    serviceMatched: 0,
    partMatched: 0,
  };

  const startTime = Date.now();
  const importStartISO = new Date().toISOString();

  // Отслеживаем обработанные номера для дедупликации
  const processedOrders = new Set<string>();

  // Переавторизация каждые 10 мин (JWT на 15 мин)
  let lastLoginTime = Date.now();
  const RELOGIN_INTERVAL_MS = 10 * 60 * 1000;

  console.log(`\nНачинаем импорт ${allOrders.length} заказ-нарядов...\n`);

  for (let i = 0; i < allOrders.length; i++) {
    const { order, clientCode } = allOrders[i];

    if ((i + 1) % LOG_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = ((i + 1) / (Date.now() - startTime) * 1000).toFixed(1);
      console.log(`  [${i + 1}/${allOrders.length}] ${elapsed}s (${rate}/s) — ЗН: ${stats.ordersCreated}, позиции: ${stats.itemsCreated}`);
    }

    // Переавторизация
    if (Date.now() - lastLoginTime > RELOGIN_INTERVAL_MS) {
      await login();
      lastLoginTime = Date.now();
    }

    // Дедупликация — один номер заказа может встречаться у разных клиентов (общее авто)
    if (processedOrders.has(order.number)) {
      stats.ordersSkipped++;
      continue;
    }
    processedOrders.add(order.number);

    // a. Найти clientId
    const clientEmail = `${clientCode.toLowerCase()}@import.local`;
    const clientId = clientEmailMap.get(clientEmail);
    if (!clientId) {
      stats.ordersNoClient++;
      logError(`Order ${order.number}`, `Client not found: ${clientCode} (${clientEmail})`);
      continue;
    }

    // b. Найти vehicleId
    let vehicleId: string | undefined;

    // По VIN
    if (order.car_vin) {
      const v = vehicleByVin.get(order.car_vin.toUpperCase());
      if (v) vehicleId = v.id;
    }

    // По госномеру из car_name
    if (!vehicleId) {
      const plate = extractPlateFromCarName(order.car_name);
      if (plate) {
        const v = vehicleByPlate.get(plate.toUpperCase());
        if (v) vehicleId = v.id;
      }
    }

    // Fallback: первое авто клиента
    if (!vehicleId) {
      const clientVehicles = vehiclesByClient.get(clientId);
      if (clientVehicles && clientVehicles.length > 0) {
        vehicleId = clientVehicles[0].id;
      }
    }

    if (!vehicleId) {
      stats.ordersNoVehicle++;
      logError(`Order ${order.number}`, `Vehicle not found: VIN=${order.car_vin}, car=${order.car_name}, client=${clientCode}`);
      continue;
    }

    // c. Получить детали заказа
    const detail = orderDetails[order.number];
    if (!detail) {
      stats.ordersNoDetails++;
      // Создаём пустой ЗН всё равно — у 16 заказов нет деталей
    }

    // d. Создать заказ-наряд
    const mileage = parseInt(order.mileage, 10);

    try {
      const payload: any = {
        clientId,
        vehicleId,
      };
      if (!isNaN(mileage) && mileage > 0) {
        payload.mileageAtIntake = mileage;
      }

      const { ok, status, data } = await apiRequestWithRetry('POST', '/work-orders', payload);

      if (!ok) {
        throw new Error(`Create WO failed (${status}): ${JSON.stringify(data)}`);
      }

      stats.ordersCreated++;
      const workOrderId = data.id;

      // e. Добавить позиции
      if (detail) {
        // Работы (LABOR)
        for (const work of detail.works) {
          const name = normalizeName(work.name);
          if (!name) continue;

          const serviceId = serviceByName.get(name);
          if (serviceId) stats.serviceMatched++;

          try {
            const itemPayload: any = {
              type: 'LABOR',
              description: name,
              quantity: work.qty,
              unitPrice: work.price,
            };
            if (serviceId) itemPayload.serviceId = serviceId;

            const itemResult = await apiRequestWithRetry('POST', `/work-orders/${workOrderId}/items`, itemPayload);
            if (itemResult.ok) {
              stats.itemsCreated++;
              stats.laborItems++;
            } else {
              throw new Error(`(${itemResult.status}): ${JSON.stringify(itemResult.data)}`);
            }
          } catch (err) {
            stats.itemsError++;
            logError(`Item LABOR "${name}" for order ${order.number}`, err);
          }

          await delay(REQUEST_DELAY_MS);
        }

        // Запчасти (PART)
        for (const good of detail.goods) {
          const name = normalizeName(good.name);
          if (!name) continue;

          const partId = partByName.get(name);
          if (partId) stats.partMatched++;

          try {
            const itemPayload: any = {
              type: 'PART',
              description: name,
              quantity: good.qty,
              unitPrice: good.price,
            };
            if (partId) itemPayload.partId = partId;

            const itemResult = await apiRequestWithRetry('POST', `/work-orders/${workOrderId}/items`, itemPayload);
            if (itemResult.ok) {
              stats.itemsCreated++;
              stats.partItems++;
            } else {
              throw new Error(`(${itemResult.status}): ${JSON.stringify(itemResult.data)}`);
            }
          } catch (err) {
            stats.itemsError++;
            logError(`Item PART "${name}" for order ${order.number}`, err);
          }

          await delay(REQUEST_DELAY_MS);
        }
      }
    } catch (err) {
      stats.ordersError++;
      logError(`Order ${order.number} (client=${clientCode})`, err);
    }

    await delay(REQUEST_DELAY_MS);
  }

  // 5. Итог
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════════╗
║   ИМПОРТ ЗАКАЗ-НАРЯДОВ ЗАВЕРШЁН          ║
╠════════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                        ║
╠────────────────────────────────────────────╣
║  Заказ-наряды:                            ║
║    Создано:        ${String(stats.ordersCreated).padStart(6)}                  ║
║    Пропущено:      ${String(stats.ordersSkipped).padStart(6)}                  ║
║    Без клиента:    ${String(stats.ordersNoClient).padStart(6)}                  ║
║    Без авто:       ${String(stats.ordersNoVehicle).padStart(6)}                  ║
║    Без деталей:    ${String(stats.ordersNoDetails).padStart(6)}                  ║
║    Ошибки:         ${String(stats.ordersError).padStart(6)}                  ║
╠────────────────────────────────────────────╣
║  Позиции:                                 ║
║    Создано всего:  ${String(stats.itemsCreated).padStart(6)}                  ║
║    Работы (LABOR): ${String(stats.laborItems).padStart(6)}                  ║
║    Запчасти (PART):${String(stats.partItems).padStart(6)}                  ║
║    Ошибки:         ${String(stats.itemsError).padStart(6)}                  ║
╠────────────────────────────────────────────╣
║  Маппинг:                                 ║
║    Услуги найдены: ${String(stats.serviceMatched).padStart(6)}                  ║
║    Запчасти найд.: ${String(stats.partMatched).padStart(6)}                  ║
╚════════════════════════════════════════════╝

СЛЕДУЮЩИЙ ШАГ — закрыть все импортированные ЗН через SQL:
────────────────────────────────────────────────────────

ssh root@178.72.139.156 "docker exec stocrm-postgres psql -U stocrm -d stocrm -c \\"
UPDATE work_orders
SET status = 'CLOSED',
    \\\"completedAt\\\" = \\\"createdAt\\\"::timestamp + interval '1 hour',
    \\\"paidAt\\\" = \\\"createdAt\\\"::timestamp + interval '2 hours'
WHERE status = 'NEW'
  AND \\\"tenantId\\\" = '6d5917c9-...'
  AND \\\"createdAt\\\" > '${importStartISO}';
\\""
`;

  console.log(summary);
  errorLogStream.write(`\n${summary}\n`);
  errorLogStream.end();

  if (stats.ordersError > 0 || stats.itemsError > 0) {
    console.log(`\nОшибки записаны в: ${ERROR_LOG_PATH}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
