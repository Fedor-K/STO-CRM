import { z } from 'zod';

export const createVehicleSchema = z.object({
  make: z.string().min(1, 'Укажите марку'),
  model: z.string().min(1, 'Укажите модель'),
  year: z.number().int().min(1900).max(2100).optional(),
  vin: z.string().max(17).optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  mileage: z.number().int().min(0).optional(),
  clientId: z.string().uuid(),
});

export const updateVehicleSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  vin: z.string().max(17).optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  mileage: z.number().int().min(0).optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
