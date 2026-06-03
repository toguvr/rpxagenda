import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IdfaceWebhookGuard } from './idface-webhook.guard';
import { IdfaceDevicesService } from './idface-devices.service';
import { IdfaceEnrollmentsService } from './idface-enrollments.service';

interface ResultBody {
  uuid?: string;
  endpoint?: string;
  response?: unknown;
  error?: string;
}

/**
 * Endpoints públicos chamados pelo equipamento iDFace no modo Push (autenticados
 * pelo header X-IDFace-Secret, igual ao /access-event). O device:
 *   - chama GET /push periodicamente para receber o próximo comando da fila;
 *   - chama POST /result para reportar o resultado do comando que executou.
 * Cada comando é correlacionado pelo `uuid` que devolvemos no /push.
 */
@ApiTags('integrations/idface')
@Controller('webhooks/idface')
export class IdfacePushController {
  private readonly logger = new Logger(IdfacePushController.name);

  constructor(
    private readonly devices: IdfaceDevicesService,
    private readonly enrollments: IdfaceEnrollmentsService,
  ) {}

  @Public()
  @UseGuards(IdfaceWebhookGuard)
  @Get('push')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-IDFace-Secret', required: true })
  @ApiOperation({
    summary: 'Device pede o próximo comando da fila desta unidade. Retorna {} se não houver nada.',
  })
  async push(@Query('deviceId') deviceId: string): Promise<unknown> {
    if (!deviceId) return {};
    const device = await this.devices.findByDeviceId(deviceId);
    if (!device || !device.active) {
      this.logger.warn({ deviceId }, 'Push de device não registrado ou inativo — fila vazia.');
      return {};
    }
    await this.devices.touchLastSeen(device.id);
    const cmd = await this.enrollments.popNextCommand(device.unitId, deviceId);
    if (!cmd) return {};
    // O device espera o payload diretamente; embutimos o uuid no envelope.
    return { uuid: cmd.uuid, ...cmd.payload };
  }

  @Public()
  @UseGuards(IdfaceWebhookGuard)
  @Post('result')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-IDFace-Secret', required: true })
  @ApiOperation({
    summary: 'Device reporta o resultado de um comando previamente entregue no /push.',
  })
  async result(@Body() body: ResultBody): Promise<{ ok: true }> {
    const uuid = body?.uuid;
    if (!uuid) {
      this.logger.warn({ body }, 'Result sem uuid — ignorando.');
      return { ok: true };
    }
    await this.enrollments.recordResult({
      uuid,
      response: body.response,
      error: body.error,
    });
    return { ok: true };
  }
}
