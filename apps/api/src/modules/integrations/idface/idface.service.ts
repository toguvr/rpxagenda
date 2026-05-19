import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type IdfaceEventOutcome as IdfaceEventOutcomeDb } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { IdfaceWebhookPayload, IdfaceWebhookResponse } from '@rpx/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CLS_KEYS } from '../../../common/cls/cls-keys';
import { AppointmentsService } from '../../appointments/appointments.service';
import { pickEligibleAppointment } from './match-appointment';

@Injectable()
export class IdfaceService {
  private readonly logger = new Logger(IdfaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly appointments: AppointmentsService,
  ) {}

  /**
   * Processa um evento iDFace. Idempotente por `(deviceId, eventAt, idfaceUserId)`:
   * reenvios do equipamento devolvem a mesma resposta sem reagir.
   */
  async processEvent(
    payload: IdfaceWebhookPayload,
    now: Date = new Date(),
  ): Promise<IdfaceWebhookResponse> {
    // 1. Idempotência: se já temos um evento idêntico, retorna a mesma resposta.
    const existing = await this.prisma.idfaceEvent.findUnique({
      where: {
        deviceId_eventAt_idfaceUserId: {
          deviceId: payload.deviceId,
          eventAt: payload.timestamp,
          idfaceUserId: payload.idfaceUserId,
        },
      },
    });
    if (existing) {
      this.logger.log(
        { deviceId: payload.deviceId, eventId: existing.id },
        'Evento iDFace idempotente — retornando resposta original',
      );
      return this.buildResponse(existing.outcome, existing.accessGranted, existing.appointmentId);
    }

    // 2. Localiza o paciente pelo idfaceUserId (lookup global; Patient.idfaceUserId é unique).
    const patient = await this.prisma.patient.findUnique({
      where: { idfaceUserId: payload.idfaceUserId },
      select: { id: true, unitId: true },
    });

    if (!patient) {
      // Sem paciente, gravamos o evento contra a primeira Unit para diagnose.
      // PREMISSA: admin investiga via dashboard de eventos negados.
      const anyUnit = await this.prisma.unit.findFirst({ select: { id: true } });
      if (!anyUnit) throw new Error('Sem Unit cadastrada — não é possível gravar evento.');
      await this.saveEvent({
        unitId: anyUnit.id,
        payload,
        accessGranted: false,
        outcome: 'PATIENT_NOT_FOUND',
        patientId: null,
        appointmentId: null,
      });
      return this.buildResponse('PATIENT_NOT_FOUND', false, null);
    }

    // 3. No contexto da unidade do paciente, busca candidatos elegíveis.
    return this.cls.run(async () => {
      this.cls.set(CLS_KEYS.UNIT_ID, patient.unitId);
      const candidates = await this.prisma.scoped.appointment.findMany({
        where: {
          patientId: patient.id,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'NO_SHOW'] },
          // janela bruta de 2h para reduzir candidatos antes do match preciso
          startsAt: {
            gte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
            lte: new Date(now.getTime() + 2 * 60 * 60 * 1000),
          },
        },
        include: {
          service: {
            select: { checkInWindowBeforeMin: true, checkInWindowAfterMin: true },
          },
        },
      });

      const elegible = pickEligibleAppointment(candidates, now);

      if (!elegible) {
        await this.saveEvent({
          unitId: patient.unitId,
          payload,
          accessGranted: false,
          outcome: 'NO_APPOINTMENT_IN_WINDOW',
          patientId: patient.id,
          appointmentId: null,
        });
        return this.buildResponse('NO_APPOINTMENT_IN_WINDOW', false, null);
      }

      // 4. Realiza o check-in (com reversão automática se for NO_SHOW).
      const { response, revertedNoShow } = await this.appointments.checkInAcceptingLateNoShow(
        elegible.id,
        now,
      );

      const outcome: IdfaceEventOutcomeDb = revertedNoShow
        ? 'CHECKIN_OK_REVERTED_NO_SHOW'
        : response.status === 'CHECKED_IN' &&
            response.checkedInAt &&
            response.checkedInAt.getTime() === now.getTime()
          ? 'CHECKIN_OK'
          : 'ALREADY_CHECKED_IN';

      await this.saveEvent({
        unitId: patient.unitId,
        payload,
        accessGranted: true,
        outcome,
        patientId: patient.id,
        appointmentId: response.id,
      });

      return this.buildResponse(outcome, true, response.id);
    });
  }

  // -------- helpers --------

  private async saveEvent(input: {
    unitId: string;
    payload: IdfaceWebhookPayload;
    accessGranted: boolean;
    outcome: IdfaceEventOutcomeDb;
    patientId: string | null;
    appointmentId: string | null;
  }): Promise<void> {
    try {
      await this.prisma.idfaceEvent.create({
        data: {
          unitId: input.unitId,
          deviceId: input.payload.deviceId,
          idfaceUserId: input.payload.idfaceUserId,
          eventAt: input.payload.timestamp,
          accessGranted: input.accessGranted,
          outcome: input.outcome,
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          rawPayload: input.payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Race rara: outro request paralelo gravou o mesmo evento por idempotência.
      // Ignorar P2002 — o caller vai retornar a resposta correta de qualquer jeito.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(
          { deviceId: input.payload.deviceId },
          'Evento iDFace duplicado (P2002) — ignorando',
        );
        return;
      }
      throw err;
    }
  }

  private buildResponse(
    outcome: IdfaceEventOutcomeDb,
    accessGranted: boolean,
    appointmentId: string | null,
  ): IdfaceWebhookResponse {
    return {
      accessGranted,
      outcome,
      appointmentId,
      message: this.messageFor(outcome),
    };
  }

  private messageFor(outcome: IdfaceEventOutcomeDb): string {
    switch (outcome) {
      case 'CHECKIN_OK':
        return 'Check-in realizado com sucesso.';
      case 'CHECKIN_OK_REVERTED_NO_SHOW':
        return 'Check-in realizado (NO_SHOW automático revertido).';
      case 'ALREADY_CHECKED_IN':
        return 'Paciente já tinha feito check-in.';
      case 'NO_APPOINTMENT_IN_WINDOW':
        return 'Nenhum agendamento válido para este horário.';
      case 'PATIENT_NOT_FOUND':
        return 'Paciente não cadastrado.';
    }
  }
}
