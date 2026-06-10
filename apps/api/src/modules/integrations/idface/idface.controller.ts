import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  idfaceWebhookPayloadSchema,
  type IdfaceWebhookPayload,
  type IdfaceWebhookResponse,
} from '@rpx/shared';
import { Public } from '../../auth/decorators/public.decorator';
import { ZodValidationPipe } from '../../auth/pipes/zod-validation.pipe';
import { IdfaceWebhookGuard } from './idface-webhook.guard';
import { IdfaceService } from './idface.service';

interface OnlineIdentificationBody {
  device_id?: string;
  user_id?: string;
  time?: string;
  portal_id?: string;
  uuid?: string;
  event?: string;
}

@ApiTags('integrations/idface')
@Controller('webhooks/idface')
export class IdfaceController {
  private readonly logger = new Logger(IdfaceController.name);

  constructor(private readonly idface: IdfaceService) {}

  /**
   * Modo Pro/online do iDFace. O equipamento chama este endpoint (form-urlencoded)
   * a cada identificação e usa a resposta `{ result: { event, actions } }` para
   * liberar (event 7 + action door) ou negar (event 6) a entrada. Público e sem
   * guard pelo mesmo motivo do Push: o device não envia header/segredo custom.
   */
  @Public()
  @Post('new_user_identified.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async onlineIdentification(@Body() body: OnlineIdentificationBody): Promise<unknown> {
    const deviceId = body?.device_id ?? '';
    const userId = body?.user_id ?? '';
    const portalId = Number.parseInt(body?.portal_id ?? '1', 10) || 1;
    const timeUnix = body?.time ? Number.parseInt(body.time, 10) : undefined;
    this.logger.log({ deviceId, userId, portalId }, 'iDFace online identification recebida.');
    return this.idface.processOnlineIdentification({
      deviceId,
      userId,
      timeUnix: Number.isFinite(timeUnix) ? timeUnix : undefined,
      portalId,
    });
  }

  // -------- Handshake/keepalive do modo online --------
  // O iDFace só se considera ONLINE se o servidor responder a estes endpoints.
  // Enquanto recebem 404 o totem fica "offline" e nunca chama new_user_identified.

  @Public()
  @Post('session_is_valid.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  sessionIsValid(): { session_is_valid: true } {
    return { session_is_valid: true };
  }

  @Public()
  @Post('device_is_alive.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  deviceIsAlive(): void {
    /* 200 vazio — keepalive do device */
  }

  @Public()
  @Post('online.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  online(): { online: true } {
    return { online: true };
  }

  @Public()
  @Post('check.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  check(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @UseGuards(IdfaceWebhookGuard)
  @Post('access-event')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook do equipamento iDFace. Idempotente por (deviceId, timestamp, idfaceUserId). Não usa JWT — autenticado via header X-IDFace-Secret.',
  })
  @ApiHeader({ name: 'X-IDFace-Secret', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['idfaceUserId', 'deviceId', 'timestamp'],
      properties: {
        idfaceUserId: { type: 'string' },
        deviceId: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Resposta usada pelo equipamento para liberar/negar o catracão. accessGranted true/false + outcome enum.',
    schema: {
      type: 'object',
      properties: {
        accessGranted: { type: 'boolean' },
        outcome: { type: 'string' },
        appointmentId: { type: 'string', nullable: true },
        message: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'X-IDFace-Secret ausente ou inválido.' })
  receiveAccessEvent(
    @Body(new ZodValidationPipe(idfaceWebhookPayloadSchema)) body: IdfaceWebhookPayload,
  ): Promise<IdfaceWebhookResponse> {
    return this.idface.processEvent(body);
  }
}
