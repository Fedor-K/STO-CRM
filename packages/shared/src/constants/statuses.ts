export const AppointmentStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;

export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const WorkOrderStatus = {
  NEW: 'NEW',
  DIAGNOSED: 'DIAGNOSED',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.NEW]: [WorkOrderStatus.DIAGNOSED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.DIAGNOSED]: [WorkOrderStatus.APPROVED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.APPROVED]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.IN_PROGRESS]: [WorkOrderStatus.PAUSED, WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.PAUSED]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.COMPLETED]: [WorkOrderStatus.INVOICED],
  [WorkOrderStatus.INVOICED]: [WorkOrderStatus.PAID],
  [WorkOrderStatus.PAID]: [WorkOrderStatus.CLOSED],
  [WorkOrderStatus.CLOSED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

export const StockMovementType = {
  PURCHASE: 'PURCHASE',
  CONSUMPTION: 'CONSUMPTION',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  RESERVED: 'RESERVED',
} as const;

export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const TransactionType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const RecommendationType = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const;

export type RecommendationType = (typeof RecommendationType)[keyof typeof RecommendationType];

export const RecommendationStatus = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  DEFERRED: 'DEFERRED',
  DECLINED: 'DECLINED',
} as const;

export type RecommendationStatus = (typeof RecommendationStatus)[keyof typeof RecommendationStatus];

export const FollowUpResult = {
  DONE: 'DONE',
  RESCHED: 'RESCHED',
  DECLINE: 'DECLINE',
  NO_ANSWER: 'NO_ANSWER',
} as const;

export type FollowUpResult = (typeof FollowUpResult)[keyof typeof FollowUpResult];
