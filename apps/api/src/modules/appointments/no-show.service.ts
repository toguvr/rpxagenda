import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { runWithoutUnitScope } from '../../common/cls/cls-helpers';
import { ClsService } from 'nestjs-cls';

/**
 * Job que varre agendamentos elegíveis a NO_SHOW e marca automaticamente.
 *
 * Elegibilidade:
 *   - status em SCHEDULED ou CONFIRMED (paciente ainda não fez check-in)
 *   - checkedInAt IS NULL
 *   - endsAt + service.noShowGraceMinutes < now
 *
 * O job é cross-tenant: roda em background, sem CLS de unidade. Usa
 * `runWithoutUnitScope` para opt-out da extensão Prisma de tenant.
 *
 * AuditLog gravado para cada appointment marcado, com actorId=null.
 *
 * Idempotente: rodar várias vezes sem novos appointments elegíveis é no-op.
 */
@Injectable()
export class NoShowService {
  private readonly logger = new Logger(NoShowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /** Cron a cada 5 minutos. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    try {
      // O cron roda fora de um request context — precisamos abrir um CLS run
      // para que `runWithoutUnitScope` funcione (ele assume cls.isActive()).
      await this.cls.run(async () => {
        await runWithoutUnitScope(this.cls, () => this.runNoShowSweep());
      });
    } catch (err) {
      this.logger.error({ err }, 'falha no NoShowJob');
    }
  }

  /**
   * Núcleo exposto para testes e disparos manuais.
   * Retorna a lista de appointmentIds marcados.
   */
  async runNoShowSweep(now: Date = new Date()): Promise<string[]> {
    // Postgres já entende a comparação date + interval. Em vez de buscar todos
    // os candidatos e iterar, fazemos uma sub-query que considera o noShowGraceMinutes
    // do service. Para manter código simples e portável, buscamos os IDs em JS
    // e atualizamos um a um dentro de uma única transação.
    const candidates = await this.prisma.appointment.findMany({
      where: {
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        checkedInAt: null,
        // pré-filtro grosseiro: endsAt < now (qualquer grace > 0 implica isto)
        endsAt: { lt: now },
      },
      select: {
        id: true,
        endsAt: true,
        consumedSession: true,
        status: true,
        service: { select: { noShowGraceMinutes: true } },
      },
    });

    const toMark = filterNoShowCandidates(candidates, now);

    if (toMark.length === 0) return [];

    const markedIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const appt of toMark) {
        await tx.appointment.update({
          where: { id: appt.id },
          data: { status: 'NO_SHOW' },
        });
        await tx.auditLog.create({
          data: {
            actorId: null,
            action: 'APPOINTMENT_AUTO_NO_SHOW',
            entity: 'Appointment',
            entityId: appt.id,
            before: { status: appt.status, consumedSession: appt.consumedSession },
            after: { status: 'NO_SHOW', consumedSession: appt.consumedSession },
          },
        });
        markedIds.push(appt.id);
      }
    });

    if (markedIds.length > 0) {
      this.logger.log({ count: markedIds.length }, 'NoShowJob marcou agendamentos como NO_SHOW');
    }
    return markedIds;
  }
}

void Prisma;

/**
 * Filtro puro testável: dado um conjunto de candidatos elegíveis e o instante atual,
 * devolve os que ultrapassaram `endsAt + noShowGraceMinutes`.
 */
export interface NoShowCandidate {
  id: string;
  endsAt: Date;
  service: { noShowGraceMinutes: number };
}
export function filterNoShowCandidates<T extends NoShowCandidate>(rows: T[], now: Date): T[] {
  return rows.filter(
    (c) => c.endsAt.getTime() + c.service.noShowGraceMinutes * 60 * 1000 < now.getTime(),
  );
}
