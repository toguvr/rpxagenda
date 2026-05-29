import { Injectable } from '@nestjs/common';
import { Prisma, type MedicalRecord as MedicalRecordRow } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type {
  CreateMedicalRecordRequest,
  MedicalRecordResponse,
  UpdateMedicalRecordRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(
    actorUserId: string,
    data: CreateMedicalRecordRequest,
  ): Promise<MedicalRecordResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    // Autor: se vier no corpo (caso do admin), usa-o; senão deriva do usuário (profissional).
    const professional = data.professionalId
      ? await this.prisma.scoped.professional.findFirst({
          where: { id: data.professionalId },
          select: { id: true, active: true },
        })
      : await this.prisma.scoped.professional.findFirst({
          where: { userId: actorUserId },
          select: { id: true, active: true },
        });
    if (!professional) {
      throw new ResourceConflictException(
        data.professionalId
          ? 'Profissional informado não encontrado nesta unidade.'
          : 'Informe o profissional responsável pela evolução.',
      );
    }
    if (!professional.active) {
      throw new ResourceConflictException('Profissional inativo não pode registrar prontuário.');
    }

    const patient = await this.prisma.scoped.patient.findFirst({
      where: { id: data.patientId },
      select: { id: true },
    });
    if (!patient) throw new ResourceNotFoundException('Paciente');

    if (data.appointmentId) {
      const appt = await this.prisma.scoped.appointment.findFirst({
        where: { id: data.appointmentId },
        select: { id: true, patientId: true },
      });
      if (!appt) throw new ResourceNotFoundException('Agendamento');
      if (appt.patientId !== data.patientId) {
        throw new ResourceConflictException('Agendamento informado não pertence ao paciente.');
      }
    }

    const row = await this.prisma.scoped.medicalRecord.create({
      data: {
        unitId,
        patientId: data.patientId,
        professionalId: professional.id,
        appointmentId: data.appointmentId ?? null,
        content: data.content,
        attachmentUrls: data.attachmentUrls,
      } as Prisma.MedicalRecordUncheckedCreateInput,
    });
    return this.toResponse(row);
  }

  async findById(id: string): Promise<MedicalRecordResponse> {
    const row = await this.prisma.scoped.medicalRecord.findFirst({ where: { id } });
    if (!row) throw new ResourceNotFoundException('Prontuário');
    return this.toResponse(row);
  }

  async listForPatient(patientId: string): Promise<MedicalRecordResponse[]> {
    const rows = await this.prisma.scoped.medicalRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async listForCurrentPatientUser(userId: string): Promise<MedicalRecordResponse[]> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!patient) return [];
    return this.listForPatient(patient.id);
  }

  async update(
    id: string,
    actorUserId: string,
    isAdmin: boolean,
    data: UpdateMedicalRecordRequest,
  ): Promise<MedicalRecordResponse> {
    const existing = await this.prisma.scoped.medicalRecord.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Prontuário');

    // ADMIN pode editar qualquer um; PROFESSIONAL só o que ele mesmo registrou.
    if (!isAdmin) {
      const professional = await this.prisma.scoped.professional.findFirst({
        where: { userId: actorUserId },
        select: { id: true },
      });
      if (!professional || professional.id !== existing.professionalId) {
        throw new ResourceConflictException(
          'Apenas o profissional que registrou o prontuário (ou um admin) pode editá-lo.',
        );
      }
    }

    const row = await this.prisma.scoped.medicalRecord.update({
      where: { id },
      data: {
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.attachmentUrls !== undefined ? { attachmentUrls: data.attachmentUrls } : {}),
      },
    });
    return this.toResponse(row);
  }

  // -------- helpers --------

  private toResponse(row: MedicalRecordRow): MedicalRecordResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      patientId: row.patientId,
      professionalId: row.professionalId,
      appointmentId: row.appointmentId,
      content: row.content,
      attachmentUrls: row.attachmentUrls,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
