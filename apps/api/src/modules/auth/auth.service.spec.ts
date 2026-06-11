import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UserRole } from '@rpx/shared';
import { AuthService } from './auth.service';
import {
  InvalidCredentialsException,
  RefreshTokenInvalidException,
} from '../../common/exceptions/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TypedConfigService } from '../../config/typed-config.service';
import type { IEmailProvider } from '../email/email.types';

// Email provider fake — os testes de auth não exercitam envio de e-mail.
function createEmailFake(): IEmailProvider {
  return { send: async () => undefined, isConfigured: () => true };
}

// ----- Fake PrismaService (in-memory) -----
interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  unitId: string;
}
interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function createPrismaFake(initialUsers: UserRow[] = []) {
  const users = new Map<string, UserRow>();
  const usersByEmail = new Map<string, UserRow>();
  for (const u of initialUsers) {
    users.set(u.id, u);
    usersByEmail.set(u.email, u);
  }
  const refreshTokens = new Map<string, RefreshTokenRow>();
  let refreshSeq = 0;

  const userApi = {
    findUnique: async (args: { where: { email?: string; id?: string } }) => {
      if (args.where.email) return usersByEmail.get(args.where.email) ?? null;
      if (args.where.id) return users.get(args.where.id) ?? null;
      return null;
    },
  };

  const refreshTokenApi = {
    create: async (args: {
      data: Omit<RefreshTokenRow, 'id' | 'revokedAt'> & { revokedAt?: Date };
    }) => {
      const id = `rt_${++refreshSeq}`;
      const row: RefreshTokenRow = { id, revokedAt: null, ...args.data };
      refreshTokens.set(id, row);
      return row;
    },
    findUnique: async (args: { where: { tokenHash: string }; include?: { user?: boolean } }) => {
      for (const rt of refreshTokens.values()) {
        if (rt.tokenHash === args.where.tokenHash) {
          if (args.include?.user) {
            return { ...rt, user: users.get(rt.userId) };
          }
          return rt;
        }
      }
      return null;
    },
    update: async (args: { where: { id: string }; data: Partial<RefreshTokenRow> }) => {
      const row = refreshTokens.get(args.where.id);
      if (!row) throw new Error('refresh token not found');
      const next = { ...row, ...args.data };
      refreshTokens.set(args.where.id, next);
      return next;
    },
    updateMany: async (args: {
      where: { userId?: string; tokenHash?: string; revokedAt?: null };
      data: Partial<RefreshTokenRow>;
    }) => {
      let count = 0;
      for (const rt of refreshTokens.values()) {
        if (args.where.userId && rt.userId !== args.where.userId) continue;
        if (args.where.tokenHash && rt.tokenHash !== args.where.tokenHash) continue;
        if (args.where.revokedAt === null && rt.revokedAt !== null) continue;
        refreshTokens.set(rt.id, { ...rt, ...args.data });
        count += 1;
      }
      return { count };
    },
  };

  interface PrismaFake {
    user: typeof userApi;
    refreshToken: typeof refreshTokenApi;
    $transaction: <T>(fn: (tx: PrismaFake) => Promise<T>) => Promise<T>;
  }
  const prismaFake: PrismaFake = {
    user: userApi,
    refreshToken: refreshTokenApi,
    $transaction: async <T>(fn: (tx: PrismaFake) => Promise<T>): Promise<T> => fn(prismaFake),
  };
  return prismaFake;
}

function createConfigFake(): TypedConfigService {
  return {
    get: (key: string) => {
      switch (key) {
        case 'JWT_ACCESS_SECRET':
          return 'test-access-secret-com-pelo-menos-32-caracteres-ok';
        case 'JWT_REFRESH_SECRET':
          return 'test-refresh-secret-com-pelo-menos-32-caracteres-ok';
        case 'JWT_ACCESS_TTL':
          return '15m';
        case 'JWT_REFRESH_TTL_DAYS':
          return 30;
        default:
          throw new Error(`config key não tratada nos testes: ${String(key)}`);
      }
    },
  } as unknown as TypedConfigService;
}

async function buildAdmin(): Promise<UserRow> {
  return {
    id: 'u_admin',
    email: 'admin@rpxexpert.local',
    passwordHash: await argon2.hash('Senha@1234', { type: argon2.argon2id }),
    fullName: 'Admin Teste',
    role: UserRole.ADMIN,
    unitId: 'unit_1',
  };
}

describe('AuthService', () => {
  jest.setTimeout(15_000);

  describe('login', () => {
    it('autentica com credenciais corretas e retorna par de tokens', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      const result = await auth.login('admin@rpxexpert.local', 'Senha@1234');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toMatchObject({
        id: 'u_admin',
        email: 'admin@rpxexpert.local',
        role: UserRole.ADMIN,
        unitId: 'unit_1',
      });
    });

    it('rejeita senha incorreta', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      await expect(auth.login('admin@rpxexpert.local', 'errada')).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
    });

    it('rejeita usuário inexistente', async () => {
      const prisma = createPrismaFake([]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      await expect(auth.login('nope@rpxexpert.local', 'qualquer')).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
    });
  });

  describe('refresh', () => {
    it('rotaciona refresh token (válido funciona uma vez)', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      const first = await auth.login('admin@rpxexpert.local', 'Senha@1234');
      const second = await auth.refresh(first.refreshToken);

      expect(second.refreshToken).not.toEqual(first.refreshToken);
      expect(second.accessToken).toEqual(expect.any(String));
    });

    it('rejeita reuso de refresh token já rotacionado', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      const first = await auth.login('admin@rpxexpert.local', 'Senha@1234');
      await auth.refresh(first.refreshToken);

      await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        RefreshTokenInvalidException,
      );
    });

    it('rejeita refresh inexistente', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      await expect(auth.refresh('nao-existe-no-banco')).rejects.toBeInstanceOf(
        RefreshTokenInvalidException,
      );
    });
  });

  describe('logout', () => {
    it('revoga o refresh token informado', async () => {
      const user = await buildAdmin();
      const prisma = createPrismaFake([user]);
      const auth = new AuthService(
        prisma as unknown as PrismaService,
        new JwtService(),
        createConfigFake(),
        createEmailFake(),
      );

      const first = await auth.login('admin@rpxexpert.local', 'Senha@1234');
      await auth.logout(first.refreshToken);

      await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        RefreshTokenInvalidException,
      );
    });
  });
});
