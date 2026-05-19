 
/**
 * Integration tests da Fase 5 — Protocols + MedicalRecords contra Postgres real.
 * Cobre o fluxo completo: profissional cria protocolo, registra evolução em
 * appointment, paciente vê os próprios prontuários.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let unitId: string;
let adminToken: string;
let profToken: string;
let patientToken: string;
let professional: { id: string; userId: string };
let patient: { id: string; userId: string };
let plan: { id: string };
let service: { id: string };
let equipmentMaca: { id: string };

const ADMIN_EMAIL = 'admin@rpxexpert.local';
const ADMIN_PASSWORD = 'RpxAdmin@2026';
const PROF_EMAIL = 'fase5-prof@rpxexpert.local';
const PROF_PASSWORD = 'ProfSenha@2026';
const PATIENT_EMAIL = 'fase5-patient@example.com';
const PATIENT_PASSWORD = 'PacienteSenha@2026';

async function login(email: string, password: string): Promise<string> {
  const r = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  if (r.status !== 200) throw new Error(`login failed ${email}: ${r.status} ${r.text}`);
  return r.body.accessToken as string;
}

async function clearTestData() {
  await prisma.medicalRecord.deleteMany({});
  await prisma.protocolEquipment.deleteMany({});
  await prisma.protocol.deleteMany({});
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

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  const unit = await prisma.unit.findFirst();
  if (!unit) throw new Error('Sem Unit seedada — rode pnpm db:seed.');
  unitId = unit.id;

  await clearTestData();
  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  // Cria service + equipment + paciente + professional + plan via Prisma direto.
  const svc = await prisma.service.create({
    data: {
      unitId,
      name: 'Fisioterapia Fase 5',
      type: 'FISIO',
      durationMinutes: 50,
      slotCapacity: 5,
      acceptedPlanType: 'PACKAGE',
    },
  });
  service = { id: svc.id };
  const eq = await prisma.equipment.create({
    data: { unitId, name: 'Maca F5', totalQuantity: 3 },
  });
  equipmentMaca = { id: eq.id };

  // Profissional via Prisma direto (mais rápido que ir pelo endpoint).
  const profUser = await prisma.user.create({
    data: {
      email: PROF_EMAIL,
      passwordHash: await argon2.hash(PROF_PASSWORD, { type: argon2.argon2id }),
      fullName: 'Dra Ana Fase5',
      role: 'PROFESSIONAL',
      unitId,
    },
  });
  const prof = await prisma.professional.create({
    data: {
      unitId,
      userId: profUser.id,
      fullName: 'Dra Ana Fase5',
      registry: 'CREFITO F5-001',
    },
  });
  professional = { id: prof.id, userId: profUser.id };

  // Patient + user + plan
  const pat = await prisma.patient.create({
    data: {
      unitId,
      fullName: 'Paciente F5',
      cpf: '11144477735',
      birthDate: new Date('1990-04-12'),
      phone: '+55 31 99999-0000',
      email: PATIENT_EMAIL,
    },
  });
  const patUser = await prisma.user.create({
    data: {
      email: PATIENT_EMAIL,
      passwordHash: await argon2.hash(PATIENT_PASSWORD, { type: argon2.argon2id }),
      fullName: 'Paciente F5',
      role: 'PATIENT',
      unitId,
    },
  });
  await prisma.patient.update({ where: { id: pat.id }, data: { userId: patUser.id } });
  patient = { id: pat.id, userId: patUser.id };

  const pl = await prisma.plan.create({
    data: {
      unitId,
      patientId: pat.id,
      serviceId: svc.id,
      type: 'PACKAGE',
      status: 'ACTIVE',
      totalSessions: 20,
      remainingSessions: 20,
      validUntil: new Date('2027-12-31'),
    },
  });
  plan = { id: pl.id };

  profToken = await login(PROF_EMAIL, PROF_PASSWORD);
  patientToken = await login(PATIENT_EMAIL, PATIENT_PASSWORD);
}, 90_000);

afterAll(async () => {
  await clearTestData();
  await app.close();
});

describe('Protocols (integration)', () => {
  jest.setTimeout(60_000);

  it('PROF cria protocolo na avaliação com equipamentos sugeridos', async () => {
    const res = await request(app.getHttpServer())
      .post('/protocols')
      .set('Authorization', `Bearer ${profToken}`)
      .send({
        patientId: patient.id,
        professionalId: professional.id,
        planId: plan.id,
        totalSessions: 20,
        sessionsPerWeek: 2,
        diagnosis: 'Lombalgia mecânica',
        observations: 'Iniciar com mobilizações + ponte.',
        equipmentIds: [equipmentMaca.id],
      });
    expect(res.status).toBe(201);
    expect(res.body.diagnosis).toBe('Lombalgia mecânica');
    expect(res.body.equipmentIds).toEqual([equipmentMaca.id]);
    expect(res.body.active).toBe(true);
  });

  it('rejeita 2º protocolo ativo no mesmo plano (409)', async () => {
    const res = await request(app.getHttpServer())
      .post('/protocols')
      .set('Authorization', `Bearer ${profToken}`)
      .send({
        patientId: patient.id,
        professionalId: professional.id,
        planId: plan.id,
        totalSessions: 10,
        sessionsPerWeek: 1,
        diagnosis: 'Outra avaliação',
      });
    expect(res.status).toBe(409);
  });

  it('GET /patients/:id/protocols devolve o protocolo ativo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patient.id}/protocols`)
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].active).toBe(true);
  });

  it('PATIENT NÃO pode criar protocolo (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/protocols')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId: patient.id,
        professionalId: professional.id,
        planId: plan.id,
        totalSessions: 5,
        sessionsPerWeek: 1,
        diagnosis: 'tentativa',
      });
    expect(res.status).toBe(403);
  });
});

describe('MedicalRecords (integration)', () => {
  jest.setTimeout(60_000);

  let recordId: string;

  it('PROF registra prontuário ligado a um appointment', async () => {
    // Cria um appointment via Prisma (sem precisar passar pela validação HTTP)
    const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // ontem
    const appt = await prisma.appointment.create({
      data: {
        unitId,
        patientId: patient.id,
        serviceId: service.id,
        planId: plan.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 50 * 60 * 1000),
        status: 'COMPLETED',
        consumedSession: true,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/medical-records')
      .set('Authorization', `Bearer ${profToken}`)
      .send({
        patientId: patient.id,
        appointmentId: appt.id,
        content: 'Paciente apresentou melhora de 30% na dor. Aumentar carga.',
        attachmentUrls: ['https://example.com/exame.pdf'],
      });
    expect(res.status).toBe(201);
    expect(res.body.content).toContain('melhora');
    expect(res.body.appointmentId).toBe(appt.id);
    expect(res.body.attachmentUrls).toEqual(['https://example.com/exame.pdf']);
    recordId = res.body.id;
  });

  it('PROF edita o próprio prontuário', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/medical-records/${recordId}`)
      .set('Authorization', `Bearer ${profToken}`)
      .send({ content: 'Texto atualizado: paciente reportou diminuição da dor.' });
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('atualizado');
  });

  it('PROF cria prontuário sem appointment (anotação avulsa)', async () => {
    const res = await request(app.getHttpServer())
      .post('/medical-records')
      .set('Authorization', `Bearer ${profToken}`)
      .send({
        patientId: patient.id,
        content: 'Reavaliação fora de sessão.',
      });
    expect(res.status).toBe(201);
    expect(res.body.appointmentId).toBeNull();
  });

  it('GET /patients/:id/medical-records ordena do mais recente', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patient.id}/medical-records`)
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    // primeiro deve ter createdAt > segundo
    const first = new Date(res.body[0].createdAt).getTime();
    const second = new Date(res.body[1].createdAt).getTime();
    expect(first).toBeGreaterThanOrEqual(second);
  });

  it('PATIENT vê os próprios prontuários via /me/medical-records', async () => {
    const res = await request(app.getHttpServer())
      .get('/me/medical-records')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('ADMIN pode ler, mas não criar', async () => {
    const read = await request(app.getHttpServer())
      .get(`/patients/${patient.id}/medical-records`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(read.status).toBe(200);

    const tryCreate = await request(app.getHttpServer())
      .post('/medical-records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patientId: patient.id, content: 'tentativa admin' });
    expect(tryCreate.status).toBe(403);
  });

  it('rejeita appointmentId de outro paciente (409)', async () => {
    // Cria outro paciente + outro appointment.
    const other = await prisma.patient.create({
      data: {
        unitId,
        fullName: 'Outro Paciente',
        cpf: '52998224725',
        birthDate: new Date('1990-01-01'),
        phone: '+55 31 99999-1234',
      },
    });
    const otherAppt = await prisma.appointment.create({
      data: {
        unitId,
        patientId: other.id,
        serviceId: service.id,
        planId: plan.id, // ok, hack pra teste
        startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 48 * 60 * 60 * 1000 + 50 * 60 * 1000),
        status: 'COMPLETED',
        consumedSession: true,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/medical-records')
      .set('Authorization', `Bearer ${profToken}`)
      .send({
        patientId: patient.id,
        appointmentId: otherAppt.id,
        content: 'erro deliberado',
      });
    expect(res.status).toBe(409);
  });
});
