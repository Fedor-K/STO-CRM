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
