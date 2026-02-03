import { z } from 'zod';

const userRoleEnum = z.enum([
  'SUPERADMIN',
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'MECHANIC',
  'CLIENT',
]);

export const createUserSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  role: userRoleEnum,
  firstName: z.string().min(1, 'Укажите имя'),
  lastName: z.string().min(1, 'Укажите фамилию'),
  phone: z.string().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Некорректный email').optional(),
  role: userRoleEnum.optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
