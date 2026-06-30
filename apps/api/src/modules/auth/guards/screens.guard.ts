import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { READ_PROTECTED_SCREEN_KEYS, type ScreenKey } from '@rpx/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SCREEN_KEY } from '../decorators/screen.decorator';
import type { RequestUser } from '../types';

const READ_PROTECTED = new Set<string>(READ_PROTECTED_SCREEN_KEYS);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard de permissão por tela do admin. Roda após JwtAuthGuard e RolesGuard.
 *
 * - Handler/controller sem @Screen → liberado.
 * - @Public → liberado (convites e fluxos sem usuário).
 * - ADMIN → liberado (acesso total).
 * - PROFESSIONAL:
 *     - tem a permissão da tela → liberado (leitura e escrita).
 *     - não tem a permissão:
 *         - ESCRITA (POST/PATCH/PUT/DELETE) → bloqueado sempre.
 *         - LEITURA (GET) de tela NÃO sensível → liberado. Telas operacionais
 *           (pacientes, serviços, planos, profissionais, equipamentos, horários,
 *           agenda) são dados de referência consultados por outras telas, então
 *           a leitura é compartilhada — senão a Agenda/detalhe do paciente
 *           quebrariam ao montar dropdowns. A navegação no admin continua
 *           restrita pelo menu + guarda de rota.
 *         - LEITURA de tela sensível (Financeiro, iDFace) → bloqueado.
 * - Demais papéis (PATIENT) → liberado aqui (telas são conceito do admin; o
 *   acesso já é restringido por @Roles nos endpoints administrativos).
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
    if (user.role !== 'PROFESSIONAL') return true; // ADMIN e PATIENT não são gateados aqui

    if (user.permissions?.includes(required)) return true;

    const isRead = READ_METHODS.has(req.method.toUpperCase());
    if (isRead && !READ_PROTECTED.has(required)) return true;

    throw new ForbiddenException('Você não tem acesso a esta tela.');
  }
}
