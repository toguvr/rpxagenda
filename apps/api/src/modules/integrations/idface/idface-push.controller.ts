import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IdfaceDevicesService } from './idface-devices.service';
import { IdfaceEnrollmentsService } from './idface-enrollments.service';

interface TransactionResult {
  transactionid?: string | number;
  success?: boolean;
  response?: unknown;
  error?: string;
}

interface ResultBody {
  // Forma do protocolo Push: resultados em lote por transactionid.
  transactions_results?: TransactionResult[];
  // Forma single legada (alguns firmwares): uuid + response/error.
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
    const cmd = await this.enrollments.popNextCommand(device.unitId, deviceId);
    if (!cmd) {
      // Polls vazios são a maioria (device pergunta a cada poucos seg) — debug
      // para não afogar o log de eventos reais (comando entregue / result).
      this.logger.debug({ deviceId, uuid }, 'Push poll — fila vazia.');
      return {};
    }
    this.logger.log(
      { deviceId, transactionid: cmd.transactionid, endpoint: cmd.payload.endpoint },
      'Push poll — comando entregue.',
    );
    // Formato esperado pelo firmware: array `transactions`, cada item com um
    // `transactionid` que o device devolve em `transactions_results` no /result.
    return {
      transactions: [{ transactionid: cmd.transactionid, ...cmd.payload }],
    };
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
    // Forma em lote (protocolo Push): transactions_results[].
    if (Array.isArray(body?.transactions_results) && body.transactions_results.length > 0) {
      for (const tr of body.transactions_results) {
        if (tr?.transactionid === undefined || tr?.transactionid === null) continue;
        await this.enrollments.recordResult({
          transactionid: String(tr.transactionid),
          success: tr.success,
          response: tr.response,
          error: tr.error,
        });
      }
      return { ok: true };
    }
    // Forma single legada: uuid (tratado como transactionid).
    if (body?.uuid) {
      await this.enrollments.recordResult({
        transactionid: body.uuid,
        response: body.response,
        error: body.error,
      });
      return { ok: true };
    }
    this.logger.warn({ body }, 'Result sem transactions_results nem uuid — ignorando.');
    return { ok: true };
  }
}
