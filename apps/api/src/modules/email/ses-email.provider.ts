import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { TypedConfigService } from '../../config/typed-config.service';
import type { IEmailProvider, SendEmailInput } from './email.types';

/**
 * Envio via AWS SES. Credenciais vêm da cadeia padrão do AWS SDK (mesmas chaves
 * do S3) e precisam de `ses:SendEmail`. O remetente (`SES_FROM_EMAIL`) tem que ser
 * uma identidade verificada no SES, e em sandbox o destinatário também.
 */
@Injectable()
export class SesEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(SesEmailProvider.name);
  private readonly from?: string;
  private readonly client: SESClient;

  constructor(config: TypedConfigService) {
    this.from = config.get('SES_FROM_EMAIL');
    this.client = new SESClient({ region: config.get('SES_REGION') });
  }

  isConfigured(): boolean {
    return !!this.from;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.from) {
      // Não configurado: apenas loga (não quebra o fluxo de quem chamou).
      this.logger.warn(
        { to: input.to, subject: input.subject },
        'SES não configurado (SES_FROM_EMAIL ausente) — e-mail não enviado.',
      );
      return;
    }
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [input.to] },
        Message: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: input.html, Charset: 'UTF-8' },
            Text: { Data: input.text, Charset: 'UTF-8' },
          },
        },
      }),
    );
  }
}
