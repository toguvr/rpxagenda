 
/**
 * Integration tests do webhook iDFace contra Postgres real.
 * Cobre:
 *   1. Acesso negado sem header X-IDFace-Secret.
 *   2. Idempotência: mesmo payload duas vezes → 1 row, mesma resposta.
 *   3. Paciente não encontrado → accessGranted=false outcome=PATIENT_NOT_FOUND.
 *   4. Sem appointment na janela → outcome=NO_APPOINTMENT_IN_WINDOW.
 *   5. Happy path: chega no horário → outcome=CHECKIN_OK, status=CHECKED_IN.
 *   6. Chega após cron marcar NO_SHOW (janela apósinda aberta) → revertedNoShow.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let unitId: string;

const SECRET = 'dev-idface-secret-trocar-em-prod';

async function clearTestData() {
  await prisma.idfaceEvent.deleteMany({});
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
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
}

async function seedEnv(opts: {
  idfaceUserId: string;
  cpf: string;
  serviceName: string;
  checkInWindowAfterMin?: number;
}) {
  const service = await prisma.service.create({
    data: {
      unitId,
      name: opts.serviceName,
      type: 'FISIO',
      durationMinutes: 50,
      slotCapacity: 5,
      schedulingLeadMinutes: 0,
      checkInWindowAfterMin: opts.checkInWindowAfterMin ?? 15,
      acceptedPlanType: 'PACKAGE',
    },
  });
  const patient = await prisma.patient.create({
    data: {
      unitId,
      fullName: `Idface Patient ${opts.cpf}`,
      cpf: opts.cpf,
      birthDate: new Date('1990-01-01'),
      phone: '+55 31 99999-0000',
      idfaceUserId: opts.idfaceUserId,
    },
  });
  const plan = await prisma.plan.create({
    data: {
      unitId,
      patientId: patient.id,
      serviceId: service.id,
      type: 'PACKAGE',
      status: 'ACTIVE',
      totalSessions: 10,
      remainingSessions: 10,
      validUntil: new Date('2027-12-31'),
    },
  });
  return { service, patient, plan };
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  const unit = await prisma.unit.findFirst();
  if (!unit) throw new Error('Sem Unit seedada — rode pnpm db:seed.');
  unitId = unit.id;
  await clearTestData();
}, 60_000);

afterAll(async () => {
  await clearTestData();
  await app.close();
});

describe('iDFace webhook (integration)', () => {
  jest.setTimeout(60_000);

  it('rejeita 401 sem header X-IDFace-Secret', async () => {
    const res = await request(app.getHttpServer()).post('/webhooks/idface/access-event').send({
      idfaceUserId: 'IDF_X',
      deviceId: 'DEV_1',
      timestamp: new Date().toISOString(),
    });
    expect(res.status).toBe(401);
  });

  it('rejeita 401 com segredo errado (length diferente)', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/idface/access-event')
      .set('X-IDFace-Secret', 'wrong')
      .send({
        idfaceUserId: 'IDF_X',
        deviceId: 'DEV_1',
        timestamp: new Date().toISOString(),
      });
    expect(res.status).toBe(401);
  });

  it('paciente não encontrado → 200 accessGranted=false', async () => {
    await clearTestData();
    const res = await request(app.getHttpServer())
      .post('/webhooks/idface/access-event')
      .set('X-IDFace-Secret', SECRET)
      .send({
        idfaceUserId: 'IDF_UNKNOWN',
        deviceId: 'DEV_1',
        timestamp: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.accessGranted).toBe(false);
    expect(res.body.outcome).toBe('PATIENT_NOT_FOUND');
    const rows = await prisma.idfaceEvent.count();
    expect(rows).toBe(1);
  });

  it('paciente encontrado mas sem appointment elegível → NO_APPOINTMENT_IN_WINDOW', async () => {
    await clearTestData();
    await seedEnv({
      idfaceUserId: 'IDF_NO_APPT',
      cpf: '11144477735',
      serviceName: 'NoAppt Service',
    });

    const res = await request(app.getHttpServer())
      .post('/webhooks/idface/access-event')
      .set('X-IDFace-Secret', SECRET)
      .send({
        idfaceUserId: 'IDF_NO_APPT',
        deviceId: 'DEV_1',
        timestamp: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.accessGranted).toBe(false);
    expect(res.body.outcome).toBe('NO_APPOINTMENT_IN_WINDOW');
  });

  it('happy path: paciente chega no horário → CHECKIN_OK, appointment vira CHECKED_IN', async () => {
    await clearTestData();
    const env = await seedEnv({
      idfaceUserId: 'IDF_HAPPY',
      cpf: '52998224725',
      serviceName: 'Happy Path',
    });

    const startsAt = new Date(Date.now() - 5 * 60 * 1000); // 5min atrás (dentro do after=15)
    const appt = await prisma.appointment.create({
      data: {
        unitId,
        patientId: env.patient.id,
        serviceId: env.service.id,
        planId: env.plan.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000),
        status: 'SCHEDULED',
        consumedSession: true,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/webhooks/idface/access-event')
      .set('X-IDFace-Secret', SECRET)
      .send({
        idfaceUserId: 'IDF_HAPPY',
        deviceId: 'DEV_1',
        timestamp: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.accessGranted).toBe(true);
    expect(res.body.outcome).toBe('CHECKIN_OK');
    expect(res.body.appointmentId).toBe(appt.id);

    const updated = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(updated?.status).toBe('CHECKED_IN');
    expect(updated?.checkedInAt).not.toBeNull();
  });

  it('idempotência: mesmo payload duas vezes → 1 IdfaceEvent, 2ª resposta igual', async () => {
    await clearTestData();
    const env = await seedEnv({
      idfaceUserId: 'IDF_IDEMP',
      cpf: '11144477735',
      serviceName: 'Idemp Path',
    });
    const startsAt = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        unitId,
        patientId: env.patient.id,
        serviceId: env.service.id,
        planId: env.plan.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000),
        status: 'SCHEDULED',
        consumedSession: true,
      },
    });

    const ts = new Date().toISOString();
    const send = () =>
      request(app.getHttpServer())
        .post('/webhooks/idface/access-event')
        .set('X-IDFace-Secret', SECRET)
        .send({ idfaceUserId: 'IDF_IDEMP', deviceId: 'DEV_2', timestamp: ts });

    const r1 = await send();
    const r2 = await send();

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toEqual(r2.body);

    const eventCount = await prisma.idfaceEvent.count();
    expect(eventCount).toBe(1);
  });

  it('reversão de NO_SHOW: appointment já marcado NO_SHOW + paciente chega na janela apósainda aberta', async () => {
    await clearTestData();
    // checkInWindowAfterMin=120 (configuração agressiva) permite reversão tardia.
    const env = await seedEnv({
      idfaceUserId: 'IDF_REVERT',
      cpf: '52998224725',
      serviceName: 'Late Arrival',
      checkInWindowAfterMin: 120,
    });
    // startsAt 60min atrás → endsAt 10min atrás → cron já marcou NO_SHOW.
    // checkInWindowAfterMin=120 → janela vai até startsAt+120=60min depois de now.
    const startsAt = new Date(Date.now() - 60 * 60 * 1000);
    const remainingBefore = (await prisma.plan.findUnique({ where: { id: env.plan.id } }))!
      .remainingSessions;
    const appt = await prisma.appointment.create({
      data: {
        unitId,
        patientId: env.patient.id,
        serviceId: env.service.id,
        planId: env.plan.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000),
        status: 'NO_SHOW',
        consumedSession: true,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/webhooks/idface/access-event')
      .set('X-IDFace-Secret', SECRET)
      .send({
        idfaceUserId: 'IDF_REVERT',
        deviceId: 'DEV_3',
        timestamp: new Date().toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.accessGranted).toBe(true);
    expect(res.body.outcome).toBe('CHECKIN_OK_REVERTED_NO_SHOW');

    const updated = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(updated?.status).toBe('CHECKED_IN');
    expect(updated?.revertedAt).not.toBeNull();

    // Saldo do PACKAGE deve ter sido devolvido (estava em NO_SHOW com consumedSession=true).
    const remainingAfter = (await prisma.plan.findUnique({ where: { id: env.plan.id } }))!
      .remainingSessions;
    expect(remainingAfter).toBe((remainingBefore ?? 0) + 1);

    // AuditLog específico foi gravado.
    const log = await prisma.auditLog.findFirst({
      where: {
        entity: 'Appointment',
        entityId: appt.id,
        action: 'APPOINTMENT_AUTO_REVERTED_BY_CHECKIN',
      },
    });
    expect(log).not.toBeNull();
  });
});
