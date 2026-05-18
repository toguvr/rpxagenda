import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@rpx/shared';

export const ROLES_KEY = 'roles';

/**
 * Restringe um handler a uma lista de papéis. Aplicado em conjunto com RolesGuard.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
