import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { RequestUser } from '../types';

/**
 * Expõe `request.unitId` em rotas autenticadas a partir de `req.user.unitId`,
 * para uso em logs e em pontos onde o handler ainda não recebe `@CurrentUser()`.
 *
 * IMPORTANTE: este interceptor NÃO força automaticamente o filtro por `unitId`
 * nas queries do Prisma — é responsabilidade de cada `Service` de domínio garantir
 * que toda leitura/escrita escope por `currentUser.unitId`. A automação via Prisma
 * middleware fica para uma iteração futura (ver CLAUDE.md §6).
 */
@Injectable()
export class UnitScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser; unitId?: string }>();
    if (req.user?.unitId) {
      req.unitId = req.user.unitId;
    }
    return next.handle();
  }
}
