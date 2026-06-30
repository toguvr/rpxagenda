import { SetMetadata } from '@nestjs/common';
import type { ScreenKey } from '@rpx/shared';

export const SCREEN_KEY = 'screen';

/**
 * Restringe um controller/handler a uma tela do admin. ADMIN sempre passa;
 * PROFESSIONAL só passa se a tela estiver em suas permissões. Endpoints @Public
 * e papéis sem o conceito de tela (PATIENT) não são afetados.
 *
 * Aplicar tipicamente no nível do controller (toda a área da tela).
 */
export const Screen = (screen: ScreenKey): MethodDecorator & ClassDecorator =>
  SetMetadata(SCREEN_KEY, screen);
