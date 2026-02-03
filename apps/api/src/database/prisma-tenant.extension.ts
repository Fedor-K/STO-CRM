import { Prisma } from '@prisma/client';

/**
 * Prisma client extension для автоматической фильтрации по tenantId.
 * Использование: prisma.$extends(tenantExtension(tenantId))
 */
export function tenantExtension(tenantId: string) {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      query: {
        $allModels: {
          async findMany({ args, query, model }) {
            if (hasTenantId(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async findFirst({ args, query, model }) {
            if (hasTenantId(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async count({ args, query, model }) {
            if (hasTenantId(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async create({ args, query, model }) {
            if (hasTenantId(model)) {
              (args.data as any).tenantId = tenantId;
            }
            return query(args);
          },
          async update({ args, query, model }) {
            if (hasTenantId(model)) {
              args.where = { ...args.where, tenantId } as any;
            }
            return query(args);
          },
          async delete({ args, query, model }) {
            if (hasTenantId(model)) {
              args.where = { ...args.where, tenantId } as any;
            }
            return query(args);
          },
        },
      },
    });
  });
}

// Модели с tenantId (все кроме RefreshToken)
const TENANT_MODELS = new Set([
  'Tenant',
  'User',
  'Vehicle',
  'Service',
  'RepairType',
  'ServiceBay',
  'Appointment',
  'WorkOrder',
  'Part',
  'PurchaseOrder',
  'Transaction',
]);

function hasTenantId(model: string | undefined): boolean {
  return model !== undefined && TENANT_MODELS.has(model);
}
