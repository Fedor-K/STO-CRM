export const UserRole = {
  SUPERADMIN: 'SUPERADMIN',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  MECHANIC: 'MECHANIC',
  CLIENT: 'CLIENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const TENANT_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.RECEPTIONIST,
  UserRole.MECHANIC,
  UserRole.CLIENT,
];

export const STAFF_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.RECEPTIONIST,
  UserRole.MECHANIC,
];
