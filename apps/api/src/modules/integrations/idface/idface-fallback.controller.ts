import { All, Controller, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Fallback para QUALQUER caminho `.fcgi` sob `/webhooks/idface` que ainda não
 * tenha handler explícito. O iDFace, no modo online, bate em vários endpoints de
 * keepalive (session_is_valid, device_is_alive, online, check, …) e **desativa o
 * modo online se algum responder erro/404**. Como o protocolo desses endpoints é
 * interno (não documentado pela ControliD), respondemos 200 `{}` a qualquer um
 * desconhecido e logamos o caminho — assim o totem nunca cai por um 404 e a gente
 * descobre exatamente quais endpoints implementar de verdade.
 *
 * IMPORTANTE: este controller é registrado POR ÚLTIMO no IdfaceModule, então os
 * handlers explícitos (new_user_identified, result, access-event, session_is_valid
 * etc.) têm precedência — o wildcard só pega o que sobra.
 */
@Controller('webhooks/idface')
export class IdfaceFallbackController {
  private readonly logger = new Logger(IdfaceFallbackController.name);

  @Public()
  @All('*')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  fallback(@Req() req: Request): Record<string, never> {
    this.logger.warn(
      { method: req.method, path: req.originalUrl },
      'iDFace bateu em endpoint sem handler explícito — respondendo 200 {} (keepalive).',
    );
    return {};
  }
}
