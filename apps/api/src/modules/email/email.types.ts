/**
 * Abstração de envio de e-mail (provider pattern — CLAUDE.md §2.2/§2.3).
 * Implementação inicial: AWS SES. Trocar de provedor não afeta a regra de negócio.
 */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface IEmailProvider {
  /** True se o e-mail está configurado (remetente definido). */
  isConfigured(): boolean;
  /** Envia um e-mail. Lança em falha — o caller decide se trata como best-effort. */
  send(input: SendEmailInput): Promise<void>;
}
