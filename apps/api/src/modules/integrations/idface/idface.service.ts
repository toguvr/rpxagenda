import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type IdfaceEventOutcome as IdfaceEventOutcomeDb } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { IdfaceWebhookPayload, IdfaceWebhookResponse } from '@rpx/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CLS_KEYS } from '../../../common/cls/cls-keys';
import { AppointmentsService } from '../../appointments/appointments.service';
import { IdfaceDevicesService } from './idface-devices.service';
import { pickEligibleAppointment } from './match-appointment';

@Injectable()
export class IdfaceService {
  private readonly logger = new Logger(IdfaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly appointments: AppointmentsService,
    private readonly devices: IdfaceDevicesService,
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

    // 2. Resolve a unidade pelo device (multi-tenant: cada totem pertence a uma unidade).
    const device = await this.devices.findByDeviceId(payload.deviceId);
    if (!device || !device.active) {
      // Device desconhecido — registramos contra a primeira Unit só para diagnose.
      const anyUnit = await this.prisma.unit.findFirst({ select: { id: true } });
      if (!anyUnit) throw new Error('Sem Unit cadastrada — não é possível gravar evento.');
      this.logger.warn({ deviceId: payload.deviceId }, 'Device iDFace não registrado ou inativo.');
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

    // 3. Localiza o paciente pelo idfaceUserId DENTRO da unidade do device.
    const idfaceUserIdInt = Number.parseInt(payload.idfaceUserId, 10);
    const patient = Number.isFinite(idfaceUserIdInt)
      ? await this.prisma.patient.findFirst({
          where: { unitId: device.unitId, idfaceUserId: idfaceUserIdInt },
          select: { id: true, unitId: true },
        })
      : null;

    if (!patient) {
      await this.saveEvent({
        unitId: device.unitId,
        payload,
        accessGranted: false,
        outcome: 'PATIENT_NOT_FOUND',
        patientId: null,
        appointmentId: null,
      });
      return this.buildResponse('PATIENT_NOT_FOUND', false, null);
    }

    // 4. No contexto da unidade do paciente, busca candidatos elegíveis.
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

  /**
   * Modo Pro/online do iDFace: o device chama `POST /new_user_identified.fcgi`
   * (form-urlencoded) a cada identificação e espera a resposta que abre a porta.
   * Reaproveitamos toda a regra de check-in de `processEvent` e mapeamos para o
   * formato `{ result: { event, actions } }` que o equipamento entende:
   *   event 7 = liberar (+ action door), event 6 = negar.
   */
  async processOnlineIdentification(input: {
    deviceId: string;
    userId: string;
    timeUnix?: number;
    portalId: number;
  }): Promise<{
    result: {
      event: number;
      user_id: number;
      user_name: string;
      user_image: boolean;
      portal_id: number;
      actions?: { action: string; parameters: string }[];
    };
  }> {
    const timestamp = input.timeUnix ? new Date(input.timeUnix * 1000) : new Date();
    const res = await this.processEvent({
      deviceId: input.deviceId,
      idfaceUserId: input.userId,
      timestamp,
    });

    // Nome para exibir no totem (best-effort, só quando libera).
    let userName = '';
    if (res.accessGranted) {
      const device = await this.devices.findByDeviceId(input.deviceId);
      const uid = Number.parseInt(input.userId, 10);
      if (device && Number.isFinite(uid)) {
        const patient = await this.prisma.patient.findFirst({
          where: { unitId: device.unitId, idfaceUserId: uid },
          select: { fullName: true },
        });
        userName = patient?.fullName ?? '';
      }
    }

    const userIdNum = Number.parseInt(input.userId, 10);
    return {
      result: {
        event: res.accessGranted ? 7 : 6,
        user_id: Number.isFinite(userIdNum) ? userIdNum : 0,
        user_name: userName,
        user_image: false,
        portal_id: input.portalId,
        ...(res.accessGranted ? { actions: [{ action: 'door', parameters: 'door=1' }] } : {}),
      },
    };
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
