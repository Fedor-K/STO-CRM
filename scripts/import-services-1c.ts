/**
 * Этап 1а: Дополнение услуг из каталога 1С + обновление цен
 *
 * Источники: export_works.json (2,928) + work_prices.json (2,495)
 * Логика:
 *   - Загружаем существующие услуги из API (с пагинацией)
 *   - Для каждой работы из 1С:
 *     - Если НЕ найдена → POST /services (создать)
 *     - Если найдена И цена отличается → PATCH /services/:id (обновить)
 *     - Если найдена И цена совпадает → skip
 *
 * Запуск: cd /Users/khatlamadzieva/STO-CRM && ADMIN_PASSWORD=xxx npx tsx scripts/import-services-1c.ts
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

const EXPORT_WORKS_PATH = '/tmp/tipo-sto/export_works.json';
const WORK_PRICES_PATH = '/tmp/tipo-sto/work_prices.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-services-1c-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface Work1C {
  code: string;
  name: string;
  time_min: number;
}

interface WorkPrice1C {
  code: string;
  name: string;
  price: number;
}

interface ExistingService {
  id: string;
  name: string;
  price: number;
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

// ─── Загрузка существующих услуг ─────────────────────────────────────────────

async function loadExistingServices(): Promise<Map<string, ExistingService>> {
  console.log('Загрузка существующих услуг из API...');
  const map = new Map<string, ExistingService>();
  let page = 1;
  const limit = 100;

  while (true) {
    const { ok, data } = await apiRequestWithRetry('GET', `/services?page=${page}&limit=${limit}&sort=name&order=asc`);
    if (!ok) throw new Error(`Ошибка загрузки услуг: ${JSON.stringify(data)}`);

    for (const svc of data.data) {
      const key = normalizeName(svc.name).toLowerCase();
      map.set(key, {
        id: svc.id,
        name: svc.name,
        price: Number(svc.price),
      });
    }

    console.log(`  Страница ${page}/${data.meta.totalPages} — загружено ${map.size} услуг`);

    if (page >= data.meta.totalPages) break;
    page++;
    await delay(REQUEST_DELAY_MS);
  }

  console.log(`  Всего существующих: ${map.size}`);
  return map;
}

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-services-1c.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import services from 1C catalog started at ${new Date().toISOString()} ===\n`);

  // 1. Загрузить каталог работ из 1С
  console.log('Загрузка export_works.json...');
  const works: Work1C[] = JSON.parse(fs.readFileSync(EXPORT_WORKS_PATH, 'utf-8'));
  console.log(`  Работ в каталоге: ${works.length}`);

  // 2. Загрузить цены работ из 1С
  console.log('Загрузка work_prices.json...');
  const workPrices: WorkPrice1C[] = JSON.parse(fs.readFileSync(WORK_PRICES_PATH, 'utf-8'));
  console.log(`  Записей с ценами: ${workPrices.length}`);

  // 3. Построить map code → price
  const priceMap = new Map<string, number>();
  for (const wp of workPrices) {
    priceMap.set(wp.code, wp.price);
  }
  console.log(`  Уникальных кодов с ценами: ${priceMap.size}`);

  // 4. Дедупликация работ по нормализованному имени
  const workMap = new Map<string, { name: string; price: number }>();
  for (const w of works) {
    const name = normalizeName(w.name);
    if (!name) continue;
    const key = name.toLowerCase();
    const price = priceMap.get(w.code) ?? 0;

    const existing = workMap.get(key);
    if (!existing || (existing.price === 0 && price > 0)) {
      workMap.set(key, { name, price });
    }
  }
  console.log(`  Уникальных работ (по имени): ${workMap.size}`);

  const withPrice = [...workMap.values()].filter(w => w.price > 0).length;
  const withoutPrice = workMap.size - withPrice;
  console.log(`  С ценой: ${withPrice}, без цены: ${withoutPrice}`);

  // 5. Авторизация + загрузка существующих
  await login();
  const existingServices = await loadExistingServices();

  // 6. Определить действия
  const toCreate: { name: string; price: number }[] = [];
  const toUpdate: { id: string; name: string; oldPrice: number; newPrice: number }[] = [];
  let skipped = 0;

  for (const [key, work] of workMap) {
    const existing = existingServices.get(key);

    if (!existing) {
      toCreate.push(work);
    } else if (work.price > 0 && Math.abs(existing.price - work.price) > 0.01) {
      toUpdate.push({
        id: existing.id,
        name: work.name,
        oldPrice: existing.price,
        newPrice: work.price,
      });
    } else {
      skipped++;
    }
  }

  console.log(`\nПлан действий:`);
  console.log(`  Создать:   ${toCreate.length}`);
  console.log(`  Обновить:  ${toUpdate.length}`);
  console.log(`  Пропустить: ${skipped}`);

  // 7. Создание новых услуг
  const stats = { created: 0, updated: 0, errors: 0 };
  const startTime = Date.now();

  if (toCreate.length > 0) {
    console.log(`\nСоздание ${toCreate.length} новых услуг...\n`);

    for (let i = 0; i < toCreate.length; i++) {
      const work = toCreate[i];

      if ((i + 1) % LOG_EVERY === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  Создание [${i + 1}/${toCreate.length}] ${elapsed}s — создано: ${stats.created}`);
      }

      try {
        const { ok, status, data } = await apiRequestWithRetry('POST', '/services', {
          name: work.name,
          price: work.price,
        });

        if (ok) {
          stats.created++;
        } else {
          throw new Error(`(${status}): ${JSON.stringify(data)}`);
        }
      } catch (err) {
        stats.errors++;
        logError(`Create service "${work.name}"`, err);
      }

      await delay(REQUEST_DELAY_MS);
    }
  }

  // 8. Обновление цен
  if (toUpdate.length > 0) {
    console.log(`\nОбновление цен ${toUpdate.length} услуг...\n`);

    for (let i = 0; i < toUpdate.length; i++) {
      const upd = toUpdate[i];

      if ((i + 1) % LOG_EVERY === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`  Обновление [${i + 1}/${toUpdate.length}] ${elapsed}s — обновлено: ${stats.updated}`);
      }

      try {
        const { ok, status, data } = await apiRequestWithRetry('PATCH', `/services/${upd.id}`, {
          price: upd.newPrice,
        });

        if (ok) {
          stats.updated++;
        } else {
          throw new Error(`(${status}): ${JSON.stringify(data)}`);
        }
      } catch (err) {
        stats.errors++;
        logError(`Update service "${upd.name}" (${upd.id}): ${upd.oldPrice} → ${upd.newPrice}`, err);
      }

      await delay(REQUEST_DELAY_MS);
    }
  }

  // 9. Итог
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════════╗
║  ДОПОЛНЕНИЕ УСЛУГ ИЗ 1С ЗАВЕРШЕНО        ║
╠════════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                        ║
╠────────────────────────────────────────────╣
║  В каталоге 1С:  ${String(workMap.size).padStart(6)}                      ║
║  Уже в CRM:     ${String(skipped).padStart(6)}                      ║
╠────────────────────────────────────────────╣
║  Создано:        ${String(stats.created).padStart(6)}                      ║
║  Обновлено цен:  ${String(stats.updated).padStart(6)}                      ║
║  Ошибки:         ${String(stats.errors).padStart(6)}                      ║
╚════════════════════════════════════════════╝`;

  console.log(summary);
  errorLogStream.write(`\n${summary}\n`);
  errorLogStream.end();

  if (stats.errors > 0) {
    console.log(`\nОшибки записаны в: ${ERROR_LOG_PATH}`);
  }

  // Примеры обновлённых цен
  if (toUpdate.length > 0) {
    console.log(`\nПримеры обновлений цен (первые 10):`);
    for (const upd of toUpdate.slice(0, 10)) {
      console.log(`  "${upd.name}": ${upd.oldPrice}₽ → ${upd.newPrice}₽`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
