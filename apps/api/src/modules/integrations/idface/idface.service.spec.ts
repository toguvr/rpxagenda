/**
 * Unit tests da decisão de acesso do totem (IdfaceService) com Prisma em memória.
 * Foco: profissional ativo entra a qualquer hora, sem agendamento — e essa
 * regra NÃO afrouxa o check-in do paciente.
 */
import type { ClsService } from 'nestjs-cls';
import { IdfaceService } from './idface.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppointmentsService } from '../../appointments/appointments.service';
import type { IdfaceDevicesService } from './idface-devices.service';

const UNIT = 'unit_1';
const OTHER_UNIT = 'unit_2';
const DEVICE_ID = 'DEV_1';

interface PersonRow {
  id: string;
  unitId: string;
  idfaceUserId: number | null;
  fullName: string;
  active?: boolean;
}
interface EventRow {
  deviceId: string;
  idfaceUserId: string;
  eventAt: Date;
  accessGranted: boolean;
  outcome: string;
  patientId: string | null;
  professionalId: string | null;
  appointmentId: string | null;
}
interface PersonWhere {
  unitId: string;
  idfaceUserId: number;
  active?: boolean;
}

function matches(row: PersonRow, where: PersonWhere): boolean {
  return (
    row.unitId === where.unitId &&
    row.idfaceUserId === where.idfaceUserId &&
    (where.active === undefined || row.active === where.active)
  );
}

function setup(opts: { patients?: PersonRow[]; professionals?: PersonRow[] }) {
  const events: EventRow[] = [];
  const appointmentFindMany = jest.fn(async () => []);
  const checkIn = jest.fn();

  const prisma = {
    idfaceEvent: {
      findUnique: async (args: {
        where: {
          deviceId_eventAt_idfaceUserId: { deviceId: string; eventAt: Date; idfaceUserId: string };
        };
      }) => {
        const k = args.where.deviceId_eventAt_idfaceUserId;
        return (
          events.find(
            (e) =>
              e.deviceId === k.deviceId &&
              e.idfaceUserId === k.idfaceUserId &&
              e.eventAt.getTime() === k.eventAt.getTime(),
          ) ?? null
        );
      },
      create: async (args: { data: EventRow }) => {
        events.push(args.data);
        return args.data;
      },
    },
    patient: {
      findFirst: async (args: { where: PersonWhere }) =>
        (opts.patients ?? []).find((p) => matches(p, args.where)) ?? null,
    },
    professional: {
      findFirst: async (args: { where: PersonWhere }) =>
        (opts.professionals ?? []).find((p) => matches(p, args.where)) ?? null,
    },
    unit: { findFirst: async () => ({ id: UNIT }) },
    scoped: { appointment: { findMany: appointmentFindMany } },
  } as unknown as PrismaService;

  const cls = {
    run: <T>(fn: () => T) => fn(),
    set: () => undefined,
  } as unknown as ClsService;

  const devices = {
    findByDeviceId: async (deviceId: string) =>
      deviceId === DEVICE_ID ? { id: 'dev_row', unitId: UNIT, active: true } : null,
  } as unknown as IdfaceDevicesService;

  const appointments = {
    checkInAcceptingLateNoShow: checkIn,
  } as unknown as AppointmentsService;

  const service = new IdfaceService(prisma, cls, appointments, devices);
  return { service, events, appointmentFindMany, checkIn };
}

function payload(idfaceUserId: string, at = '2026-11-06T03:00:00.000Z') {
  return { deviceId: DEVICE_ID, idfaceUserId, timestamp: new Date(at) };
}

