import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { CreateProtocolRequest, ProtocolResponse, UpdateProtocolRequest } from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

@Injectable()
export class ProtocolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(data: CreateProtocolRequest): Promise<ProtocolResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    const [patient, professional, plan] = await Promise.all([
      this.prisma.scoped.patient.findFirst({ where: { id: data.patientId }, select: { id: true } }),
      this.prisma.scoped.professional.findFirst({
        where: { id: data.professionalId },
        select: { id: true, active: true },
      }),
      this.prisma.scoped.plan.findFirst({
        where: { id: data.planId },
        select: { id: true, patientId: true },
      }),
    ]);

    if (!patient) throw new ResourceNotFoundException('Paciente');
    if (!professional) throw new ResourceNotFoundException('Profissional');
    if (!plan) throw new ResourceNotFoundException('Plano');
    if (!professional.active) {
      throw new ResourceConflictException('Profissional inativo não pode criar protocolo.');
    }
    if (plan.patientId !== data.patientId) {
      throw new ResourceConflictException('Plano informado não pertence ao paciente.');
    }
    if (data.equipmentIds.length > 0) {
      await this.assertEquipmentsExist(data.equipmentIds);
    }

    const existingActive = await this.prisma.scoped.protocol.findFirst({
      where: { planId: data.planId, active: true },
      select: { id: true },
    });
    if (existingActive) {
      throw new ResourceConflictException(
        `Já existe protocolo ativo para este plano (id ${existingActive.id}). Desative antes de criar outro.`,
      );
    }

    const row = await this.prisma.scoped.protocol.create({
      data: {
        unitId,
        patientId: data.patientId,
        professionalId: data.professionalId,
        planId: data.planId,
        totalSessions: data.totalSessions,
        sessionsPerWeek: data.sessionsPerWeek,
        diagnosis: data.diagnosis,
        observations: data.observations ?? null,
        equipments: {
          create: data.equipmentIds.map((equipmentId) => ({ equipmentId })),
        },
      } as Prisma.ProtocolUncheckedCreateInput,
      include: { equipments: true },
    });
    return this.toResponse(row);
  }

  async findById(id: string): Promise<ProtocolResponse> {
    const row = await this.prisma.scoped.protocol.findFirst({
      where: { id },
      include: { equipments: true },
    });
    if (!row) throw new ResourceNotFoundException('Protocolo');
    return this.toResponse(row);
  }

  async listForPatient(patientId: string): Promise<ProtocolResponse[]> {
    const rows = await this.prisma.scoped.protocol.findMany({
      where: { patientId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { equipments: true },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async update(id: string, data: UpdateProtocolRequest): Promise<ProtocolResponse> {
    const existing = await this.prisma.scoped.protocol.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Protocolo');

    if (data.equipmentIds) {
      await this.assertEquipmentsExist(data.equipmentIds);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const patch: Prisma.ProtocolUncheckedUpdateInput = {};
      if (data.totalSessions !== undefined) patch.totalSessions = data.totalSessions;
      if (data.sessionsPerWeek !== undefined) patch.sessionsPerWeek = data.sessionsPerWeek;
      if (data.diagnosis !== undefined) patch.diagnosis = data.diagnosis;
      if (data.observations !== undefined) patch.observations = data.observations;
      if (data.active !== undefined) patch.active = data.active;

      if (data.equipmentIds) {
        await tx.protocolEquipment.deleteMany({ where: { protocolId: id } });
        if (data.equipmentIds.length > 0) {
          await tx.protocolEquipment.createMany({
            data: data.equipmentIds.map((equipmentId) => ({ protocolId: id, equipmentId })),
          });
        }
      }

      return tx.protocol.update({
        where: { id },
        data: patch,
        include: { equipments: true },
      });
    });

    return this.toResponse(result);
  }

  // -------- helpers --------

  private async assertEquipmentsExist(ids: string[]): Promise<void> {
    const unique = Array.from(new Set(ids));
    const found = await this.prisma.scoped.equipment.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const missing = unique.filter((x) => !found.some((f) => f.id === x));
      throw new ResourceConflictException(
        `Equipamentos não encontrados na unidade: ${missing.join(', ')}`,
      );
    }
  }

  private toResponse(row: {
    id: string;
    unitId: string;
    patientId: string;
    professionalId: string;
    planId: string;
    totalSessions: number;
    sessionsPerWeek: number;
    diagnosis: string;
    observations: string | null;
    active: boolean;
    equipments: { equipmentId: string }[];
    createdAt: Date;
    updatedAt: Date;
  }): ProtocolResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      patientId: row.patientId,
      professionalId: row.professionalId,
      planId: row.planId,
      totalSessions: row.totalSessions,
      sessionsPerWeek: row.sessionsPerWeek,
      diagnosis: row.diagnosis,
      observations: row.observations,
      active: row.active,
      equipmentIds: row.equipments.map((e) => e.equipmentId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
