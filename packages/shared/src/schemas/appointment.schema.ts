import { z } from 'zod';

export const createAppointmentSchema = z.object({
  scheduledStart: z.string().datetime('Некорректная дата начала'),
  scheduledEnd: z.string().datetime('Некорректная дата окончания'),
  clientId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  advisorId: z.string().uuid().optional(),
  source: z.string().optional(),
  adChannel: z.string().optional(),
  notes: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  advisorId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
