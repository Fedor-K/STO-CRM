# STO-CRM

SaaS-платформа для управления автосервисами (СТО). Мультитенантная система с общей БД и изоляцией данных по `tenantId`.

## Стек

| Слой | Технология |
|------|-----------|
| **Backend** | NestJS + TypeScript + Prisma 5 + PostgreSQL 16 + Redis + BullMQ |
| **Frontend** | Next.js 14 (App Router) + shadcn/ui + Tailwind CSS + React Hook Form + Zod |
| **Монорепо** | Turborepo + pnpm |
| **Инфра** | Docker Compose, Selectel Cloud (СПб), S3 |

## Структура проекта

```
apps/
  api/             NestJS backend (REST API, Prisma, JWT auth)
  web/             Next.js frontend (App Router, shadcn/ui)
packages/
  shared/          Zod-схемы, типы, константы, i18n
  ui/              Общие UI-компоненты
docker/            Dockerfile'ы и docker-compose
docs/              Документация
```

## Быстрый старт

```bash
# Поднять PostgreSQL + Redis
docker compose -f docker/docker-compose.yml up -d

# Установить зависимости
pnpm install

# Применить миграции и заполнить тестовыми данными
cd apps/api && npx prisma migrate dev && npx prisma db seed && cd ../..

# Запустить все приложения
pnpm dev
```

- **API:** http://localhost:4000
- **Web:** http://localhost:3000
- **Swagger:** http://localhost:4000/api/docs

## Основные модули

| Модуль | Описание |
|--------|---------|
| **Auth** | JWT access (15 мин) + refresh (7 дней, httpOnly cookie) |
| **Users** | Персонал и клиенты, RBAC через guards + decorators |
| **Vehicles** | Автомобили клиентов (марка, модель, VIN, пробег) |
| **Appointments** | Запись на обслуживание, календарь, свободные слоты |
| **Work Orders** | Заказ-наряды, позиции (работы + запчасти), Kanban |
| **Dashboard** | Статистика, воронка клиентов (от обращения до выдачи) |

## Роли

| Роль | Область |
|------|---------|
| SUPERADMIN | Управление платформой и тенантами |
| OWNER | Полный доступ к своему СТО |
| MANAGER | Расписание, назначение работ, отчёты |
| RECEPTIONIST | Приём авто, создание заказ-нарядов |
| MECHANIC | Свои заказ-наряды, логирование работ |
| CLIENT | Запись, свои авто, история заказов |

## Воронка клиентов

Единый поток клиента от первичного обращения до выдачи автомобиля:

```
Обращение → Записан → Приёмка → Диагностика → Согласование → В работе → Готов → Выдан
```

Объединяет записи (Appointment) и заказ-наряды (WorkOrder) на одной Kanban-доске.

## API

REST API, все эндпоинты под `/api/v1/`. OpenAPI/Swagger на `/api/docs`.

```
GET    /api/v1/dashboard/stats       Статистика
GET    /api/v1/dashboard/funnel      Воронка клиентов
CRUD   /api/v1/users                 Пользователи
CRUD   /api/v1/vehicles              Автомобили
CRUD   /api/v1/appointments          Записи
CRUD   /api/v1/work-orders           Заказ-наряды
CRUD   /api/v1/services              Каталог услуг
```

Пагинация: `?page=1&limit=20&sort=createdAt&order=desc`

## Деплой

```bash
ssh root@178.72.139.156
docker compose -f docker/docker-compose.prod.yml up -d
```

Сервер: Selectel, Санкт-Петербург — Ubuntu 24.04, 4 vCPU, 16 GB RAM.

Все данные хранятся на серверах в РФ (152-ФЗ).

## Требования

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose
- PostgreSQL 16
- Redis 7

## Лицензия

Proprietary. All rights reserved.
