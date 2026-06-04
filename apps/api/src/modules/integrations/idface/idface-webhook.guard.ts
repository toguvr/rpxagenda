import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'node:crypto';
import { TypedConfigService } from '../../../config/typed-config.service';

/**
 * Guard do webhook iDFace — exige o segredo `IDFACE_WEBHOOK_SECRET` em uma de
 * duas formas, nesta ordem de preferência:
 *  1. Header `X-IDFace-Secret` (forma canônica, usada pelo modo Push).
 *  2. Query string `?secret=...` (fallback para o `monitor` da ControliD, cujo
 *     firmware nem sempre suporta header customizado no webhook de eventos).
 * Comparação em tempo constante (timingSafeEqual) em qualquer dos casos.
 */
@Injectable()
export class IdfaceWebhookGuard implements CanActivate {
  constructor(private readonly config: TypedConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const fromHeader = req.header('x-idface-secret');
    const fromQuery = typeof req.query?.secret === 'string' ? req.query.secret : undefined;
    const presentedRaw = fromHeader ?? fromQuery;
    if (!presentedRaw) {
      throw new UnauthorizedException(
        'Webhook iDFace: forneça o segredo via header X-IDFace-Secret ou query ?secret=.',
      );
    }
    const expected = this.config.get('IDFACE_WEBHOOK_SECRET');
    const presented = Buffer.from(presentedRaw, 'utf-8');
    const expectedBuf = Buffer.from(expected, 'utf-8');
    if (presented.length !== expectedBuf.length) {
      throw new UnauthorizedException('Webhook iDFace: segredo inválido.');
    }
    if (!crypto.timingSafeEqual(presented, expectedBuf)) {
      throw new UnauthorizedException('Webhook iDFace: segredo inválido.');
    }
    return true;
  }
}
