import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TypedConfigService } from '../../../config/typed-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtAccessPayload, RequestUser } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: TypedConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, unitId: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuário inexistente ou removido');
    }
    // Permissões de tela vêm do token (assinado por nós). Alterações de telas
    // concedidas passam a valer na próxima renovação do access token (≤15min).
    return { ...user, permissions: payload.permissions ?? [] };
  }
}
