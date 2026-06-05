import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IdfaceDevicesService } from './idface-devices.service';
import { IdfaceEnrollmentsService } from './idface-enrollments.service';

interface ResultBody {
  uuid?: string;
  endpoint?: string;
  response?: unknown;
  error?: string;
}

/**
 * Endpoints públicos chamados pelo equipamento iDFace no modo Push. O device:
 *   - chama GET /push?deviceId=&uuid= periodicamente para receber o próximo
 *     comando da fila;
 *   - chama POST /result?deviceId= para reportar o resultado do comando.
 *
 * PREMISSA: o protocolo Push da ControliD NÃO permite header nem query custom
 * (o `push_remote_address` aceita só host:porta), então estes endpoints não
 * usam o IdfaceWebhookGuard — a autenticação é o próprio `deviceId` (device
 * desconhecido/inativo recebe fila vazia). O `uuid` que o DEVICE gera no /push
 * é a chave de correlação devolvida no /result.
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
  @Get('push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Device pede o próximo comando da fila desta unidade. Retorna {} se não houver nada.',
  })
  async push(@Query('deviceId') deviceId: string, @Query('uuid') uuid: string): Promise<unknown> {
    if (!deviceId) return {};
    const device = await this.devices.findByDeviceId(deviceId);
    if (!device || !device.active) {
      this.logger.warn({ deviceId }, 'Push de device não registrado ou inativo — fila vazia.');
      return {};
    }
    await this.devices.touchLastSeen(device.id);
    // Sem uuid não há como correlacionar o /result — devolve fila vazia.
    if (!uuid) return {};
    const payload = await this.enrollments.popNextCommand(device.unitId, deviceId, uuid);
    // O device espera o comando diretamente: { verb, endpoint, body, contentType }.
    return payload ?? {};
  }

  @Public()
  @Post('result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Device reporta o resultado de um comando previamente entregue no /push.',
  })
  async result(
    @Body() body: ResultBody,
    @Query('deviceId') deviceId?: string,
  ): Promise<{ ok: true }> {
    if (deviceId) {
      const device = await this.devices.findByDeviceId(deviceId);
      if (!device || !device.active) {
        this.logger.warn({ deviceId }, 'Result de device não registrado ou inativo — ignorando.');
        return { ok: true };
      }
    }
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
