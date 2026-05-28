import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, type Patient as PatientRow } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import type {
  CreatePatientRequest,
  InviteLookupResponse,
  InviteResponse,
  LoginResponse,
  PatientResponse,
  UpdatePatientRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import { TypedConfigService } from '../../config/typed-config.service';
import {
  InviteInvalidException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { AuthService } from '../auth/auth.service';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 7;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TypedConfigService,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
  ) {}

  /** Apenas ADMIN pode definir/visualizar o apelido/referência interna. */
  private isAdmin(): boolean {
    return this.cls.get<string>(CLS_KEYS.ROLE) === UserRole.ADMIN;
  }

  // -------------- CRUD do paciente --------------

  async create(data: CreatePatientRequest): Promise<PatientResponse> {
    // Não-admin não pode gravar o apelido/referência interna.
    const sanitized = this.isAdmin() ? data : { ...data, adminReference: undefined };
    try {
      const row = await this.prisma.scoped.patient.create({
        data: sanitized as unknown as Prisma.PatientUncheckedCreateInput,
      });
      return this.toResponse(row);
    } catch (err) {
      throw this.mapError(err, data.cpf);
    }
  }

  async findMany(): Promise<PatientResponse[]> {
    const rows = await this.prisma.scoped.patient.findMany({ orderBy: { fullName: 'asc' } });
    return rows.map((r) => this.toResponse(r));
  }

  async findById(id: string): Promise<PatientResponse> {
    const row = await this.prisma.scoped.patient.findFirst({ where: { id } });
    if (!row) throw new ResourceNotFoundException('Paciente');
    return this.toResponse(row);
  }

  async update(id: string, data: UpdatePatientRequest): Promise<PatientResponse> {
    await this.findById(id);
    // Não-admin não pode alterar o apelido/referência interna.
    const sanitized = this.isAdmin() ? data : { ...data, adminReference: undefined };
    try {
      const row = await this.prisma.scoped.patient.update({
        where: { id },
        data: sanitized as Prisma.PatientUncheckedUpdateInput,
      });
      return this.toResponse(row);
    } catch (err) {
      throw this.mapError(err, data.cpf);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    try {
      await this.prisma.scoped.patient.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceConflictException(
          'Paciente possui vínculos (planos, agendamentos, prontuários) e não pode ser removido.',
        );
      }
      throw err;
    }
  }

  // -------------- invite flow --------------

  /**
   * Gera um novo convite para o paciente. Não revoga convites anteriores ativos
   * automaticamente — admin pode usar a UI para regenerar quantos quiser; o último
   * usado consome a vaga.
   * Retorna o token plain (apenas uma vez); o backend persiste apenas o hash.
   */
  async generateInvite(patientId: string): Promise<InviteResponse> {
    const patient = await this.prisma.scoped.patient.findFirst({ where: { id: patientId } });
    if (!patient) throw new ResourceNotFoundException('Paciente');
    if (patient.userId) {
      throw new ResourceConflictException(
        'Paciente já possui conta de acesso; não é necessário enviar novo convite.',
      );
    }

    const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.patientInvite.create({
      data: { patientId, tokenHash, expiresAt },
    });

    return {
      id: invite.id,
      patientId,
      token,
      expiresAt,
      redeemPath: `/patient-invites/${token}/redeem`,
    };
  }

  /**
   * Endpoint público: dado o token plain, devolve o paciente associado (subset
   * de dados, suficiente para a tela de cadastro pré-preencher).
   */
  async lookupInvite(token: string): Promise<InviteLookupResponse> {
    const invite = await this.findActiveInviteOrThrow(token);
    const patient = await this.prisma.patient.findUnique({
      where: { id: invite.patientId },
      select: { fullName: true, email: true, cpf: true },
    });
    if (!patient) throw new InviteInvalidException();
    return { patient, expiresAt: invite.expiresAt };
  }

  /**
   * Endpoint público: paciente define senha e o sistema cria o User PATIENT,
   * vincula ao Patient, marca o convite como redeemido. Retorna par de tokens
   * pronto para o app (mesmo formato do POST /auth/login).
   */
  async redeemInvite(token: string, password: string): Promise<LoginResponse> {
    const invite = await this.findActiveInviteOrThrow(token);
    const patient = await this.prisma.patient.findUnique({ where: { id: invite.patientId } });
    if (!patient) throw new InviteInvalidException();
    if (patient.userId) {
      throw new InviteInvalidException('Convite já redimido; faça login normalmente.');
    }
    if (!patient.email) {
      throw new ResourceConflictException(
        'Paciente sem email cadastrado — não é possível criar conta de acesso. Solicite ao admin que adicione o email.',
      );
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: patient.email!,
          passwordHash,
          fullName: patient.fullName,
          role: UserRole.PATIENT,
          unitId: patient.unitId,
        },
      });
      await tx.patient.update({ where: { id: patient.id }, data: { userId: created.id } });
      await tx.patientInvite.update({
        where: { id: invite.id },
        data: { redeemedAt: new Date() },
      });
      return created;
    });

    return this.auth.issueLoginTokens(user);
  }

  // -------------- helpers --------------

  private hashInviteToken(token: string): string {
    return crypto
      .createHmac('sha256', this.config.get('JWT_REFRESH_SECRET'))
      .update(token)
      .digest('hex');
  }

  private async findActiveInviteOrThrow(token: string) {
    const tokenHash = this.hashInviteToken(token);
    const invite = await this.prisma.patientInvite.findUnique({ where: { tokenHash } });
    if (!invite) throw new InviteInvalidException();
    if (invite.redeemedAt) throw new InviteInvalidException('Convite já utilizado.');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new InviteInvalidException('Convite expirado.');
    }
    return invite;
  }

  private mapError(err: unknown, cpf?: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ResourceConflictException(
        cpf
          ? `Já existe paciente com CPF ${cpf} nesta unidade.`
          : 'Já existe paciente com este CPF nesta unidade.',
      );
    }
    return err as Error;
  }

  private toResponse(row: PatientRow): PatientResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      userId: row.userId,
      fullName: row.fullName,
      cpf: row.cpf,
      birthDate: row.birthDate,
      phone: row.phone,
      email: row.email,
      emergencyContact: row.emergencyContact,
      notes: row.notes,
      // Oculto de PROFESSIONAL/PATIENT — só ADMIN recebe o valor.
      adminReference: this.isAdmin() ? row.adminReference : null,
      hasIdfaceEnrolled: !!row.idfaceUserId,
      hasUserAccount: !!row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
