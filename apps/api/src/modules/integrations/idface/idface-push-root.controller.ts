import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IdfacePushController } from './idface-push.controller';
import { IdfaceService } from './idface.service';

/**
 * Aliases dos endpoints de Push no caminho raiz `/push` e `/result`. O
 * `push_remote_address` do iDFace ControliD só aceita `host:porta` (sem path),
 * então o device sempre vai chamar a raiz. Esta classe apenas delega para o
 * `IdfacePushController` para evitar duplicação de lógica.
 */
@Controller()
export class IdfacePushRootController {
  constructor(
    private readonly push: IdfacePushController,
    private readonly idface: IdfaceService,
  ) {}

  @Public()
  @Get('push')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  pushAlias(@Query('deviceId') deviceId: string, @Query('uuid') uuid: string): Promise<unknown> {
    return this.push.push(deviceId, uuid);
  }

  @Public()
  @Post('result')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  resultAlias(
    @Body() body: Parameters<IdfacePushController['result']>[0],
    @Query('deviceId') deviceId?: string,
  ): Promise<{ ok: true }> {
    return this.push.result(body, deviceId);
  }

  /** Alias na raiz do `new_user_identified.fcgi` (modo Pro/online do iDFace). */
  @Public()
  @Post('new_user_identified.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  onlineIdentificationAlias(
    @Body()
    body: {
      device_id?: string;
      user_id?: string;
      time?: string;
      portal_id?: string;
    },
  ): Promise<unknown> {
    const portalId = Number.parseInt(body?.portal_id ?? '1', 10) || 1;
    const timeUnix = body?.time ? Number.parseInt(body.time, 10) : undefined;
    return this.idface.processOnlineIdentification({
      deviceId: body?.device_id ?? '',
      userId: body?.user_id ?? '',
      timeUnix: Number.isFinite(timeUnix) ? timeUnix : undefined,
      portalId,
    });
  }

  // -------- Handshake/keepalive do modo online (aliases na raiz) --------

  @Public()
  @Post('session_is_valid.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  sessionIsValidAlias(): { session_is_valid: true } {
    return { session_is_valid: true };
  }

  @Public()
  @Post('device_is_alive.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  deviceIsAliveAlias(): void {
    /* 200 vazio */
  }

  @Public()
  @Post('online.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  onlineAlias(): { online: true } {
    return { online: true };
  }

  @Public()
  @Post('check.fcgi')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  checkAlias(): { ok: true } {
    return { ok: true };
  }
}
