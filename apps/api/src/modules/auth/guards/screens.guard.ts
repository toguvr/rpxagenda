import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ScreenKey } from '@rpx/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SCREEN_KEY } from '../decorators/screen.decorator';
import type { RequestUser } from '../types';

/**
 * Guard de permissão por tela do admin. Roda após JwtAuthGuard e RolesGuard.
 *
 * - Handler/controller sem @Screen → liberado.
 * - @Public → liberado (convites e fluxos sem usuário).
 * - ADMIN → liberado (acesso total).
 * - PROFESSIONAL → liberado apenas se a tela estiver em `user.permissions`.
 * - Demais papéis → liberado aqui (telas são conceito do admin; o acesso já é
 *   restringido por @Roles nos endpoints administrativos).
 */
@Injectable()
export class ScreensGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<ScreenKey | undefined>(SCREEN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }
    if (user.role === 'ADMIN') return true;
    if (user.role === 'PROFESSIONAL') {
      if (user.permissions?.includes(required)) return true;
      throw new ForbiddenException('Você não tem acesso a esta tela.');
    }
    return true;
  }
}
