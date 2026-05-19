import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TypedConfigService } from '../../config/typed-config.service';
import {
  InvalidCredentialsException,
  RefreshTokenInvalidException,
} from '../../common/exceptions/app.exception';
import type { JwtAccessPayload, RequestUser } from './types';
import type { LoginResponse } from '@rpx/shared';

const REFRESH_TOKEN_BYTES = 48; // 384 bits

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: TypedConfigService,
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
      // Refresh já usado/revogado → possível reuso. Revoga todos os tokens do usuário.
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
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      unitId: user.unitId,
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
      },
    };
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
