import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'node:crypto';
import { TypedConfigService } from '../../../config/typed-config.service';

/**
 * Guard do webhook iDFace — exige header `X-IDFace-Secret` igual ao
 * `IDFACE_WEBHOOK_SECRET`. Comparação em tempo constante para evitar timing
 * attacks (timingSafeEqual).
 */
@Injectable()
export class IdfaceWebhookGuard implements CanActivate {
  constructor(private readonly config: TypedConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const presentedRaw = req.header('x-idface-secret');
    if (!presentedRaw) {
      throw new UnauthorizedException('Webhook iDFace: header X-IDFace-Secret ausente.');
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
