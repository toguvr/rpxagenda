import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TypedConfigService } from '../../config/typed-config.service';

interface AppVersionResponse {
  /** Versão mínima suportada (semver). Abaixo dela o app força atualização. */
  minVersion: string;
  /** Última versão publicada (informativo). */
  latestVersion: string;
  /** Links da loja para o botão "Atualizar". */
  ios: string;
  android: string;
}

/**
 * Endpoint público consultado pelo app mobile no início para decidir se a versão
 * instalada ainda é suportada (forced update). Não exige autenticação — o app
 * checa antes mesmo de logar.
 */
@ApiTags('app')
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly config: TypedConfigService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Versão mínima/última do app mobile + links da loja (forced update).' })
  get(): AppVersionResponse {
    return {
      minVersion: this.config.get('MOBILE_MIN_VERSION'),
      latestVersion: this.config.get('MOBILE_LATEST_VERSION'),
      ios: this.config.get('MOBILE_IOS_URL'),
      android: this.config.get('MOBILE_ANDROID_URL'),
    };
  }
}
