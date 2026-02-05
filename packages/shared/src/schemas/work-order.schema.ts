import { z } from 'zod';

const workOrderStatusEnum = z.enum([
  'NEW',
  'DIAGNOSED',
  'APPROVED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'INVOICED',
  'PAID',
  'CLOSED',
  'CANCELLED',
]);

export const createWorkOrderSchema = z.object({
  clientId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  advisorId: z.string().uuid().optional(),
  mechanicId: z.string().uuid().optional(),
  repairTypeId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  clientComplaints: z.string().optional(),
  mileageAtIntake: z.number().int().min(0).optional(),
  fuelLevel: z.string().optional(),
});

export const updateWorkOrderSchema = z.object({
  mechanicId: z.string().uuid().optional(),
  advisorId: z.string().uuid().optional(),
  repairTypeId: z.string().uuid().optional(),
  clientComplaints: z.string().optional(),
  diagnosticNotes: z.string().optional(),
});

export const updateWorkOrderStatusSchema = z.object({
  status: workOrderStatusEnum,
});

export const createWorkOrderItemSchema = z.object({
  type: z.enum(['LABOR', 'PART']),
  description: z.string().min(1, 'Укажите описание'),
  quantity: z.number().min(0.01, 'Количество должно быть больше 0'),
  unitPrice: z.number().min(0, 'Цена не может быть отрицательной'),
  normHours: z.number().min(0).optional(),
  serviceId: z.string().uuid().optional(),
  partId: z.string().uuid().optional(),
  recommended: z.boolean().optional(),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type UpdateWorkOrderStatusInput = z.infer<typeof updateWorkOrderStatusSchema>;
export type CreateWorkOrderItemInput = z.infer<typeof createWorkOrderItemSchema>;
