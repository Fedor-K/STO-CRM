# CLAUDE.md — контекст для Claude Code

## О проекте

SaaS-платформа для управления автосервисами (СТО). Мультитенантная система с общей БД и `tenantId` для изоляции данных.

## Стек

- **Backend:** NestJS + TypeScript + Prisma 5 + PostgreSQL 16 + Redis + BullMQ
- **Frontend:** Next.js 14 (App Router) + shadcn/ui + Tailwind CSS + React Hook Form + Zod
- **Монорепо:** Turborepo
- **Инфраструктура:** Docker Compose, Selectel Cloud (СПб), S3 для файлов

## Структура

```
apps/api/          — NestJS backend
apps/web/          — Next.js frontend
packages/shared/   — Zod-схемы, типы, константы, i18n
packages/ui/       — общие UI-компоненты
docker/            — Dockerfile'ы и docker-compose
```

## Страницы фронтенда (admin)

| Маршрут | Файл | Описание |
|---------|------|----------|
| `/dashboard` | `app/(admin)/dashboard/page.tsx` | Дашборд с воронкой и статистикой |
| `/clients` | `app/(admin)/clients/page.tsx` | Клиенты — карточки с профилем |
| `/calendar` | `app/(admin)/calendar/page.tsx` | Недельный календарь записей (06:00–20:00) |
| `/work-orders` | `app/(admin)/work-orders/page.tsx` | Заказ-наряды (поиск по номеру, клиенту, авто) |
| `/work-orders/[id]` | `app/(admin)/work-orders/[id]/page.tsx` | Детали заказ-наряда |
| `/vehicles` | `app/(admin)/vehicles/page.tsx` | Автомобили (раскрывающиеся строки с историей ЗН) |
| `/services` | `app/(admin)/services/page.tsx` | Услуги |
| `/inventory` | `app/(admin)/inventory/page.tsx` | Склад |
| `/finance` | `app/(admin)/finance/page.tsx` | Финансы |
| `/employees` | `app/(admin)/employees/page.tsx` | Сотрудники (фильтр по ролям, CRUD, заменяет Users в навигации) |
| `/users` | `app/(admin)/users/page.tsx` | Пользователи (доступен по прямому URL) |

### Боковая панель (Sidebar)
- Сворачиваемая: `w-64` → `w-16`, состояние в localStorage (`sidebar-collapsed`)
- Иконки Heroicons для каждого пункта, тултипы при сворачивании
- Кнопка-шеврон внизу панели для сворачивания/разворачивания

### Заказ-наряды (`/work-orders`)
- **Поиск:** `&search=` — ищет по номеру ЗН, ФИО клиента, госномеру/марке/модели авто (бэкенд Prisma OR clause)
- **Табы позиций:** Работы (LABOR) и Материалы (PART) в раздельных вкладках вместо общего списка
- **Автокомплит:** выбор услуг и запчастей через searchable combobox

### Автомобили (`/vehicles`)
- Раскрывающиеся строки: клик по строке авто показывает историю заказ-нарядов

### Сотрудники (`/employees`)
- Заменяет «Пользователи» в навигации
- Фильтр по ролям: Все / MECHANIC / RECEPTIONIST / MANAGER / OWNER
- Поиск по ФИО
- Исключает CLIENT-роль из выдачи
- Создание: автогенерация email (`{random}@employee.local`) и пароля

### Календарь записей (`/calendar`)
- Недельная сетка Пн–Вс, 06:00–20:00, нативный Date + Tailwind (без внешних библиотек)
- API: `GET /appointments/calendar?from=...&to=...` — overlap-запрос (`scheduledStart < to AND scheduledEnd > from`)
- Пересекающиеся записи раздвигаются по горизонтали (column layout)
- Цвет блока по статусу: PENDING=жёлтый, CONFIRMED=синий, IN_PROGRESS=зелёный, COMPLETED=серый
- Клик по блоку → модалка с деталями + смена статуса + создание заказ-наряда

## Реализованные фичи

### Клиенты / Пользователи
- 3 поля ФИО: Фамилия, Имя, Отчество (`lastName`, `firstName`, `middleName`)
- Дата рождения (`dateOfBirth`)
- Уникальность: телефон, email — per-tenant (частичные уникальные индексы)

