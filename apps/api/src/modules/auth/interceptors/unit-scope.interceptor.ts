import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import type { Observable } from 'rxjs';
import { CLS_KEYS } from '../../../common/cls/cls-keys';
import type { RequestUser } from '../types';

/**
 * Para cada request autenticado:
 * - propaga `unitId` e `userId` no CLS (AsyncLocalStorage), permitindo que a
 *   extensão Prisma `buildUnitScopeExtension` injete `where: { unitId }` em todas
 *   as queries de modelos multi-tenant sem que o caller precise passar manualmente.
 * - expõe `request.unitId` para conveniência em handlers que ainda não migraram
 *   para `@CurrentUser()`.
 *
 * Em rotas públicas (login, refresh, health) o user é undefined; nada é setado e a
 * extensão Prisma vira no-op. Para queries cross-unit explícitas em background, ver
 * `runWithoutUnitScope` em `cls-helpers.ts`.
 */
@Injectable()
export class UnitScopeInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; unitId?: string }>();
    if (req.user?.unitId) {
      req.unitId = req.user.unitId;
      if (this.cls.isActive()) {
        this.cls.set(CLS_KEYS.UNIT_ID, req.user.unitId);
        this.cls.set(CLS_KEYS.USER_ID, req.user.id);
        this.cls.set(CLS_KEYS.ROLE, req.user.role);
      }
    }
    return next.handle();
  }
}
