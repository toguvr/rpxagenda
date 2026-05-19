import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
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

@ApiTags('integrations/idface')
@Controller('webhooks/idface')
export class IdfaceController {
  constructor(private readonly idface: IdfaceService) {}

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