### Автомобили
- Уникальность VIN и госномера — per-tenant (частичные уникальные индексы)
- Пробег (`mileage`) — редактируется из заказ-наряда, только в большую сторону

### Заказ-наряды
- **Статусы:** NEW → DIAGNOSED → APPROVED → IN_PROGRESS → PAUSED → COMPLETED → INVOICED → PAID → CLOSED (+ CANCELLED)
- **Механик обязателен** для любого перехода вперёд (кроме CANCELLED) из статусов NEW–PAUSED. Валидация и на бэкенде, и на фронтенде (кнопка `disabled`)
- **Механик на уровне работы:** каждая LABOR-позиция может иметь своего мастера (`work_order_items.mechanicId`). По умолчанию подставляется мастер заказ-наряда
- **Рекомендованные работы:** флаг `recommended` + `approvedByClient` (null=ожидание, true=одобрено, false=отклонено). Неодобренные НЕ входят в `totalAmount`
- **Пробег:** отображается в карточке автомобиля, редактируется на всех этапах

### Лист осмотра (45 пунктов)
- 6 групп: электрооборудование, передняя/задняя подвеска, моторный отсек, колёса, тормозная система
- `SLIDER_CONFIG` — per-item конфигурация ползунков (уровни жидкостей 0–100%, влага тормозной жидкости 0–5%, остаток колодок 0–100%)
- Цветовая индикация: зелёный/жёлтый/красный в зависимости от значения

### Миграции (создаются вручную)
- Нет локального подключения к БД — миграции пишутся руками (SQL файлы), применяются на деплое через `prisma migrate deploy`
- Prisma generate запускается из `apps/api/` (Prisma 5.22, не 7)

## Правила кодирования

