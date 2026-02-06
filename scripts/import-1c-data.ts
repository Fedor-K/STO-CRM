/**
 * Импорт клиентов и автомобилей из 1С (tipo-sto) в STO-CRM
 *
 * Источник: /tmp/tipo-sto/order_history.json + /tmp/tipo-sto/demo_data/cars.json
 * Запуск:   cd /Users/khatlamadzieva/STO-CRM && npx tsx scripts/import-1c-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Конфигурация ──────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'https://crm.onemotors.ru/api/v1';
const TENANT_SLUG = process.env.TENANT_SLUG || 'onemotors';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onemotors.ru';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const IMPORT_PASSWORD = 'Import2026!'; // Пароль для импортируемых клиентов (>=8 символов)
const REQUEST_DELAY_MS = 20;
const LOG_EVERY = 100;

const ORDER_HISTORY_PATH = '/tmp/tipo-sto/order_history.json';
const CARS_JSON_PATH = '/tmp/tipo-sto/demo_data/cars.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface Order {
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
  orders: Order[];
}

interface Car1C {
  code: string;
  name: string;
  vin: string;
  plate: string;
}

interface CarInfo {
  car_code: string;
  car_name: string;
  car_vin: string;
  maxMileage: number;
  ownerCodes: Set<string>;
  plateFromDb?: string;
}

interface Stats {
  clientsCreated: number;
  clientsSkipped: number;
  clientsError: number;
  vehiclesCreated: number;
  vehiclesSkipped: number;
  vehiclesError: number;
}

// ─── Утилиты ───────────────────────────────────────────────────────────────────

const COLORS = new Set([
  'БЕЛЫЙ', 'ЧЕРНЫЙ', 'СЕРЫЙ', 'СИНИЙ', 'КРАСНЫЙ', 'ЗЕЛЕНЫЙ', 'СЕРЕБРИСТЫЙ',
  'ЗОЛОТОЙ', 'ОРАНЖЕВЫЙ', 'БЕЖЕВЫЙ', 'КОРИЧНЕВЫЙ', 'БОРДОВЫЙ', 'ФИОЛЕТОВЫЙ',
  'ГОЛУБОЙ', 'ЖЁЛТЫЙ', 'ЖЕЛТЫЙ', 'РОЗОВЫЙ', 'ВИШНЕВЫЙ', 'БРОНЗОВЫЙ',
  'Белый', 'Черный', 'Серый', 'Синий', 'Красный', 'Зеленый', 'Серебристый',
  'белый', 'черный', 'серый', 'синий', 'красный', 'зеленый', 'серебристый',
]);

function parseName(fullName: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');

  if (parts.length >= 3) {
    return { lastName: parts[0], firstName: parts[1], middleName: parts.slice(2).join(' ') };
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1] };
  }
  // Одно слово — скорее всего организация
  return { firstName: parts.join(' '), lastName: 'Организация' };
}

function parseCar(carName: string, carVin: string, plateFromDb?: string): {
  make: string;
  model: string;
  plate?: string;
  color?: string;
} {
  // Отделяем часть до № или VIN
  const mainPart = carName.split(/\s*[№]\s*/)[0].split(/\s+VIN\s+/i)[0].trim();
  const words = mainPart.split(/\s+/);

  let color: string | undefined;
  const filtered: string[] = [];
  for (const w of words) {
    if (COLORS.has(w)) {
      color = w;
    } else {
      filtered.push(w);
    }
  }

  const make = filtered[0] || 'Неизвестно';
  const model = filtered.slice(1).join(' ') || 'Неизвестно';

  // Госномер: приоритет — cars.json, потом парсинг из car_name
  let plate = plateFromDb || undefined;
  if (!plate) {
    const m = carName.match(/№\s*([A-Za-zА-Яа-яЁё0-9]+)/);
    if (m) plate = m[1];
  }

  return { make, model, plate: plate || undefined, color };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

async function login(): Promise<void> {
  console.log(`Авторизация: ${ADMIN_EMAIL} @ ${TENANT_SLUG}...`);
  const { ok, status, data } = await apiRequest('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  if (!ok) {
    throw new Error(`Ошибка авторизации (${status}): ${JSON.stringify(data)}`);
  }

  accessToken = data.accessToken;
  console.log('Авторизация успешна.');
}

