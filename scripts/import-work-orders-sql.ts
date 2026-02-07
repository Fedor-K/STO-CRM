/**
 * Этап 4 (v2): Импорт заказ-нарядов через прямой SQL
 *
 * Генерирует SQL-файл с INSERT-ами. Оригинальные даты, номера, статус CLOSED.
 *
 * Запуск:
 *   npx tsx scripts/import-work-orders-sql.ts
 *   scp /tmp/import-work-orders.sql root@178.72.139.156:/tmp/
 *   ssh root@178.72.139.156 "docker exec -i stocrm-postgres psql -U stocrm -d stocrm < /tmp/import-work-orders.sql"
 */

import * as fs from 'fs';
import { randomUUID } from 'crypto';

// ─── Конфигурация ──────────────────────────────────────────────────────────────

const TENANT_ID = '6d5917c9-42cf-4bab-b0c0-d6cc08bfa481';
const ORDER_HISTORY_PATH = '/tmp/tipo-sto/order_history.json';
const ORDER_DETAILS_PATH = '/tmp/tipo-sto/order_details.json';
const USERS_DUMP_PATH = '/tmp/users-dump.csv';
const VEHICLES_DUMP_PATH = '/tmp/vehicles-dump.csv';
const OUTPUT_SQL_PATH = '/tmp/import-work-orders.sql';

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

interface WorkItem { name: string; qty: number; price: number; sum: number; }
interface GoodItem { name: string; qty: number; price: number; sum: number; }
interface OrderDetail { works: WorkItem[]; goods: GoodItem[]; }

// ─── Утилиты ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function extractPlate(carName: string): string | undefined {
  const m = carName.match(/№\s*([A-Za-zА-Яа-яЁё0-9]+)/);
  return m ? m[1] : undefined;
}

// ─── Основная логика ───────────────────────────────────────────────────────────