### Язык
- **Код** (переменные, функции, классы, endpoints, enum'ы в БД) — на английском
- **Всё, что видит пользователь** (UI, ошибки API, валидация, подсказки) — на русском
- Строки UI берутся из `packages/shared/src/i18n/ru.ts`

### Архитектура
- Каждый NestJS-модуль = один домен (auth, users, vehicles, booking, work-orders, inventory, finance)
- Tenant scoping через Prisma client extensions — автофильтрация по `tenantId`
- RBAC через guards + decorators (`@Roles('work-orders:create')`)
- JWT access (15min) + refresh (7d, httpOnly cookie)
- Zod-схемы валидации шарятся между фронтом и бэком через `packages/shared`

### API
- REST, все эндпоинты под `/api/v1/`
- Пагинация: `?page=1&limit=20&sort=createdAt&order=desc`
- Ответ: `{ data: [...], meta: { total, page, limit, totalPages } }`
- Ошибки: `{ statusCode, error, message, details: [{ field, message }] }`
- OpenAPI/Swagger на `/api/docs`

### БД
- PostgreSQL 16, Prisma ORM
- Все tenant-scoped таблицы имеют `tenantId` + индекс
- Деньги — `Decimal(12, 2)`, никогда float
- Цены запчастей в WorkOrderPart — снэпшот на момент использования
- Нумерация заказ-нарядов — `WO-00001`, последовательная по тенанту

### Провайдеры (абстракции)
- `MessagingProvider` — WhatsApp / Telegram / SMS / Email (не привязываемся к одному каналу)
- `TelephonyProvider` — Mango Office / Sipuni / UIS
- `FiscalProvider` — АТОЛ Онлайн / Эвотор (касса 54-ФЗ)

## Деплой

- **Сервер:** Selectel, СПб, IP: 178.72.139.156
- **ОС:** Ubuntu 24.04 LTS, 4 vCPU, 16 GB RAM, 80 GB SSD
- **SSH:** `ssh root@178.72.139.156` (ключ Lucinda)
- **Стек на сервере:** Docker Compose (PostgreSQL + Redis + API + Web + Nginx)
- **Файлы:** Selectel S3
- **CI/CD:** GitHub Actions — автодеплой при пуше в main

## Бэкапы

- **Хранилище:** Selectel S3 (`stocrm.backups`, ru-3, холодный класс)
- **Расписание:** Ежедневно в 3:00 UTC (6:00 МСК)
- **Ротация:** daily/ — последние 7 дней, weekly/ — воскресные бэкапы
- **Скрипты:** `scripts/backup.sh`, `scripts/restore.sh`
- **Логи:** `/var/log/stocrm-backup.log`

```bash
# Ручной бэкап
ssh root@178.72.139.156 "/opt/STO-CRM/scripts/backup.sh"

# Список бэкапов и восстановление
ssh root@178.72.139.156 "/opt/STO-CRM/scripts/restore.sh"
ssh root@178.72.139.156 "/opt/STO-CRM/scripts/restore.sh daily/stocrm_2026-02-05_09-14.sql.gz"
```

## Интеграция с 1С

### Сервер 1С
- **IP:** 185.222.161.252, Windows Server
- **SSH:** `Administrator@185.222.161.252`
- **1С:** база `D:\Base`, пользователь `Администратор`
- **API Gateway:** FastAPI + COM-коннектор, `C:\temp\api_gateway.py`, порт 8080
- **Запуск:** scheduled task `API-Gateway` (пользователь `VDSKA\22Linia1`)
- **Python:** `C:\Python311-32\python.exe` (32-bit для COM)

### Импортированные данные (из 1С → STO-CRM)
- **Клиенты:** 6,470
- **Автомобили:** ~8,900
- **Заказ-наряды:** 24,175 (из 25,201 в 1С — 1,026 пропущены из-за отсутствия привязки к авто)
- **Сотрудники:** 37 (MECHANIC-роль)
- **Механики на ЗН:** 21,222 из 24,175 привязаны к мастеру
- **Услуги:** импортированы из 1С + нормочасы

### Верификация данных (проведена 2026-02-06)
- Суммы ЗН: 0 расхождений (пересчитаны из позиций)
- Механики: 0 несовпадений имён
- Клиенты: 6,470 из 1С + 3 ручных = 6,473 в CRM

### Скрипты импорта (`scripts/`)
| Скрипт | Описание |
|--------|----------|
| `import-1c-data.ts` | Основной импорт данных из 1С JSON |
| `import-employees.ts` | Импорт сотрудников с генерацией email/пароля |
| `import-services-1c.ts` | Импорт услуг из 1С |
| `import-parts.ts` | Импорт запчастей |
| `import-work-orders.ts` | Импорт заказ-нарядов (API-версия) |
| `import-work-orders-sql.ts` | Импорт заказ-нарядов (SQL-версия, основная) |

## Юридические требования (РФ)

- **152-ФЗ:** все ПДн хранятся только на серверах в РФ. Никаких зарубежных облаков для данных.
- **54-ФЗ:** фискализация через АТОЛ Онлайн. НДС 22% с 2026. ФФД 1.2.
- Запрещены: Vercel, AWS, GCP, Supabase, Firebase, PlanetScale.

## Бизнес-контекст (OneMotors — первый клиент)

### Роли
- SUPERADMIN — управление платформой
- OWNER — владелец СТО
- MANAGER — менеджер
- RECEPTIONIST — мастер-приёмщик
- MECHANIC — механик
- CLIENT — клиент

### Ключевой бизнес-процесс
Приём авто -> Диагностика -> Согласование -> Работа -> Контроль качества -> Выдача -> Follow-up (2 дня)

### Обязательно
- 6+ фото при приёмке (кузов, одометр, проблемный узел)
- 4 статуса клиенту (принятие, диагностика, согласование, готовность)
- Правило >5%: при изменении цены больше 5% — блокировка до повторного согласования
- KPI приёмщика: 5 метрик, порог 90%
- Зарплата: оклад 50k + % от маржи по ступеням (0-6%)
- Follow-up задача через 2 дня после выдачи

## Полезные команды

```bash
# Локальная разработка
docker compose -f docker/docker-compose.yml up -d    # Поднять PostgreSQL + Redis
pnpm install                                          # Установить зависимости
pnpm dev                                              # Запустить все приложения

# Деплой на сервер
ssh root@178.72.139.156
docker compose -f docker/docker-compose.prod.yml up -d

# Prisma
cd apps/api && npx prisma migrate dev                 # Применить миграции
cd apps/api && npx prisma db seed                     # Заполнить тестовыми данными
cd apps/api && npx prisma studio                      # GUI для БД
```

## Ссылки

- **Репозиторий:** https://github.com/Fedor-K/STO-CRM
- **План:** [PLAN.md](./PLAN.md)
