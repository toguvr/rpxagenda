/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from '@rpx/shared';
import { PatientsService } from './patients.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TypedConfigService } from '../../config/typed-config.service';
import type { AuthService } from '../auth/auth.service';
import {
  InviteInvalidException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

interface PatientRow {
  id: string;
  unitId: string;
  userId: string | null;
  fullName: string;
  cpf: string;
  birthDate: Date;
  phone: string;
  email: string | null;
  emergencyContact: string | null;
  notes: string | null;
  idfaceUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InviteRow {
  id: string;
  patientId: string;
  tokenHash: string;
  expiresAt: Date;
  redeemedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: 'ADMIN' | 'PROFESSIONAL' | 'PATIENT';
  unitId: string;
}

function buildPrismaFake(initialPatient: PatientRow) {
  const patients = new Map<string, PatientRow>([[initialPatient.id, initialPatient]]);
  const invites = new Map<string, InviteRow>();
  const users = new Map<string, UserRow>();
  let inviteSeq = 0;
  let userSeq = 0;

  const patientApi = {
    findFirst: async ({ where }: any) => {
      for (const p of patients.values()) if (p.id === where.id) return p;
      return null;
    },
    findUnique: async ({ where, select }: any) => {
      const p = patients.get(where.id);
      if (!p) return null;
      if (select) {
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (p as any)[k];
        return out;
      }
      return p;
    },
    update: async ({ where, data }: any) => {
      const p = patients.get(where.id);
      if (!p) throw new Error('not found');
      const next = { ...p, ...data, updatedAt: new Date() };
      patients.set(where.id, next);
      return next;
    },
  };

  const inviteApi = {
    create: async ({ data }: any) => {
      const id = `inv_${++inviteSeq}`;
      const row: InviteRow = {
        id,
        patientId: data.patientId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        redeemedAt: null,
        createdAt: new Date(),
      };
      invites.set(id, row);
      return row;
    },
    findUnique: async ({ where }: any) => {
      for (const i of invites.values()) if (i.tokenHash === where.tokenHash) return i;
      return null;
    },
    update: async ({ where, data }: any) => {
      const i = invites.get(where.id);
      if (!i) throw new Error('not found');
      const next = { ...i, ...data };
      invites.set(where.id, next);
      return next;
    },
  };

  const userApi = {
    create: async ({ data }: any) => {
      const id = `u_${++userSeq}`;
      const row: UserRow = {
        id,
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        role: data.role,
        unitId: data.unitId,
      };
      users.set(id, row);
      return row;
    },
  };

  const fakeTx = {
    patient: patientApi,
    patientInvite: inviteApi,
    user: userApi,
  };

  const prisma = {
    scoped: { patient: patientApi },
    patient: patientApi,
    patientInvite: inviteApi,
    user: userApi,
    $transaction: async <T>(fn: (tx: typeof fakeTx) => Promise<T>): Promise<T> => fn(fakeTx),
  };

  return { prisma, patients, invites, users };
}

const fakeConfig: TypedConfigService = {
  get: (key: string) => {
    if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret-com-pelo-menos-32-caracteres-ok';
    throw new Error('unhandled key: ' + key);
  },
} as unknown as TypedConfigService;

function buildAuthFake() {
  return {
    issueLoginTokens: jest.fn(async (user: any) => ({
      accessToken: `at_for_${user.id}`,
      refreshToken: `rt_for_${user.id}`,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        unitId: user.unitId,
      },
    })),
  } as unknown as AuthService;
}

function buildPatient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: 'p_1',
    unitId: 'unit_A',
    userId: null,
    fullName: 'Carla Mendes',
    cpf: '11144477735',
    birthDate: new Date('1990-04-12'),
    phone: '+55 31 99999-0001',
    email: 'carla@example.com',
    emergencyContact: null,
    notes: null,
    idfaceUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PatientsService invite flow', () => {
  jest.setTimeout(15_000);

  it('generateInvite cria um convite e retorna o token plain', async () => {
    const { prisma, invites } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );

    const result = await svc.generateInvite('p_1');

    expect(result.patientId).toBe('p_1');
    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThan(20);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.redeemPath).toContain(result.token);
    expect(invites.size).toBe(1);

    // O backend persiste apenas o HASH, não o plain.
    const persisted = [...invites.values()][0]!;
    expect(persisted.tokenHash).not.toBe(result.token);
    expect(persisted.tokenHash).toHaveLength(64); // SHA-256 hex
  });

  it('generateInvite rejeita paciente que já tem User vinculado', async () => {
    const { prisma } = buildPrismaFake(buildPatient({ userId: 'u_existing' }));
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );

    await expect(svc.generateInvite('p_1')).rejects.toBeInstanceOf(ResourceConflictException);
  });

  it('generateInvite 404 para paciente inexistente', async () => {
    const { prisma } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );

    await expect(svc.generateInvite('p_unknown')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('lookupInvite devolve dados básicos para token válido', async () => {
    const { prisma } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );
    const generated = await svc.generateInvite('p_1');

    const lookup = await svc.lookupInvite(generated.token);

    expect(lookup.patient.fullName).toBe('Carla Mendes');
    expect(lookup.patient.email).toBe('carla@example.com');
    expect(lookup.patient.cpf).toBe('11144477735');
    expect(lookup.expiresAt.getTime()).toEqual(generated.expiresAt.getTime());
  });

  it('lookupInvite rejeita token desconhecido', async () => {
    const { prisma } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );

    await expect(svc.lookupInvite('token-que-nao-existe')).rejects.toBeInstanceOf(
      InviteInvalidException,
    );
  });

  it('redeemInvite cria User PATIENT, vincula ao Patient, marca convite e devolve tokens', async () => {
    const { prisma, patients, invites, users } = buildPrismaFake(buildPatient());
    const auth = buildAuthFake();
    const svc = new PatientsService(prisma as unknown as PrismaService, fakeConfig, auth);
    const generated = await svc.generateInvite('p_1');

    const result = await svc.redeemInvite(generated.token, 'SenhaForte@2026');

    expect(result.user.role).toBe(UserRole.PATIENT);
    expect(result.user.email).toBe('carla@example.com');
    expect(result.accessToken).toMatch(/^at_for_/);

    // Patient agora tem userId.
    const patient = patients.get('p_1')!;
    expect(patient.userId).not.toBeNull();
    // User foi criado com role PATIENT.
    expect(users.size).toBe(1);
    const createdUser = [...users.values()][0]!;
    expect(createdUser.role).toBe(UserRole.PATIENT);
    expect(createdUser.unitId).toBe('unit_A');
    // Convite marcado como redeemido.
    const invite = [...invites.values()][0]!;
    expect(invite.redeemedAt).toBeInstanceOf(Date);
    // AuthService emitiu tokens.
    expect((auth.issueLoginTokens as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('redeemInvite rejeita reuso (410) e não cria novo User', async () => {
    const { prisma, users } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );
    const generated = await svc.generateInvite('p_1');

    await svc.redeemInvite(generated.token, 'SenhaForte@2026');

    await expect(svc.redeemInvite(generated.token, 'OutraSenha@2026')).rejects.toBeInstanceOf(
      InviteInvalidException,
    );
    expect(users.size).toBe(1);
  });

  it('redeemInvite rejeita convite expirado', async () => {
    const { prisma, invites } = buildPrismaFake(buildPatient());
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );
    const generated = await svc.generateInvite('p_1');
    // força expiração no fake
    const invite = [...invites.values()][0]!;
    invite.expiresAt = new Date(Date.now() - 1000);

    await expect(svc.redeemInvite(generated.token, 'SenhaForte@2026')).rejects.toBeInstanceOf(
      InviteInvalidException,
    );
  });

  it('redeemInvite rejeita paciente sem email cadastrado', async () => {
    const { prisma } = buildPrismaFake(buildPatient({ email: null }));
    const svc = new PatientsService(
      prisma as unknown as PrismaService,
      fakeConfig,
      buildAuthFake(),
    );
    const generated = await svc.generateInvite('p_1');

    await expect(svc.redeemInvite(generated.token, 'SenhaForte@2026')).rejects.toBeInstanceOf(
      ResourceConflictException,
    );
  });
});
