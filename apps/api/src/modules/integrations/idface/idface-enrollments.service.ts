import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type IdfaceCommand, type IdfaceCommandStep } from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { STORAGE_PROVIDER, type IStorageProvider } from '../../storage/storage.types';

interface CommandPayload {
  verb: string;
  endpoint: string;
  body: unknown;
  contentType: string;
}

/** Dono do enrollment: exatamente um entre paciente e profissional. */
type EnrollmentOwner =
  | { patientId: string; professionalId: null }
  | { patientId: null; professionalId: string };

/** Dados da pessoa que vão para o equipamento (`users.name` / `users.registration`). */
interface DevicePerson {
  fullName: string;
  /** CPF do paciente ou registro (CREFITO/CREF) do profissional. */
  registration: string;
}

/** Enrollment com o dono carregado — o suficiente para montar o próximo comando. */
const ENROLLMENT_WITH_OWNER = {
  patient: { select: { fullName: true, cpf: true } },
  professional: { select: { fullName: true, registry: true } },
} satisfies Prisma.IdfaceEnrollmentInclude;
type EnrollmentWithOwner = Prisma.IdfaceEnrollmentGetPayload<{
  include: typeof ENROLLMENT_WITH_OWNER;
}>;

/**
 * Gerencia o ciclo de cadastro de uma pessoa (paciente ou profissional) no
 * iDFace via Push:
 * 1. Admin salva foto → `enqueueEnrollment` / `enqueueProfessionalEnrollment`.
 * 2. Comandos vão sendo entregues ao device via /push (FIFO por unidade).
 * 3. Cada result do device avança a sequência:
 *      DESTROY (opcional) → CREATE_USER → SET_IMAGE → enrollment REGISTERED.
 *
 * Falhas em CREATE_USER ou SET_IMAGE marcam o enrollment FAILED. DESTROY que
 * falha (ex: user não existia) é tratado como noop e a sequência avança.
 */
