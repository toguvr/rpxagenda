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

/**
 * Gerencia o ciclo de cadastro do paciente no iDFace via Push:
 * 1. Admin salva foto → `enqueueEnrollment` é chamado.
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
   * (re-enroll); senão, gera um novo `user_id` atômico via `Unit.nextIdfaceUserId`.
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

    const reusedUserId = patient.idfaceUserId;
    const assignedUserId = reusedUserId ?? (await this.allocateUserId(patient.unitId));

    const enrollment = await this.prisma.idfaceEnrollment.create({
      data: {
        unitId: patient.unitId,
        patientId: patient.id,
        photoKey: patient.photoKey,
        assignedUserId,
        status: 'PENDING',
      },
    });

    // Re-enroll: começa pelo DESTROY. Cadastro novo: vai direto para CREATE_USER.
    if (reusedUserId !== null) {
      await this.enqueueCommand(enrollment, patient, 'DESTROY', assignedUserId);
    } else {
      await this.enqueueCommand(enrollment, patient, 'CREATE_USER', assignedUserId);
    }
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
      include: {
        patient: { select: { id: true, fullName: true, cpf: true, photoKey: true } },
      },
    });
    if (!enrollment) return;

    switch (cmd.step) {
      case 'DESTROY':
        await this.enqueueCommand(
          enrollment,
          enrollment.patient,
          'CREATE_USER',
          enrollment.assignedUserId,
        );
        return;
      case 'CREATE_USER':
        await this.enqueueCommand(
          enrollment,
          enrollment.patient,
          'SET_IMAGE',
          enrollment.assignedUserId,
        );
        return;
      case 'SET_IMAGE':
        // Sequência completa — marca enrollment REGISTERED e atualiza Patient.idfaceUserId.
        await this.prisma.$transaction([
          this.prisma.idfaceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'REGISTERED', registeredAt: new Date(), lastError: null },
          }),
          this.prisma.patient.update({
            where: { id: enrollment.patientId },
            data: { idfaceUserId: enrollment.assignedUserId },
          }),
        ]);
        this.logger.log(
          {
            enrollmentId: enrollment.id,
            patientId: enrollment.patientId,
            assignedUserId: enrollment.assignedUserId,
          },
          'Enrollment iDFace concluído.',
        );
        return;
    }
  }

  /**
   * DESTROY falhando = paciente provavelmente nem existia no device. Não é
   * fatal: avança a sequência mesmo assim. Para CREATE_USER/SET_IMAGE, falha
   * marca o enrollment como FAILED.
   */
  private async handleFailure(cmd: IdfaceCommand, error: string): Promise<void> {
    if (cmd.step === 'DESTROY') {
      this.logger.warn({ uuid: cmd.uuid, error }, 'DESTROY falhou — seguindo para CREATE_USER.');
      const enrollment = await this.prisma.idfaceEnrollment.findUnique({
        where: { id: cmd.enrollmentId },
        include: {
          patient: { select: { id: true, fullName: true, cpf: true, photoKey: true } },
        },
      });
      if (!enrollment) return;
      await this.enqueueCommand(
        enrollment,
        enrollment.patient,
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

  private async enqueueCommand(
    enrollment: { id: string; unitId: string; patientId: string; photoKey: string },
    patient: { fullName: string; cpf: string },
    step: IdfaceCommandStep,
    userId: number,
  ): Promise<void> {
    const payload = await this.buildPayload(step, userId, patient, enrollment.photoKey);
    await this.prisma.idfaceCommand.create({
      data: {
        unitId: enrollment.unitId,
        enrollmentId: enrollment.id,
        patientId: enrollment.patientId,
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
    patient: { fullName: string; cpf: string },
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
            values: [{ id: userId, name: patient.fullName, registration: patient.cpf }],
          },
          contentType: 'application/json',
        };
      case 'SET_IMAGE': {
        const bytes = await this.storage.downloadBytes(photoKey);
        return {
          verb: 'POST',
          endpoint: 'user_set_image_list',
          body: {
            // match=0: não rejeitar por face já cadastrada — recomendado pela
            // ControliD para cadastro, evita falha em re-enroll do mesmo rosto.
            match: 0,
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
