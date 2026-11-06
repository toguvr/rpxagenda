/**
 * Unit tests do ciclo de cadastro facial (IdfaceEnrollmentsService) com Prisma
 * em memória. Cobre o cadastro do PROFISSIONAL e garante que o do paciente
 * segue igual após a generalização do dono do enrollment.
 */
import type { PrismaService } from '../../../prisma/prisma.service';
import type { IStorageProvider } from '../../storage/storage.types';
import { IdfaceEnrollmentsService } from './idface-enrollments.service';

const UNIT = 'unit_1';
const DEVICE_ID = 'DEV_1';

interface PatientRow {
  id: string;
  unitId: string;
  fullName: string;
  cpf: string;
  photoKey: string | null;
  idfaceUserId: number | null;
}
interface ProfessionalRow {
  id: string;
  unitId: string;
  fullName: string;
  registry: string;
  photoKey: string | null;
  idfaceUserId: number | null;
}
interface EnrollmentRow {
  id: string;
  unitId: string;
  patientId: string | null;
  professionalId: string | null;
  photoKey: string;
  assignedUserId: number;
  status: string;
}
interface CommandRow {
  id: string;
  unitId: string;
  enrollmentId: string;
  patientId: string | null;
  professionalId: string | null;
  step: 'DESTROY' | 'CREATE_USER' | 'SET_IMAGE';
  payload: { endpoint: string; body: Record<string, unknown> };
  uuid: string;
  status: string;
  dispatchUuid: string | null;
  dispatchedAt: Date | null;
  createdAt: number;
}

function setup(opts: { patients?: PatientRow[]; professionals?: ProfessionalRow[] }) {
  const patients = new Map((opts.patients ?? []).map((p) => [p.id, p]));
  const professionals = new Map((opts.professionals ?? []).map((p) => [p.id, p]));
  const enrollments: EnrollmentRow[] = [];
  const commands: CommandRow[] = [];
  let nextIdfaceUserId = 1007;
  let seq = 0;

  const client = {
    patient: {
      findUnique: async (a: { where: { id: string } }) => patients.get(a.where.id) ?? null,
      update: async (a: { where: { id: string }; data: Partial<PatientRow> }) => {
        const row = patients.get(a.where.id);
        if (!row) throw new Error('patient not found');
        return Object.assign(row, a.data);
      },
    },
    professional: {
      findUnique: async (a: { where: { id: string } }) => professionals.get(a.where.id) ?? null,
      update: async (a: { where: { id: string }; data: Partial<ProfessionalRow> }) => {
        const row = professionals.get(a.where.id);
        if (!row) throw new Error('professional not found');
        return Object.assign(row, a.data);
      },
    },
    idfaceEnrollment: {
      create: async (a: { data: Omit<EnrollmentRow, 'id'> }) => {
        const row: EnrollmentRow = { id: `enr_${++seq}`, ...a.data };
        enrollments.push(row);
        return row;
      },
      findUnique: async (a: { where: { id: string } }) => {
        const row = enrollments.find((e) => e.id === a.where.id);
        if (!row) return null;
        return {
          ...row,
          patient: row.patientId ? (patients.get(row.patientId) ?? null) : null,
          professional: row.professionalId ? (professionals.get(row.professionalId) ?? null) : null,
        };
      },
      update: async (a: { where: { id: string }; data: Partial<EnrollmentRow> }) => {
        const row = enrollments.find((e) => e.id === a.where.id);
        if (!row) throw new Error('enrollment not found');
        return Object.assign(row, a.data);
      },
    },
    idfaceCommand: {
      create: async (a: {
        data: Omit<CommandRow, 'id' | 'dispatchUuid' | 'dispatchedAt' | 'createdAt'>;
      }) => {
        const row: CommandRow = {
          id: `cmd_${++seq}`,
          dispatchUuid: null,
          dispatchedAt: null,
          createdAt: seq,
          ...a.data,
        };
        commands.push(row);
        return row;
      },
      findFirst: async (a: {
        where: { unitId?: string; status?: string; dispatchUuid?: string };
      }) =>
        [...commands]
          .sort((x, y) => x.createdAt - y.createdAt)
          .find(
            (c) =>
              (a.where.unitId === undefined || c.unitId === a.where.unitId) &&
              (a.where.status === undefined || c.status === a.where.status) &&
              (a.where.dispatchUuid === undefined || c.dispatchUuid === a.where.dispatchUuid),
          ) ?? null,
      update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = commands.find((c) => c.id === a.where.id);
        if (!row) throw new Error('command not found');
        const { attempts: _attempts, ...rest } = a.data;
        return Object.assign(row, rest);
      },
    },
    $queryRaw: async () => [{ nextIdfaceUserId: nextIdfaceUserId++ }],
  };
  const prisma = {
    ...client,
    $transaction: async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof client) => Promise<unknown>)(client)
        : Promise.all(arg as Promise<unknown>[]),
  } as unknown as PrismaService;

  const storage: IStorageProvider = {
    isConfigured: () => true,
    presignUpload: async () => 'https://example.test/upload',
    presignDownload: async () => 'https://example.test/download',
    downloadBytes: async () => Buffer.from('fake-jpeg'),
  };

  const service = new IdfaceEnrollmentsService(prisma, storage);

  /** Simula o device: busca o próximo comando e devolve o result. */
  async function deviceRuns(success = true): Promise<CommandRow> {
    const popped = await service.popNextCommand(UNIT, DEVICE_ID);
    if (!popped) throw new Error('fila vazia');
    const cmd = commands.find((c) => c.dispatchUuid === popped.transactionid);
    if (!cmd) throw new Error('comando despachado não encontrado');
    await service.recordResult({
      transactionid: popped.transactionid,
      success,
      error: success ? undefined : 'erro do device',
    });
    return cmd;
  }

  return { service, patients, professionals, enrollments, commands, deviceRuns };
}

