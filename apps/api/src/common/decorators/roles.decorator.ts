import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Декоратор для указания требуемых разрешений.
 * Использование: @Roles('work-orders:create', 'work-orders:update')
 */
export const Roles = (...permissions: string[]) => SetMetadata(ROLES_KEY, permissions);