@Injectable()
export class IdfaceEnrollmentsService {
  private readonly logger = new Logger(IdfaceEnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  // ---------- Enrollment trigger ----------

  /**
   * Inicia um ciclo de enrollment para o paciente. Chamado pelo `patients.service`
   * após a foto ser salva. Reusa o `idfaceUserId` do paciente se houver
   * (re-enroll, começa removendo o cadastro anterior do device); senão, gera um
   * novo `user_id` atômico via `Unit.nextIdfaceUserId`.
   */
  async enqueueEnrollment(patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        unitId: true,
        fullName: true,
        cpf: true,
        photoKey: true,
        idfaceUserId: true,
      },
    });
    if (!patient) throw new Error(`Paciente ${patientId} não encontrado.`);
    if (!patient.photoKey) {
      this.logger.warn({ patientId }, 'Enrollment ignorado — paciente sem photoKey.');
      return;
    }

    await this.startEnrollment({
      unitId: patient.unitId,
      owner: { patientId: patient.id, professionalId: null },
      person: { fullName: patient.fullName, registration: patient.cpf },
      photoKey: patient.photoKey,
      currentUserId: patient.idfaceUserId,
    });
  }

  /**
   * Mesmo ciclo de `enqueueEnrollment`, para o profissional. O `user_id` sai do
   * MESMO contador da unidade usado pelos pacientes, então os IDs nunca colidem
   * no equipamento. Chamado pelo `professionals.service` após a foto ser salva.
   */
  async enqueueProfessionalEnrollment(professionalId: string): Promise<void> {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: {
        id: true,
        unitId: true,
        fullName: true,
        registry: true,
        photoKey: true,
        idfaceUserId: true,
      },
    });
    if (!professional) throw new Error(`Profissional ${professionalId} não encontrado.`);
    if (!professional.photoKey) {
      this.logger.warn({ professionalId }, 'Enrollment ignorado — profissional sem photoKey.');
      return;
    }

    await this.startEnrollment({
      unitId: professional.unitId,
      owner: { patientId: null, professionalId: professional.id },
      person: { fullName: professional.fullName, registration: professional.registry },
      photoKey: professional.photoKey,
      currentUserId: professional.idfaceUserId,
    });
  }

  /** Cria o enrollment e enfileira o primeiro comando da sequência. */
  private async startEnrollment(input: {
    unitId: string;
    owner: EnrollmentOwner;
    person: DevicePerson;
    photoKey: string;
    /** `idfaceUserId` atual da pessoa (re-enroll) ou null (primeiro cadastro). */
    currentUserId: number | null;
  }): Promise<void> {
    const assignedUserId = input.currentUserId ?? (await this.allocateUserId(input.unitId));

    const enrollment = await this.prisma.idfaceEnrollment.create({
      data: {
        unitId: input.unitId,
        ...input.owner,
        photoKey: input.photoKey,
        assignedUserId,
        status: 'PENDING',
      },
    });

    // Re-enroll: começa pelo DESTROY. Cadastro novo: vai direto para CREATE_USER.
    const firstStep: IdfaceCommandStep = input.currentUserId !== null ? 'DESTROY' : 'CREATE_USER';
    await this.enqueueCommand(enrollment, input.person, firstStep, assignedUserId);
  }

  /**
   * Aloca o próximo `user_id` (int64) disponível na unidade — UPDATE atômico
   * com RETURNING evita race entre múltiplos enrollments simultâneos.
   */
  private async allocateUserId(unitId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ nextIdfaceUserId: number }[]>`
      UPDATE "units"
      SET "nextIdfaceUserId" = "nextIdfaceUserId" + 1
      WHERE "id" = ${unitId}
      RETURNING "nextIdfaceUserId" - 1 AS "nextIdfaceUserId"
    `;
    if (rows.length === 0) throw new Error(`Unit ${unitId} não encontrada.`);
    return rows[0].nextIdfaceUserId;
  }

  // ---------- Push (pop next command) ----------

  /**
   * Retorna o próximo comando `PENDING` da unidade do device. Marca como
   * `DISPATCHED` na mesma transação para evitar entrega duplicada caso o
   * device tenha múltiplos polls simultâneos.
   */
  async popNextCommand(
    unitId: string,
    deviceId: string,
  ): Promise<{ transactionid: string; payload: CommandPayload } | null> {
    return this.prisma.$transaction(async (tx) => {
      const cmd = await tx.idfaceCommand.findFirst({
        where: { unitId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!cmd) return null;
      // O protocolo Push correlaciona o resultado pelo `transactionid` que o
      // servidor envia no array `transactions` — o device o devolve em
      // `transactions_results`. Geramos um inteiro único e o guardamos em
      // dispatchUuid para casar o /result de volta.
      const transactionid = String(crypto.randomInt(1, 2 ** 31 - 1));
      await tx.idfaceCommand.update({
        where: { id: cmd.id },
        data: {
          status: 'DISPATCHED',
          deviceId,
          dispatchUuid: transactionid,
          dispatchedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      return { transactionid, payload: cmd.payload as unknown as CommandPayload };
    });
  }

  // ---------- Result (advance state machine) ----------

  /**
   * Marca o comando como concluído/falho e enfileira o próximo passo
   * conforme a sequência DESTROY → CREATE_USER → SET_IMAGE.
   */
  async recordResult(input: {
    transactionid: string;
    success?: boolean;
    response?: unknown;
    error?: string;
  }): Promise<void> {
    // Correlação pelo `transactionid` que enviamos no array `transactions` e
    // que o device devolve em `transactions_results` (gravado em dispatchUuid).
    const cmd = await this.prisma.idfaceCommand.findFirst({
      where: { dispatchUuid: input.transactionid },
      orderBy: { dispatchedAt: 'desc' },
    });
    if (!cmd) {
      this.logger.warn(
        { transactionid: input.transactionid },
        'Result recebido para transactionid desconhecido — ignorando.',
      );
      return;
    }
    if (cmd.status === 'DONE' || cmd.status === 'FAILED') {
      this.logger.log(
        { transactionid: input.transactionid },
        'Result idempotente — comando já finalizado.',
      );
      return;
    }

    // success quando o device sinaliza success !== false e não há error.
    const ok = input.success !== false && !input.error;
    this.logger.log(
      { transactionid: input.transactionid, step: cmd.step, ok, error: input.error ?? null },
      `Result recebido — ${cmd.step} ${ok ? 'OK' : 'FALHOU'}.`,
    );
    await this.prisma.idfaceCommand.update({
      where: { id: cmd.id },
      data: {
        status: ok ? 'DONE' : 'FAILED',
        // Persistimos o response do device em ambos os casos — em falha ele
        // costuma trazer o motivo (ex: rosto não detectado no SET_IMAGE).
        response: (input.response ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        error: input.error ?? null,
        completedAt: new Date(),
      },
    });

    if (ok) {
      await this.advanceAfterSuccess(cmd);
    } else {
      await this.handleFailure(cmd, input.error ?? 'Erro desconhecido');
    }
  }

  /** Encadeia o próximo passo do enrollment baseado no step que acabou de dar OK. */
  private async advanceAfterSuccess(cmd: IdfaceCommand): Promise<void> {
    const enrollment = await this.prisma.idfaceEnrollment.findUnique({
      where: { id: cmd.enrollmentId },
      include: ENROLLMENT_WITH_OWNER,
    });
    if (!enrollment) return;
    const person = this.personOf(enrollment);

    switch (cmd.step) {
      case 'DESTROY':
        await this.enqueueCommand(enrollment, person, 'CREATE_USER', enrollment.assignedUserId);
        return;
      case 'CREATE_USER':
        await this.enqueueCommand(enrollment, person, 'SET_IMAGE', enrollment.assignedUserId);
        return;
      case 'SET_IMAGE':
        // Sequência completa — marca enrollment REGISTERED e grava o idfaceUserId
        // no dono (paciente ou profissional). É a partir daqui que o totem o reconhece.
        await this.prisma.$transaction([
          this.prisma.idfaceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'REGISTERED', registeredAt: new Date(), lastError: null },
          }),
          enrollment.professionalId !== null
            ? this.prisma.professional.update({
                where: { id: enrollment.professionalId },
                data: { idfaceUserId: enrollment.assignedUserId },
              })
            : this.prisma.patient.update({
                where: { id: this.requirePatientId(enrollment) },
                data: { idfaceUserId: enrollment.assignedUserId },
              }),
        ]);
        this.logger.log(
          {
            enrollmentId: enrollment.id,
            patientId: enrollment.patientId,
            professionalId: enrollment.professionalId,
            assignedUserId: enrollment.assignedUserId,
          },
          'Enrollment iDFace concluído.',
        );
        return;
    }
  }

  /**
   * DESTROY falhando = a pessoa provavelmente nem existia no device. Não é
   * fatal: avança a sequência mesmo assim. Para CREATE_USER/SET_IMAGE, falha
   * marca o enrollment como FAILED.
   */
  private async handleFailure(cmd: IdfaceCommand, error: string): Promise<void> {
    if (cmd.step === 'DESTROY') {
      this.logger.warn({ uuid: cmd.uuid, error }, 'DESTROY falhou — seguindo para CREATE_USER.');
      const enrollment = await this.prisma.idfaceEnrollment.findUnique({
        where: { id: cmd.enrollmentId },
        include: ENROLLMENT_WITH_OWNER,
      });
      if (!enrollment) return;
      await this.enqueueCommand(
        enrollment,
        this.personOf(enrollment),
        'CREATE_USER',
        enrollment.assignedUserId,
      );
      return;
    }
    await this.prisma.idfaceEnrollment.update({
      where: { id: cmd.enrollmentId },
      data: { status: 'FAILED', failedAt: new Date(), lastError: error.slice(0, 500) },
    });
  }

  // ---------- helpers ----------

  /** Nome + matrícula que o equipamento recebe, conforme o dono do enrollment. */
  private personOf(enrollment: EnrollmentWithOwner): DevicePerson {
    if (enrollment.professional) {
      return {
        fullName: enrollment.professional.fullName,
        registration: enrollment.professional.registry,
      };
    }
    if (enrollment.patient) {
      return { fullName: enrollment.patient.fullName, registration: enrollment.patient.cpf };
    }
    // Inalcançável: o CHECK `idface_enrollments_owner_check` garante um dono.
    throw new Error(`Enrollment ${enrollment.id} sem paciente nem profissional.`);
  }

  private requirePatientId(enrollment: { id: string; patientId: string | null }): string {
    if (enrollment.patientId === null) {
      throw new Error(`Enrollment ${enrollment.id} sem paciente nem profissional.`);
    }
    return enrollment.patientId;
  }

  private async enqueueCommand(
    enrollment: {
      id: string;
      unitId: string;
      patientId: string | null;
      professionalId: string | null;
      photoKey: string;
    },
    person: DevicePerson,
    step: IdfaceCommandStep,
    userId: number,
  ): Promise<void> {
    const payload = await this.buildPayload(step, userId, person, enrollment.photoKey);
    await this.prisma.idfaceCommand.create({
      data: {
        unitId: enrollment.unitId,
        enrollmentId: enrollment.id,
        patientId: enrollment.patientId,
        professionalId: enrollment.professionalId,
        step,
        payload: payload as unknown as Prisma.InputJsonValue,
        uuid: crypto.randomUUID(),
        status: 'PENDING',
      },
    });
  }

  private async buildPayload(
    step: IdfaceCommandStep,
    userId: number,
    person: DevicePerson,
    photoKey: string,
  ): Promise<CommandPayload> {
    switch (step) {
      case 'DESTROY':
        return {
          verb: 'POST',
          // No modo Push o endpoint é o NOME PURO do comando (sem .fcgi e sem
          // barra) — o device mapeia internamente para /destroy_objects.fcgi.
          endpoint: 'destroy_objects',
          body: { object: 'users', where: { users: { id: userId } } },
          contentType: 'application/json',
        };
      case 'CREATE_USER':
        return {
          verb: 'POST',
          endpoint: 'create_objects',
          body: {
            object: 'users',
            values: [{ id: userId, name: person.fullName, registration: person.registration }],
          },
          contentType: 'application/json',
        };
      case 'SET_IMAGE': {
        const bytes = await this.storage.downloadBytes(photoKey);
        return {
          verb: 'POST',
          endpoint: 'user_set_image_list',
          body: {
            // match=false: não rejeitar por face já cadastrada. O device exige
            // BOOLEANO aqui (retorna "Invalid member 'match' (boolean expected,
            // got uint64)" se enviar número).
            match: false,
            user_images: [
              {
                user_id: userId,
                timestamp: Math.floor(Date.now() / 1000),
                image: bytes.toString('base64'),
              },
            ],
          },
          contentType: 'application/json',
        };
      }
    }
  }
}
