/**
 * Этап 3: Импорт сотрудников из 1С (employees.json)
 *
 * Фильтрация: убираем системные записи (Реклама, Субподряд и т.д.)
 * Дедупликация: "Казаков Глеб Сергеевич" (2 записи → 1)
 * Роль: MECHANIC (владелец потом поменяет вручную)
 *
 * Запуск: cd /Users/khatlamadzieva/STO-CRM && ADMIN_PASSWORD=xxx npx tsx scripts/import-employees.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Конфигурация ──────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'https://crm.onemotors.ru/api/v1';
const TENANT_SLUG = process.env.TENANT_SLUG || 'onemotors';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onemotors.ru';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const IMPORT_PASSWORD = 'Import2026!';
const REQUEST_DELAY_MS = 20;

const EMPLOYEES_PATH = '/tmp/tipo-sto/demo_data/employees.json';
const ERROR_LOG_PATH = path.join(__dirname, 'import-employees-errors.log');

// ─── Типы ──────────────────────────────────────────────────────────────────────

interface Employee1C {
  code: string;
  name: string;
}

// ─── Системные записи для фильтрации ───────────────────────────────────────────

const SYSTEM_NAMES = new Set([
  'Реклама',
  'Субподряд',
  'Сотрудники Сервиса',
  'Без исполнителя',
]);

function isSystemEntry(name: string): boolean {
  if (SYSTEM_NAMES.has(name.trim())) return true;
  // Email-запись (содержит @)
  if (name.includes('@')) return true;
  return false;
}

// ─── Утилиты ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseName(fullName: string): { firstName: string; lastName: string; middleName?: string } {
  const parts = fullName.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length >= 3) {
    return { lastName: parts[0], firstName: parts[1], middleName: parts.slice(2).join(' ') };
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1] };
  }
  return { firstName: parts.join(' '), lastName: 'Сотрудник' };
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
    console.error('Укажите пароль: ADMIN_PASSWORD=xxx npx tsx scripts/import-employees.ts');
    process.exit(1);
  }

  errorLogStream = fs.createWriteStream(ERROR_LOG_PATH, { flags: 'a' });
  errorLogStream.write(`\n=== Import employees started at ${new Date().toISOString()} ===\n`);

  // 1. Загрузить данные
  console.log('Загрузка employees.json...');
  const allEmployees: Employee1C[] = JSON.parse(fs.readFileSync(EMPLOYEES_PATH, 'utf-8'));
  console.log(`  Всего записей: ${allEmployees.length}`);

  // 2. Фильтрация системных
  const filtered = allEmployees.filter(e => !isSystemEntry(e.name));
  console.log(`  После фильтрации системных: ${filtered.length}`);

  // 3. Дедупликация по имени
  const seen = new Set<string>();
  const employees: Employee1C[] = [];
  for (const emp of filtered) {
    const normalizedName = emp.name.trim().replace(/\s+/g, ' ');
    if (seen.has(normalizedName)) {
      console.log(`  Дубль пропущен: "${normalizedName}" (code: ${emp.code})`);
      continue;
    }
    seen.add(normalizedName);
    employees.push(emp);
  }
  console.log(`  После дедупликации: ${employees.length}`);

  // 4. Авторизация и импорт
  await login();

  const stats = { created: 0, skipped: 0, errors: 0 };
  const startTime = Date.now();

  console.log(`\nНачинаем импорт ${employees.length} сотрудников...\n`);

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const { firstName, lastName, middleName } = parseName(emp.name);
    const email = `${emp.code.toLowerCase()}@employee.local`;

    console.log(`  [${i + 1}/${employees.length}] ${emp.name} → ${email}`);

    try {
      const payload: any = {
        email,
        password: IMPORT_PASSWORD,
        role: 'MECHANIC',
        firstName,
        lastName,
      };
      if (middleName) payload.middleName = middleName;

      const { ok, status, data } = await apiRequest('POST', '/users', payload);

      if (ok) {
        stats.created++;
      } else if (status === 409) {
        stats.skipped++;
        console.log(`    → пропущен (уже существует)`);
      } else if (status === 401) {
        await login();
        const retry = await apiRequest('POST', '/users', payload);
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
      logError(`Employee "${emp.name}" (${emp.code})`, err);
      console.log(`    → ОШИБКА: ${err instanceof Error ? err.message : String(err)}`);
    }

    await delay(REQUEST_DELAY_MS);
  }

  // 5. Итог
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = `
╔════════════════════════════════════════╗
║   ИМПОРТ СОТРУДНИКОВ ЗАВЕРШЁН        ║
╠════════════════════════════════════════╣
║  Время: ${totalTime.padStart(8)}s                    ║
╠────────────────────────────────────────╣
║  Сотрудники:                          ║
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