const professional: ProfessionalRow = {
  id: 'prof_1',
  unitId: UNIT,
  fullName: 'Bárbara Soares',
  registry: 'CREFITO 12345-F',
  photoKey: 'professionals/prof_1/foto.jpg',
  idfaceUserId: null,
};

describe('IdfaceEnrollmentsService — cadastro facial do profissional', () => {
  it('primeiro cadastro: aloca ID do contador da unidade e segue CREATE_USER → SET_IMAGE', async () => {
    const t = setup({ professionals: [{ ...professional }] });

    await t.service.enqueueProfessionalEnrollment('prof_1');

    expect(t.enrollments).toHaveLength(1);
    expect(t.enrollments[0]).toMatchObject({
      professionalId: 'prof_1',
      patientId: null,
      assignedUserId: 1007,
      status: 'PENDING',
    });

    const create = await t.deviceRuns();
    expect(create.step).toBe('CREATE_USER');
    expect(create).toMatchObject({ professionalId: 'prof_1', patientId: null });
    expect(create.payload.body).toEqual({
      object: 'users',
      values: [{ id: 1007, name: 'Bárbara Soares', registration: 'CREFITO 12345-F' }],
    });
    // Só passa a ser reconhecido pelo totem depois que a imagem é aceita.
    expect(t.professionals.get('prof_1')?.idfaceUserId).toBeNull();

    const image = await t.deviceRuns();
    expect(image.step).toBe('SET_IMAGE');
    expect(image.payload.body).toMatchObject({
      match: false,
      user_images: [{ user_id: 1007, image: Buffer.from('fake-jpeg').toString('base64') }],
    });

    expect(t.enrollments[0].status).toBe('REGISTERED');
    expect(t.professionals.get('prof_1')?.idfaceUserId).toBe(1007);
  });

  it('recadastro: reusa o mesmo ID e começa removendo o rosto antigo (DESTROY)', async () => {
    const t = setup({ professionals: [{ ...professional, idfaceUserId: 1003 }] });

    await t.service.enqueueProfessionalEnrollment('prof_1');

    expect(t.enrollments[0].assignedUserId).toBe(1003);
    const destroy = await t.deviceRuns();
    expect(destroy.step).toBe('DESTROY');
    expect(destroy.payload.body).toEqual({ object: 'users', where: { users: { id: 1003 } } });
    expect((await t.deviceRuns()).step).toBe('CREATE_USER');
    expect((await t.deviceRuns()).step).toBe('SET_IMAGE');
    expect(t.professionals.get('prof_1')?.idfaceUserId).toBe(1003);
  });

  it('falha no SET_IMAGE marca FAILED e NÃO libera o profissional', async () => {
    const t = setup({ professionals: [{ ...professional }] });

    await t.service.enqueueProfessionalEnrollment('prof_1');
    await t.deviceRuns(); // CREATE_USER ok
    await t.deviceRuns(false); // SET_IMAGE falha (ex: rosto não detectado)

    expect(t.enrollments[0].status).toBe('FAILED');
    expect(t.professionals.get('prof_1')?.idfaceUserId).toBeNull();
  });

  it('sem foto não enfileira nada', async () => {
    const t = setup({ professionals: [{ ...professional, photoKey: null }] });
    await t.service.enqueueProfessionalEnrollment('prof_1');
    expect(t.enrollments).toHaveLength(0);
    expect(t.commands).toHaveLength(0);
  });

  it('paciente e profissional recebem IDs distintos do mesmo contador', async () => {
    const t = setup({
      patients: [
        {
          id: 'pat_1',
          unitId: UNIT,
          fullName: 'Paciente Um',
          cpf: '52998224725',
          photoKey: 'patients/pat_1/foto.jpg',
          idfaceUserId: null,
        },
      ],
      professionals: [{ ...professional }],
    });

    await t.service.enqueueEnrollment('pat_1');
    await t.service.enqueueProfessionalEnrollment('prof_1');

    expect(t.enrollments.map((e) => e.assignedUserId)).toEqual([1007, 1008]);
  });
});

describe('IdfaceEnrollmentsService — cadastro do paciente (regressão)', () => {
  it('segue CREATE_USER (com CPF) → SET_IMAGE e grava Patient.idfaceUserId', async () => {
    const t = setup({
      patients: [
        {
          id: 'pat_1',
          unitId: UNIT,
          fullName: 'Paciente Um',
          cpf: '52998224725',
          photoKey: 'patients/pat_1/foto.jpg',
          idfaceUserId: null,
        },
      ],
    });

    await t.service.enqueueEnrollment('pat_1');

    const create = await t.deviceRuns();
    expect(create).toMatchObject({ step: 'CREATE_USER', patientId: 'pat_1', professionalId: null });
    expect(create.payload.body).toEqual({
      object: 'users',
      values: [{ id: 1007, name: 'Paciente Um', registration: '52998224725' }],
    });
    expect((await t.deviceRuns()).step).toBe('SET_IMAGE');

    expect(t.enrollments[0].status).toBe('REGISTERED');
    expect(t.patients.get('pat_1')?.idfaceUserId).toBe(1007);
  });
});