async function main() {
  // 1. Загрузить 1С данные
  console.log('Загрузка данных из 1С...');
  const clients1C: Client1C[] = JSON.parse(fs.readFileSync(ORDER_HISTORY_PATH, 'utf-8'));
  const orderDetails: Record<string, OrderDetail> = JSON.parse(fs.readFileSync(ORDER_DETAILS_PATH, 'utf-8'));

  // 2. Загрузить маппинги из БД (через дампы)
  console.log('Загрузка маппингов...');

  // Users: email → id
  const usersRaw = fs.readFileSync(USERS_DUMP_PATH, 'utf-8');
  const clientEmailMap = new Map<string, string>();
  for (const line of usersRaw.trim().split('\n')) {
    const [email, id] = line.split('|').map(s => s.trim());
    if (email && id) clientEmailMap.set(email.toLowerCase(), id);
  }
  console.log(`  Клиентов в маппинге: ${clientEmailMap.size}`);

  // Vehicles: vin → {id, clientId}, plate → {id, clientId}
  const vehiclesRaw = fs.readFileSync(VEHICLES_DUMP_PATH, 'utf-8');
  const vehicleByVin = new Map<string, { id: string; clientId: string }>();
  const vehicleByPlate = new Map<string, { id: string; clientId: string }>();
  const vehiclesByClient = new Map<string, string>(); // clientId → first vehicleId
  for (const line of vehiclesRaw.trim().split('\n')) {
    const [id, vin, plate, clientId] = line.split('|').map(s => s.trim());
    if (!id) continue;
    if (vin) vehicleByVin.set(vin.toUpperCase(), { id, clientId });
    if (plate) vehicleByPlate.set(plate.toUpperCase(), { id, clientId });
    if (!vehiclesByClient.has(clientId)) vehiclesByClient.set(clientId, id);
  }
  console.log(`  Авто: VIN=${vehicleByVin.size}, plate=${vehicleByPlate.size}`);

  // 3. Собираем плоский список заказов
  const allOrders: { order: Order1C; clientCode: string }[] = [];
  for (const client of clients1C) {
    for (const order of client.orders) {
      allOrders.push({ order, clientCode: client.client_code });
    }
  }
  allOrders.sort((a, b) => a.order.date.localeCompare(b.order.date));
  console.log(`  Всего заказов: ${allOrders.length}`);

  // 4. Генерируем SQL
  const sql: string[] = [];

  const stats = {
    orders: 0, skippedNoClient: 0, skippedNoVehicle: 0, skippedDuplicate: 0,
    laborItems: 0, partItems: 0,
  };

  const processedNumbers = new Set<string>();

  for (const { order, clientCode } of allOrders) {
    // Дедупликация
    if (processedNumbers.has(order.number)) {
      stats.skippedDuplicate++;
      continue;
    }
    processedNumbers.add(order.number);

    // Найти clientId
    const clientEmail = `${clientCode.toLowerCase()}@import.local`;
    const clientId = clientEmailMap.get(clientEmail);
    if (!clientId) {
      stats.skippedNoClient++;
      continue;
    }

    // Найти vehicleId
    let vehicleId: string | undefined;
    if (order.car_vin) {
      vehicleId = vehicleByVin.get(order.car_vin.toUpperCase())?.id;
    }
    if (!vehicleId) {
      const plate = extractPlate(order.car_name);
      if (plate) vehicleId = vehicleByPlate.get(plate.toUpperCase())?.id;
    }
    if (!vehicleId) {
      vehicleId = vehiclesByClient.get(clientId);
    }
    if (!vehicleId) {
      stats.skippedNoVehicle++;
      continue;
    }

    const woId = randomUUID();
    const mileage = parseInt(order.mileage, 10);
    const mileageVal = !isNaN(mileage) && mileage > 0 && mileage < 2000000 ? mileage : 'NULL';
    const dateStr = `${order.date}T10:00:00.000`;
    const completedStr = `${order.date}T17:00:00.000`;

    sql.push(`INSERT INTO work_orders (id, "orderNumber", status, "totalLabor", "totalParts", "totalAmount", "mileageAtIntake", "createdAt", "updatedAt", "completedAt", "paidAt", "tenantId", "clientId", "vehicleId")`);
    sql.push(`VALUES ('${woId}', '${esc(order.number)}', 'CLOSED', ${order.sum_works}, ${order.sum_goods}, ${order.sum}, ${mileageVal}, '${dateStr}', '${dateStr}', '${completedStr}', '${completedStr}', '${TENANT_ID}', '${clientId}', '${vehicleId}');`);

    stats.orders++;

    // Позиции
    const detail = orderDetails[order.number];
    if (detail) {
      for (const work of detail.works) {
        if (!work.name?.trim()) continue;
        const itemId = randomUUID();
        sql.push(`INSERT INTO work_order_items (id, type, description, quantity, "unitPrice", "totalPrice", "createdAt", "workOrderId")`);
        sql.push(`VALUES ('${itemId}', 'LABOR', '${esc(work.name.trim())}', ${work.qty}, ${work.price}, ${work.sum}, '${dateStr}', '${woId}');`);
        stats.laborItems++;
      }
      for (const good of detail.goods) {
        if (!good.name?.trim()) continue;
        const itemId = randomUUID();
        sql.push(`INSERT INTO work_order_items (id, type, description, quantity, "unitPrice", "totalPrice", "createdAt", "workOrderId")`);
        sql.push(`VALUES ('${itemId}', 'PART', '${esc(good.name.trim())}', ${good.qty}, ${good.price}, ${good.sum}, '${dateStr}', '${woId}');`);
        stats.partItems++;
      }
    }
  }


  // 5. Записываем файл
  fs.writeFileSync(OUTPUT_SQL_PATH, sql.join('\n'), 'utf-8');

  console.log(`
╔════════════════════════════════════════════╗
║   SQL-ФАЙЛ СГЕНЕРИРОВАН                  ║
╠════════════════════════════════════════════╣
║  Файл: ${OUTPUT_SQL_PATH.padEnd(33)}║
║  Размер: ${(fs.statSync(OUTPUT_SQL_PATH).size / 1024 / 1024).toFixed(1).padStart(6)} MB                       ║
╠────────────────────────────────────────────╣
║  Заказ-наряды: ${String(stats.orders).padStart(6)}                    ║
║  Пропущено (нет клиента): ${String(stats.skippedNoClient).padStart(5)}             ║
║  Пропущено (нет авто):    ${String(stats.skippedNoVehicle).padStart(5)}             ║
║  Пропущено (дубли):       ${String(stats.skippedDuplicate).padStart(5)}             ║
║  Работы (LABOR):  ${String(stats.laborItems).padStart(6)}                    ║
║  Запчасти (PART): ${String(stats.partItems).padStart(6)}                    ║
╚════════════════════════════════════════════╝

Следующие шаги:
  scp ${OUTPUT_SQL_PATH} root@178.72.139.156:/tmp/
  ssh root@178.72.139.156 "docker exec -i stocrm-postgres psql -U stocrm -d stocrm < /tmp/import-work-orders.sql"
`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
