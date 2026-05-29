import { Global, Module } from '@nestjs/common';
import { SesEmailProvider } from './ses-email.provider';
import { EMAIL_PROVIDER } from './email.types';

/** Provê o IEmailProvider (SES) globalmente. Trocar de provedor = trocar o useClass. */
@Global()
@Module({
  providers: [{ provide: EMAIL_PROVIDER, useClass: SesEmailProvider }],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
