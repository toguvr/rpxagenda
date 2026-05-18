import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@rpx/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestUser } from '../types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Permissão insuficiente para acessar este recurso');
    }
    return true;
  }
}
