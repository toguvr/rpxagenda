import { Inject, Injectable, Logger } from '@nestjs/common';
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
  PhotoUploadUrlResponse,
  UpdatePatientRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import { TypedConfigService } from '../../config/typed-config.service';
import { STORAGE_PROVIDER, type IStorageProvider } from '../storage/storage.types';
import { EMAIL_PROVIDER, type IEmailProvider } from '../email/email.types';
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
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TypedConfigService,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
  ) {}

  // -------------- foto do paciente (S3 presigned) --------------

  /** Gera a object key + URL assinada de upload (PUT direto no S3). */
  async getPhotoUploadUrl(id: string, contentType: string): Promise<PhotoUploadUrlResponse> {
    await this.findById(id);
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const key = `patients/${id}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.presignUpload(key, contentType);
    return { key, uploadUrl };
  }

  /** Confirma a foto após o upload: valida a key e persiste em photoKey. */
  async savePhoto(id: string, key: string): Promise<PatientResponse> {
    await this.findById(id);
    if (!key.startsWith(`patients/${id}/`)) {
      throw new ResourceConflictException('A key informada não pertence a este paciente.');
    }
    const row = await this.prisma.scoped.patient.update({ where: { id }, data: { photoKey: key } });
    return this.toResponse(row);
  }

  /** URL assinada de leitura da foto, ou null se não houver. */
  async getPhotoUrl(id: string): Promise<{ url: string | null }> {
    const patient = await this.prisma.scoped.patient.findFirst({ where: { id } });
    if (!patient) throw new ResourceNotFoundException('Paciente');
    if (!patient.photoKey) return { url: null };
    return { url: await this.storage.presignDownload(patient.photoKey) };
  }

  /** Endpoint do app: foto do paciente autenticado (resolve pelo userId). */
  async getMyPhotoUrl(): Promise<{ url: string | null }> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID);
    if (!userId) throw new Error('User context missing.');
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { photoKey: true },
    });
    if (!patient?.photoKey) return { url: null };
    return { url: await this.storage.presignDownload(patient.photoKey) };
  }

  /** Apenas ADMIN pode definir/visualizar o apelido/referência interna. */
  private isAdmin(): boolean {
    return this.cls.get<string>(CLS_KEYS.ROLE) === UserRole.ADMIN;
  }

  // -------------- CRUD do paciente --------------

  async create(data: CreatePatientRequest): Promise<PatientResponse> {
    // Não-admin não pode gravar o apelido/referência interna.
    const sanitized = this.isAdmin() ? data : { ...data, adminReference: undefined };
    let row: PatientRow;
    try {
      row = await this.prisma.scoped.patient.create({
        data: sanitized as unknown as Prisma.PatientUncheckedCreateInput,
      });
    } catch (err) {
      throw this.mapError(err, data.cpf);
    }
    // Best-effort: se tem e-mail, já gera o convite e envia (não bloqueia o cadastro).
    if (row.email) {
      await this.sendInviteEmail(row.id, row.fullName, row.email);
    }
    return this.toResponse(row);
  }

  /** Gera um convite e envia por e-mail. Falhas são logadas, nunca propagadas. */
  private async sendInviteEmail(patientId: string, fullName: string, email: string): Promise<void> {
    try {
      const invite = await this.generateInvite(patientId);
      const url = `${this.config.get('ADMIN_PUBLIC_URL')}${invite.redeemPath}`;
      const expira = invite.expiresAt.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
      const firstName = fullName.split(' ')[0];
      await this.email.send({
        to: email,
        subject: 'Crie seu acesso — RPX Expert',
        text:
          `Olá, ${firstName}!\n\n` +
          `Você foi cadastrado(a) na RPX Expert. Crie sua senha de acesso pelo link abaixo ` +
          `(válido até ${expira}):\n${url}\n\n` +
          `Depois é só entrar no app com o e-mail ${email} e a senha escolhida.`,
        html:
          `<p>Olá, <strong>${firstName}</strong>!</p>` +
          `<p>Você foi cadastrado(a) na <strong>RPX Expert</strong>. Crie sua senha de acesso ` +
          `(link válido até ${expira}):</p>` +
          `<p><a href="${url}">Criar minha senha</a></p>` +
          `<p>Depois é só entrar no app com o e-mail <strong>${email}</strong> e a senha escolhida.</p>`,
      });
    } catch (err) {
      this.logger.warn(
        { patientId, err: err instanceof Error ? err.message : String(err) },
        'Falha ao gerar/enviar convite por e-mail (cadastro seguiu normalmente).',
      );
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
      profession: row.profession,
      activity: row.activity,
      // Oculto de PROFESSIONAL/PATIENT — só ADMIN recebe o valor.
      adminReference: this.isAdmin() ? row.adminReference : null,
      photoKey: row.photoKey,
      hasIdfaceEnrolled: !!row.idfaceUserId,
      hasUserAccount: !!row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