async function createUser(payload: {
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  middleName?: string;
}): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
  const { ok, status, data } = await apiRequest('POST', '/users', payload);

  if (ok) {
    return { ok: true, id: data.id };
  }

  // 409 Conflict = дубликат email — уже импортирован
  if (status === 409) {
    return { ok: false, skipped: true };
  }

  // 401 — попробовать перелогиниться
  if (status === 401) {
    await login();
    const retry = await apiRequest('POST', '/users', payload);
    if (retry.ok) return { ok: true, id: retry.data.id };
    if (retry.status === 409) return { ok: false, skipped: true };
  }

  throw new Error(`Create user failed (${status}): ${JSON.stringify(data)}`);
}

async function createVehicle(payload: {
  make: string;
  model: string;
  vin?: string;
  licensePlate?: string;
  color?: string;
  mileage?: number;
  clientId: string;
}): Promise<{ ok: boolean; id?: string; skipped?: boolean }> {
  const { ok, status, data } = await apiRequest('POST', '/vehicles', payload);

  if (ok) {
    return { ok: true, id: data.id };
  }

  // 409 = дубликат VIN или licensePlate
  if (status === 409) {
    return { ok: false, skipped: true };
  }

  if (status === 401) {
    await login();
    const retry = await apiRequest('POST', '/vehicles', payload);
    if (retry.ok) return { ok: true, id: retry.data.id };
    if (retry.status === 409) return { ok: false, skipped: true };
  }

  throw new Error(`Create vehicle failed (${status}): ${JSON.stringify(data)}`);
}

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-1c-data.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import started at ${new Date().toISOString()} ===\n`);

  // 1. Загрузить данные
  console.log('Загрузка order_history.json...');
  const clients: Client1C[] = JSON.parse(fs.readFileSync(ORDER_HISTORY_PATH, 'utf-8'));
  console.log(`  Клиентов: ${clients.length}`);

  console.log('Загрузка cars.json...');
  const carsDb: Car1C[] = JSON.parse(fs.readFileSync(CARS_JSON_PATH, 'utf-8'));
  const plateMap = new Map<string, string>();
  for (const car of carsDb) {
    if (car.plate && car.plate.trim()) {
      plateMap.set(car.code, car.plate.trim());
    }
  }
  console.log(`  Авто в cars.json: ${carsDb.length}, с госномерами: ${plateMap.size}`);

  // 2. Построить карту авто и определить общие
  console.log('Построение карты авто...');
  const carMap = new Map<string, CarInfo>();

  for (const client of clients) {
    for (const order of client.orders) {
      let info = carMap.get(order.car_code);
      if (!info) {
        info = {
          car_code: order.car_code,
          car_name: order.car_name,
          car_vin: order.car_vin,
          maxMileage: 0,
          ownerCodes: new Set(),
          plateFromDb: plateMap.get(order.car_code),
        };
        carMap.set(order.car_code, info);
      }
      info.ownerCodes.add(client.client_code);
      const mileage = parseInt(order.mileage, 10);
      if (!isNaN(mileage) && mileage > info.maxMileage) {
        info.maxMileage = mileage;
      }
    }
  }

  const sharedCars = new Set<string>();
  for (const [code, info] of carMap) {
    if (info.ownerCodes.size > 1) {
      sharedCars.add(code);
    }
  }
  console.log(`  Уникальных авто: ${carMap.size}, общих (>1 владелец, будут пропущены): ${sharedCars.size}`);

  // 3. Авторизация
  await login();

  // 4. Импорт
  const stats: Stats = {
    clientsCreated: 0,
    clientsSkipped: 0,
    clientsError: 0,
    vehiclesCreated: 0,
    vehiclesSkipped: 0,
    vehiclesError: 0,
  };

  const clientIdMap = new Map<string, string>(); // client_code → userId
  const importedVins = new Set<string>();
  const importedPlates = new Set<string>();

  console.log(`\nНачинаем импорт ${clients.length} клиентов...\n`);
  const startTime = Date.now();

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];

    if ((i + 1) % LOG_EVERY === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  [${i + 1}/${clients.length}] ${elapsed}s — создано: ${stats.clientsCreated} кл, ${stats.vehiclesCreated} авто`);
    }

    // --- Создание клиента ---
    const { firstName, lastName, middleName } = parseName(client.client_name);
    const email = `${client.client_code.toLowerCase()}@import.local`;

    try {
      const result = await createUser({
        email,
        password: IMPORT_PASSWORD,
        role: 'CLIENT',
        firstName,
        lastName,
        ...(middleName ? { middleName } : {}),
      });

      if (result.ok && result.id) {
        stats.clientsCreated++;
        clientIdMap.set(client.client_code, result.id);
      } else if (result.skipped) {
        stats.clientsSkipped++;
        // Клиент уже существует — не можем создавать авто без его ID
        continue;
      }
    } catch (err) {
      stats.clientsError++;
      logError(`Client ${client.client_code} (${client.client_name})`, err);
      continue;
    }

    await delay(REQUEST_DELAY_MS);

    // --- Создание авто клиента ---
    const userId = clientIdMap.get(client.client_code);
    if (!userId) continue;

    // Собираем уникальные car_code для этого клиента
    const clientCarCodes = new Set<string>();
    for (const order of client.orders) {
      clientCarCodes.add(order.car_code);
    }

    for (const carCode of clientCarCodes) {
      // Пропуск общих авто
      if (sharedCars.has(carCode)) {
        stats.vehiclesSkipped++;
        continue;
      }

      const carInfo = carMap.get(carCode);
      if (!carInfo) continue;

      const { make, model, plate, color } = parseCar(carInfo.car_name, carInfo.car_vin, carInfo.plateFromDb);
      const vin = carInfo.car_vin?.trim() || undefined;

      // Дедупликация по VIN и plate в рамках импорта
      if (vin && importedVins.has(vin)) {
        stats.vehiclesSkipped++;
        continue;
      }
      if (plate && importedPlates.has(plate)) {
        stats.vehiclesSkipped++;
        continue;
      }

      try {
        const payload: any = {
          make,
          model,
          clientId: userId,
        };
        if (vin) payload.vin = vin;
        if (plate) payload.licensePlate = plate;
        if (color) payload.color = color;
        if (carInfo.maxMileage > 0) payload.mileage = carInfo.maxMileage;

        const result = await createVehicle(payload);

        if (result.ok && result.id) {
          stats.vehiclesCreated++;
          if (vin) importedVins.add(vin);
          if (plate) importedPlates.add(plate);
        } else if (result.skipped) {
          stats.vehiclesSkipped++;
          // Запомним чтобы не дублировать
          if (vin) importedVins.add(vin);
          if (plate) importedPlates.add(plate);
        }
      } catch (err) {
        stats.vehiclesError++;
        logError(`Vehicle ${carCode} (${carInfo.car_name}) for client ${client.client_code}`, err);
      }

      await delay(REQUEST_DELAY_MS);
    }
  }

  // 5. Итоговая статистика
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════╗
║        ИМПОРТ ЗАВЕРШЁН                ║
╠════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                    ║
╠────────────────────────────────────────╣
║  Клиенты:                              ║
║    Создано:    ${String(stats.clientsCreated).padStart(6)}                  ║
║    Пропущено:  ${String(stats.clientsSkipped).padStart(6)}                  ║
║    Ошибки:     ${String(stats.clientsError).padStart(6)}                  ║
╠────────────────────────────────────────╣
║  Автомобили:                            ║
║    Создано:    ${String(stats.vehiclesCreated).padStart(6)}                  ║
║    Пропущено:  ${String(stats.vehiclesSkipped).padStart(6)}                  ║
║    Ошибки:     ${String(stats.vehiclesError).padStart(6)}                  ║
╚════════════════════════════════════════╝`;

  console.log(summary);
  errorLogStream.write(`\n${summary}\n`);
  errorLogStream.end();

  if (stats.clientsError > 0 || stats.vehiclesError > 0) {
    console.log(`\nОшибки записаны в: ${ERROR_LOG_PATH}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
