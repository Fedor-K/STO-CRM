import { UserRole } from './roles';

export const Permission = {
  // Тенанты
  'tenants:read': 'tenants:read',
  'tenants:create': 'tenants:create',
  'tenants:update': 'tenants:update',
  'tenants:delete': 'tenants:delete',

  // Пользователи
  'users:read': 'users:read',
  'users:create': 'users:create',
  'users:update': 'users:update',
  'users:delete': 'users:delete',

  // Автомобили
  'vehicles:read': 'vehicles:read',
  'vehicles:create': 'vehicles:create',
  'vehicles:update': 'vehicles:update',
  'vehicles:delete': 'vehicles:delete',

  // Услуги
  'services:read': 'services:read',
  'services:create': 'services:create',
  'services:update': 'services:update',
  'services:delete': 'services:delete',

  // Записи
  'appointments:read': 'appointments:read',
  'appointments:create': 'appointments:create',
  'appointments:update': 'appointments:update',
  'appointments:delete': 'appointments:delete',

  // Заказ-наряды
  'work-orders:read': 'work-orders:read',
  'work-orders:create': 'work-orders:create',
  'work-orders:update': 'work-orders:update',
  'work-orders:delete': 'work-orders:delete',

  // Склад
  'parts:read': 'parts:read',
  'parts:create': 'parts:create',
  'parts:update': 'parts:update',
  'parts:delete': 'parts:delete',

  // Финансы
  'finance:read': 'finance:read',
  'finance:create': 'finance:create',
  'finance:update': 'finance:update',

  // Отчёты
  'reports:read': 'reports:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPERADMIN]: Object.values(Permission),

  [UserRole.OWNER]: Object.values(Permission),

  [UserRole.MANAGER]: [
    Permission['users:read'],
    Permission['vehicles:read'],
    Permission['vehicles:create'],
    Permission['vehicles:update'],
    Permission['services:read'],
    Permission['services:create'],
    Permission['services:update'],
    Permission['appointments:read'],
    Permission['appointments:create'],
    Permission['appointments:update'],
    Permission['appointments:delete'],
    Permission['work-orders:read'],
    Permission['work-orders:create'],
    Permission['work-orders:update'],
    Permission['parts:read'],
    Permission['parts:create'],
    Permission['parts:update'],
    Permission['finance:read'],
    Permission['reports:read'],
  ],

  [UserRole.RECEPTIONIST]: [
    Permission['users:read'],
    Permission['vehicles:read'],
    Permission['vehicles:create'],
    Permission['vehicles:update'],
    Permission['services:read'],
    Permission['appointments:read'],
    Permission['appointments:create'],
    Permission['appointments:update'],
    Permission['work-orders:read'],
    Permission['work-orders:create'],
    Permission['work-orders:update'],
    Permission['parts:read'],
  ],

  [UserRole.MECHANIC]: [
    Permission['vehicles:read'],
    Permission['services:read'],
    Permission['work-orders:read'],
    Permission['work-orders:update'],
    Permission['parts:read'],
  ],

  [UserRole.CLIENT]: [
    Permission['vehicles:read'],
    Permission['vehicles:create'],
    Permission['services:read'],
    Permission['appointments:read'],
    Permission['appointments:create'],
    Permission['work-orders:read'],
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
