 
/**
 * Integration tests da Fase 3 — sobe o NestJS completo contra o Postgres real
 * (configurado em apps/api/.env). Cobre:
 *  1. Race condition: N requests paralelos no mesmo slot com slotCapacity=1
 *     → apenas 1 deve vencer; os outros tomam 409.
 *  2. No-show sweep: appointment cujo endsAt + grace já passou é marcado como NO_SHOW.
 *
 * NÃO usa fake de Prisma — todas as transações SERIALIZABLE rodam no banco.
 *
 * Pré-requisito: docker-compose com Postgres em 5433 (mesmo do dev) + seed
 * já rodado (admin@rpxexpert.local).
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { NoShowService } from './no-show.service';

const ADMIN_EMAIL = 'admin@rpxexpert.local';
const ADMIN_PASSWORD = 'RpxAdmin@2026';

let app: INestApplication;
let prisma: PrismaService;
let noShow: NoShowService;
let adminToken: string;
let unitId: string;

async function loginAdmin(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text}`);
  return res.body.accessToken as string;
}

async function clearTestData() {
  // Ordem importa por causa das FKs.
  await prisma.appointmentEquipment.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.patientInvite.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.professionalService.deleteMany({});
  await prisma.professional.deleteMany({});
  await prisma.scheduleException.deleteMany({});
  await prisma.businessHours.deleteMany({});
  await prisma.serviceEquipment.deleteMany({});
  await prisma.equipment.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.service.deleteMany({});
  // Mantém Unit e o admin User (necessários para login).
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  noShow = app.get(NoShowService);

  const unit = await prisma.unit.findFirst();
  if (!unit) throw new Error('seed Unit não encontrada — rode pnpm db:seed antes');
  unitId = unit.id;

  await clearTestData();
  adminToken = await loginAdmin();
}, 60_000);

afterAll(async () => {
  await clearTestData();
  await app.close();
});

async function seedSlotEnv(opts: {
  slotCapacity: number;
  serviceName: string;
  patientCpf: string;
}) {
  const service = await prisma.service.create({
    data: {
      unitId,
      name: opts.serviceName,
      type: 'FISIO',
      durationMinutes: 50,
      slotCapacity: opts.slotCapacity,
      schedulingLeadMinutes: 0, // sem lead pra simplificar
      acceptedPlanType: 'PACKAGE',
    },
  });
  // BusinessHours não é checado no create (slot grade é só sugestão); pulamos.
  const patient = await prisma.patient.create({
    data: {
      unitId,
      fullName: 'Race Tester',
      cpf: opts.patientCpf,
      birthDate: new Date('1990-01-01'),
      phone: '+55 31 99999-0000',
    },
  });
  const plan = await prisma.plan.create({
    data: {
      unitId,
      patientId: patient.id,
      serviceId: service.id,
      type: 'PACKAGE',
      status: 'ACTIVE',
      totalSessions: 50,
      remainingSessions: 50,
      validUntil: new Date('2027-12-31'),
    },
  });
  return { service, patient, plan };
}

async function seedManyPatientsForSlot(opts: {
  slotCapacity: number;
  serviceName: string;
  patientCount: number;
}) {
  const service = await prisma.service.create({
    data: {
      unitId,
      name: opts.serviceName,
      type: 'FISIO',
      durationMinutes: 50,
      slotCapacity: opts.slotCapacity,
      schedulingLeadMinutes: 0,
      acceptedPlanType: 'PACKAGE',
    },
  });
  const seeds: Array<{ patientId: string; planId: string }> = [];
  for (let i = 0; i < opts.patientCount; i++) {
    const cpfDigits = String(11144477735 + i);
    const patient = await prisma.patient.create({
      data: {
        unitId,
        fullName: `Race ${i}`,
        cpf: cpfDigits,
        birthDate: new Date('1990-01-01'),
        phone: `+55 31 99999-${i.toString().padStart(4, '0')}`,
      },
    });
    const plan = await prisma.plan.create({
      data: {
        unitId,
        patientId: patient.id,
        serviceId: service.id,
        type: 'PACKAGE',
        status: 'ACTIVE',
        totalSessions: 50,
        remainingSessions: 50,
        validUntil: new Date('2027-12-31'),
      },
    });
    seeds.push({ patientId: patient.id, planId: plan.id });
  }
  return { service, seeds };
}

describe('AppointmentsModule (integration)', () => {
  jest.setTimeout(60_000);

  describe('race condition no create', () => {
    it('5 requests paralelos com slotCapacity=1 → exatamente 1 sucesso e 4 conflitos', async () => {
      await clearTestData();
      const { service, seeds } = await seedManyPatientsForSlot({
        slotCapacity: 1,
        serviceName: 'Race Fisio Cap 1',
        patientCount: 5,
      });
      const startsAt = '2027-01-15T13:00:00Z';

      const results = await Promise.all(
        seeds.map((s) =>
          request(app.getHttpServer())
            .post('/appointments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              patientId: s.patientId,
              serviceId: service.id,
              planId: s.planId,
              startsAt,
            }),
        ),
      );

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(4);

      const stored = await prisma.appointment.count({
        where: { serviceId: service.id, status: 'SCHEDULED' },
      });
      expect(stored).toBe(1);
    });

    it('slotCapacity=3 + 5 requests → exatamente 3 sucessos', async () => {
      await clearTestData();
      const { service, seeds } = await seedManyPatientsForSlot({
        slotCapacity: 3,
        serviceName: 'Race Fisio Cap 3',
        patientCount: 5,
      });
      const startsAt = '2027-02-15T13:00:00Z';

      const results = await Promise.all(
        seeds.map((s) =>
          request(app.getHttpServer())
            .post('/appointments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              patientId: s.patientId,
              serviceId: service.id,
              planId: s.planId,
              startsAt,
            }),
        ),
      );

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes).toHaveLength(3);
      expect(conflicts).toHaveLength(2);
    });
  });

  describe('no-show sweep', () => {
    it('marca como NO_SHOW agendamento cujo endsAt+grace já passou e não tem check-in', async () => {
      await clearTestData();
      const env = await seedSlotEnv({
        slotCapacity: 5,
        serviceName: 'NoShow Fisio',
        patientCpf: '11144477735',
      });

      // Criar via Prisma direto (bypassa lead time). endsAt 30min atrás +
      // grace default 15min → 15min antes de now: ELEGÍVEL.
      const startsAt = new Date(Date.now() - 80 * 60 * 1000); // 80min atrás
      const endsAt = new Date(startsAt.getTime() + 50 * 60 * 1000); // 30min atrás
      const appt = await prisma.appointment.create({
        data: {
          unitId,
          patientId: env.patient.id,
          serviceId: env.service.id,
          planId: env.plan.id,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
          consumedSession: true,
        },
      });

      const marked = await noShow.runNoShowSweep(new Date());
      expect(marked).toContain(appt.id);

      const after = await prisma.appointment.findUnique({ where: { id: appt.id } });
      expect(after?.status).toBe('NO_SHOW');

      const log = await prisma.auditLog.findFirst({
        where: { entity: 'Appointment', entityId: appt.id, action: 'APPOINTMENT_AUTO_NO_SHOW' },
      });
      expect(log).not.toBeNull();
    });

    it('NÃO marca agendamento ainda dentro do grace ou já com check-in', async () => {
      await clearTestData();
      const env = await seedSlotEnv({
        slotCapacity: 5,
        serviceName: 'NoShow Fisio 2',
        patientCpf: '52998224725',
      });

      // 1) Agendamento dentro do grace: endsAt = 5min atrás (grace 15min, ainda dentro)
      const justEnded = new Date(Date.now() - 5 * 60 * 1000);
      const appt1 = await prisma.appointment.create({
        data: {
          unitId,
          patientId: env.patient.id,
          serviceId: env.service.id,
          planId: env.plan.id,
          startsAt: new Date(justEnded.getTime() - 50 * 60 * 1000),
          endsAt: justEnded,
          status: 'SCHEDULED',
          consumedSession: true,
        },
      });

      // Vamos rodar o sweep — appt1 NÃO pode ser marcado.
      const marked = await noShow.runNoShowSweep(new Date());
      expect(marked).not.toContain(appt1.id);

      const after = await prisma.appointment.findUnique({ where: { id: appt1.id } });
      expect(after?.status).toBe('SCHEDULED');
    });
  });
});
