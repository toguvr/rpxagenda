import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TypedConfigService } from '../../config/typed-config.service';
import {
  InvalidCredentialsException,
  PasswordResetInvalidException,
  RefreshTokenInvalidException,
} from '../../common/exceptions/app.exception';
import { EMAIL_PROVIDER, type IEmailProvider } from '../email/email.types';
import type { JwtAccessPayload, RequestUser } from './types';
import { effectiveScreens, type LoginResponse } from '@rpx/shared';

const REFRESH_TOKEN_BYTES = 48; // 384 bits
const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MINUTES = 30;
// Janela em que reapresentar um refresh recém-rotacionado é tratado como race
// de concorrência (várias abas/requisições simultâneas), e não como reuso
// malicioso. Dentro dela rejeitamos só a requisição; fora, revogamos tudo.
const ROTATION_GRACE_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: TypedConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      // Tempo constante: faz um hash dummy para evitar enumeração de usuários.
      await argon2.hash('dummy-password-to-equalize-timing');
      throw new InvalidCredentialsException();
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new InvalidCredentialsException();
    }
    return this.issueTokens(user);
  }

  async refresh(presentedRefreshToken: string): Promise<LoginResponse> {
    const tokenHash = this.hashRefreshToken(presentedRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) {
      throw new RefreshTokenInvalidException();
    }
    if (record.revokedAt) {
      const sinceRevokedMs = Date.now() - record.revokedAt.getTime();
      if (sinceRevokedMs <= ROTATION_GRACE_MS) {
        // Reuso quase-simultâneo = race (abas/requisições concorrentes), não
        // roubo. Rejeita só esta requisição, sem derrubar a sessão inteira.
        this.logger.log(
          { userId: record.userId, refreshTokenId: record.id, sinceRevokedMs },
          'Refresh recém-rotacionado reapresentado dentro do grace — rejeitando sem revogar tudo',
        );
        throw new RefreshTokenInvalidException('Refresh token já rotacionado');
      }
      // Reuso tardio → possível roubo. Revoga todos os tokens do usuário.
      this.logger.warn(
        { userId: record.userId, refreshTokenId: record.id },
        'Tentativa de reuso de refresh token revogado — revogando todos os tokens do usuário',
      );
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new RefreshTokenInvalidException('Refresh token já utilizado');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new RefreshTokenInvalidException('Refresh token expirado');
    }

    // Rotação atômica: revoga o atual e emite um novo dentro da mesma transação.
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      return this.issueTokens(record.user, tx);
    });
  }

  async logout(presentedRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(presentedRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Esqueci a senha: gera um token de redefinição e envia o link por e-mail.
   * Anti-enumeração — sempre resolve sem revelar se o e-mail existe. Falha de
   * envio é logada (best-effort), nunca propagada ao cliente.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return;

    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const url = `${this.config.get('ADMIN_PUBLIC_URL')}/reset-password?token=${token}`;
    const firstName = user.fullName.split(' ')[0];
    try {
      await this.email.send({
        to: user.email,
        subject: 'Redefinição de senha — RPX Agenda',
        text:
          `Olá, ${firstName}!\n\n` +
          `Recebemos um pedido para redefinir sua senha. Use o link abaixo ` +
          `(válido por ${RESET_TTL_MINUTES} minutos):\n${url}\n\n` +
          `Se não foi você, ignore este e-mail.`,
        html:
          `<p>Olá, <strong>${firstName}</strong>!</p>` +
          `<p>Recebemos um pedido para redefinir sua senha. O link abaixo é válido por ` +
          `${RESET_TTL_MINUTES} minutos:</p>` +
          `<p><a href="${url}">Redefinir minha senha</a></p>` +
          `<p>Se não foi você, ignore este e-mail.</p>`,
      });
    } catch (err) {
      this.logger.warn(
        { userId: user.id, err: err instanceof Error ? err.message : String(err) },
        'Falha ao enviar e-mail de redefinição de senha (pedido seguiu normalmente).',
      );
    }
  }

  /**
   * Redefine a senha a partir do token do e-mail. Consome o token (usedAt) e
   * revoga as sessões (refresh tokens) ativas do usuário por segurança.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new PasswordResetInvalidException();
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.logger.log({ userId: reset.userId }, 'Senha redefinida via recuperação.');
  }

  /**
   * Emite par access+refresh para um usuário recém-criado (sem passar por login).
   * Usado por fluxos como redenção de convite de paciente.
   */
  issueLoginTokens(user: {
    id: string;
    email: string;
    fullName: string;
    role: RequestUser['role'];
    unitId: string;
  }): Promise<LoginResponse> {
    return this.issueTokens(user);
  }

  // --- helpers ---

  private async issueTokens(
    user: {
      id: string;
      email: string;
      fullName: string;
      role: RequestUser['role'];
      unitId: string;
    },
    tx: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<LoginResponse> {
    const permissions = await this.resolvePermissions(user.id, user.role);
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      unitId: user.unitId,
      permissions,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    });
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.config.get('JWT_REFRESH_TTL_DAYS') * 24 * 60 * 60 * 1000,
    );
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        unitId: user.unitId,
        permissions,
      },
    };
  }

  /**
   * Telas que o usuário pode acessar no admin. ADMIN tem todas; PROFESSIONAL
   * recebe o subconjunto concedido (Professional.allowedScreens); PATIENT vazio.
   */
  private async resolvePermissions(userId: string, role: RequestUser['role']): Promise<string[]> {
    if (role === 'PROFESSIONAL') {
      const prof = await this.prisma.professional.findUnique({
        where: { userId },
        select: { allowedScreens: true },
      });
      return effectiveScreens('PROFESSIONAL', prof?.allowedScreens ?? []);
    }
    return effectiveScreens(role);
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  // SHA-256 do refresh token (HMAC com segredo dedicado). O segredo nunca sai do servidor.
  private hashRefreshToken(token: string): string {
    return crypto
      .createHmac('sha256', this.config.get('JWT_REFRESH_SECRET'))
      .update(token)
      .digest('hex');
  }
}
