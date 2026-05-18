import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca um controller ou handler como público (sem JwtAuthGuard).
 * Use com moderação — todo endpoint não-público é autenticado por padrão.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
