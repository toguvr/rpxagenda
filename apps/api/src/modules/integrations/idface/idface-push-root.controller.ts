import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { IdfacePushController } from './idface-push.controller';

/**
 * Aliases dos endpoints de Push no caminho raiz `/push` e `/result`. O
 * `push_remote_address` do iDFace ControliD só aceita `host:porta` (sem path),
 * então o device sempre vai chamar a raiz. Esta classe apenas delega para o
 * `IdfacePushController` para evitar duplicação de lógica.
 */
@Controller()
export class IdfacePushRootController {
  constructor(private readonly push: IdfacePushController) {}

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
}