describe('IdfaceService — acesso de profissional pelo totem', () => {
  const professional: PersonRow = {
    id: 'prof_1',
    unitId: UNIT,
    idfaceUserId: 1010,
    fullName: 'Bárbara Soares',
    active: true,
  };

  it('libera profissional ativo sem exigir agendamento e registra o evento', async () => {
    const { service, events, appointmentFindMany, checkIn } = setup({
      professionals: [professional],
    });

    const res = await service.processEvent(payload('1010'));

    expect(res).toMatchObject({
      accessGranted: true,
      outcome: 'PROFESSIONAL_ACCESS',
      appointmentId: null,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      accessGranted: true,
      outcome: 'PROFESSIONAL_ACCESS',
      professionalId: 'prof_1',
      patientId: null,
    });
    // Não passa pela regra de agendamento/check-in do paciente.
    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
  });

  it('libera a qualquer hora (madrugada, fora do horário de funcionamento)', async () => {
    const { service } = setup({ professionals: [professional] });
    // 03:30 em America/Sao_Paulo.
    const res = await service.processEvent(
      payload('1010', '2026-11-08T06:30:00.000Z'),
      new Date('2026-11-08T06:30:00.000Z'),
    );
    expect(res.accessGranted).toBe(true);
  });

  it('nega profissional desativado', async () => {
    const { service, events } = setup({ professionals: [{ ...professional, active: false }] });

    const res = await service.processEvent(payload('1010'));

    expect(res).toMatchObject({ accessGranted: false, outcome: 'PATIENT_NOT_FOUND' });
    expect(events[0]).toMatchObject({ accessGranted: false, professionalId: null });
  });

  it('nega profissional de outra unidade (totem não libera cross-tenant)', async () => {
    const { service } = setup({ professionals: [{ ...professional, unitId: OTHER_UNIT }] });
    const res = await service.processEvent(payload('1010'));
    expect(res).toMatchObject({ accessGranted: false, outcome: 'PATIENT_NOT_FOUND' });
  });

  it('nega ID desconhecido e rosto não reconhecido (user_id 0)', async () => {
    const { service } = setup({ professionals: [professional] });
    expect((await service.processEvent(payload('2'))).accessGranted).toBe(false);
    expect((await service.processEvent(payload('0'))).accessGranted).toBe(false);
  });

  it('é idempotente: reenvio do mesmo evento devolve a mesma liberação sem duplicar', async () => {
    const { service, events } = setup({ professionals: [professional] });
    const first = await service.processEvent(payload('1010'));
    const second = await service.processEvent(payload('1010'));
    expect(second).toEqual(first);
    expect(events).toHaveLength(1);
  });

  it('paciente sem agendamento continua negado (a regra do profissional não vaza)', async () => {
    const { service, events } = setup({
      patients: [{ id: 'pat_1', unitId: UNIT, idfaceUserId: 1005, fullName: 'Paciente' }],
      professionals: [professional],
    });

    const res = await service.processEvent(payload('1005'));

    expect(res).toMatchObject({ accessGranted: false, outcome: 'NO_APPOINTMENT_IN_WINDOW' });
    expect(events[0]).toMatchObject({ patientId: 'pat_1', professionalId: null });
  });

  it('modo online: responde event 7 + abrir porta, com o nome do profissional', async () => {
    const { service } = setup({ professionals: [professional] });

    const res = await service.processOnlineIdentification({
      deviceId: DEVICE_ID,
      userId: '1010',
      timeUnix: 1_793_900_000,
      portalId: 1,
    });

    expect(res.result).toMatchObject({
      event: 7,
      user_id: 1010,
      user_name: 'Bárbara Soares',
      actions: [{ action: 'door', parameters: 'door=1' }],
    });
  });

  it('modo online: profissional desativado recebe event 6 sem ação de porta', async () => {
    const { service } = setup({ professionals: [{ ...professional, active: false }] });

    const res = await service.processOnlineIdentification({
      deviceId: DEVICE_ID,
      userId: '1010',
      timeUnix: 1_793_900_000,
      portalId: 1,
    });

    expect(res.result.event).toBe(6);
    expect(res.result.actions).toBeUndefined();
  });
});
