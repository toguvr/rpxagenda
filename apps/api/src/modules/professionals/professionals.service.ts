import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import type {
  CreateProfessionalRequest,
  LoginResponse,
  ProfessionalInviteLookupResponse,
  ProfessionalInviteResponse,
  ProfessionalResponse,
  UpdateProfessionalRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import { TypedConfigService } from '../../config/typed-config.service';
import { EMAIL_PROVIDER, type IEmailProvider } from '../email/email.types';
import { AuthService } from '../auth/auth.service';
import {
  InviteInvalidException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 7;

@Injectable()
export class ProfessionalsService {
  private readonly logger = new Logger(ProfessionalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TypedConfigService,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
  ) {}

  /**
   * Cadastra o profissional SEM conta de acesso e dispara o convite por e-mail
   * (o profissional define a própria senha pelo link). As telas concedidas
   * (`allowedScreens`) ficam no registro e viram as permissões do JWT no resgate.
   */
  async create(data: CreateProfessionalRequest): Promise<ProfessionalResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) {
      throw new Error('Unit context missing — endpoint deve estar autenticado.');
    }

    await this.assertEmailFree(data.email);
    await this.assertRegistryFree(data.registry);
    if (data.serviceIds.length > 0) await this.assertServicesExist(data.serviceIds);

    const professional = await this.prisma.professional.create({
      data: {
        unitId,
        email: data.email.trim().toLowerCase(),
        fullName: data.fullName,
        registry: data.registry,
        active: data.active,
        allowedScreens: data.allowedScreens,
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
      include: { services: true },
    });

    await this.sendInviteEmail(professional.id, professional.fullName, professional.email);

    return this.toResponse(professional);
  }

  async findMany(includeInactive = false): Promise<ProfessionalResponse[]> {
    const rows = await this.prisma.scoped.professional.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { fullName: 'asc' },
      include: { services: true },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findById(id: string): Promise<ProfessionalResponse> {
    const row = await this.prisma.scoped.professional.findFirst({
      where: { id },
      include: { services: true },
    });
    if (!row) throw new ResourceNotFoundException('Profissional');
    return this.toResponse(row);
  }

  async update(id: string, data: UpdateProfessionalRequest): Promise<ProfessionalResponse> {
    const existing = await this.prisma.scoped.professional.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Profissional');

    if (data.registry && data.registry !== existing.registry) {
      await this.assertRegistryFree(data.registry);
    }
    if (data.serviceIds) await this.assertServicesExist(data.serviceIds);

    const result = await this.prisma.$transaction(async (tx) => {
      // Sincroniza User.fullName se mudou (mantém consistência) — só se já há conta.
      if (data.fullName !== undefined && existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { fullName: data.fullName },
        });
      }

      const profPatch: Prisma.ProfessionalUncheckedUpdateInput = {};
      if (data.fullName !== undefined) profPatch.fullName = data.fullName;
      if (data.registry !== undefined) profPatch.registry = data.registry;
      if (data.active !== undefined) profPatch.active = data.active;
      if (data.allowedScreens !== undefined) profPatch.allowedScreens = data.allowedScreens;

      if (data.serviceIds) {
        await tx.professionalService.deleteMany({ where: { professionalId: id } });
        if (data.serviceIds.length > 0) {
          await tx.professionalService.createMany({
            data: data.serviceIds.map((sid) => ({ professionalId: id, serviceId: sid })),
          });
        }
      }

      // Se desativou, revoga as sessões (refresh tokens) da conta de acesso.
      if (data.active === false && existing.userId) {
        await tx.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return tx.professional.update({
        where: { id },
        data: profPatch,
        include: { services: true },
      });
    });

    return this.toResponse(result);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.scoped.professional.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Profissional');

    try {
      // Remove o profissional (cascata: convites e vínculos de serviço). A conta
      // de acesso, se existir, é removida em seguida.
      await this.prisma.$transaction(async (tx) => {
        await tx.professional.delete({ where: { id } });
        if (existing.userId) {
          await tx.user.delete({ where: { id: existing.userId } });
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceConflictException(
          'Profissional possui vínculos (prontuários, agendamentos) e não pode ser removido. Desative com PATCH active=false.',
        );
      }
      throw err;
    }
  }

  // ---------- convites (admin gera; lookup/redeem são públicos) ----------

  /** Gera um novo convite de acesso para o profissional. */
  async generateInvite(professionalId: string): Promise<ProfessionalInviteResponse> {
    const professional = await this.prisma.scoped.professional.findFirst({
      where: { id: professionalId },
    });
    if (!professional) throw new ResourceNotFoundException('Profissional');
    if (professional.userId) {
      throw new ResourceConflictException(
        'Profissional já possui conta de acesso; não é necessário novo convite.',
      );
    }

    const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.professionalInvite.create({
      data: { professionalId, tokenHash, expiresAt },
    });

    return {
      id: invite.id,
      professionalId,
      token,
      expiresAt,
      redeemPath: `/professional-invites/${token}/redeem`,
    };
  }

  async lookupInvite(token: string): Promise<ProfessionalInviteLookupResponse> {
    const invite = await this.findActiveInviteOrThrow(token);
    const professional = await this.prisma.professional.findUnique({
      where: { id: invite.professionalId },
      select: { fullName: true, email: true, registry: true, userId: true },
    });
    if (!professional) throw new InviteInvalidException();
    if (professional.userId) {
      throw new InviteInvalidException('Convite já utilizado; faça login normalmente.');
    }
    return {
      professional: {
        fullName: professional.fullName,
        email: professional.email,
        registry: professional.registry,
      },
      expiresAt: invite.expiresAt,
    };
  }

  /** Resgata o convite: cria a conta de acesso (role PROFESSIONAL) e autentica. */
  async redeemInvite(token: string, password: string): Promise<LoginResponse> {
    const invite = await this.findActiveInviteOrThrow(token);
    const professional = await this.prisma.professional.findUnique({
      where: { id: invite.professionalId },
    });
    if (!professional) throw new InviteInvalidException();
    if (professional.userId) {
      throw new InviteInvalidException('Convite já utilizado; faça login normalmente.');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: professional.email,
          passwordHash,
          fullName: professional.fullName,
          role: UserRole.PROFESSIONAL,
          unitId: professional.unitId,
        },
      });
      await tx.professional.update({
        where: { id: professional.id },
        data: { userId: created.id },
      });
      await tx.professionalInvite.update({
        where: { id: invite.id },
        data: { redeemedAt: new Date() },
      });
      return created;
    });

    return this.auth.issueLoginTokens(user);
  }

  // ---------- helpers ----------

  /** Gera um convite e envia por e-mail. Falhas são logadas, nunca propagadas. */
  private async sendInviteEmail(
    professionalId: string,
    fullName: string,
    email: string,
  ): Promise<void> {
    try {
      const invite = await this.generateInvite(professionalId);
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
          `Você foi cadastrado(a) como profissional na RPX Expert. Crie sua senha de ` +
          `acesso ao painel pelo link abaixo (válido até ${expira}):\n${url}\n\n` +
          `Depois é só acessar o painel com o e-mail ${email} e a senha escolhida.`,
        html:
          `<p>Olá, <strong>${firstName}</strong>!</p>` +
          `<p>Você foi cadastrado(a) como profissional na <strong>RPX Expert</strong>. ` +
          `Crie sua senha de acesso ao painel (link válido até ${expira}):</p>` +
          `<p><a href="${url}">Criar minha senha</a></p>` +
          `<p>Depois é só acessar o painel com o e-mail <strong>${email}</strong> e a senha escolhida.</p>`,
      });
    } catch (err) {
      this.logger.warn(
        { professionalId, err: err instanceof Error ? err.message : String(err) },
        'Falha ao gerar/enviar convite do profissional por e-mail (cadastro seguiu normalmente).',
      );
    }
  }

  private async findActiveInviteOrThrow(token: string) {
    const tokenHash = this.hashInviteToken(token);
    const invite = await this.prisma.professionalInvite.findUnique({ where: { tokenHash } });
    if (!invite) throw new InviteInvalidException();
    if (invite.redeemedAt) throw new InviteInvalidException('Convite já utilizado.');
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new InviteInvalidException('Convite expirado.');
    }
    return invite;
  }

  private hashInviteToken(token: string): string {
    return crypto
      .createHmac('sha256', this.config.get('JWT_REFRESH_SECRET'))
      .update(token)
      .digest('hex');
  }

  private async assertEmailFree(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existingUser) {
      throw new ResourceConflictException(`Já existe um usuário com o email "${email}".`);
    }
    const pending = await this.prisma.scoped.professional.findFirst({
      where: { email: normalized },
    });
    if (pending) {
      throw new ResourceConflictException(
        `Já existe um profissional com o email "${email}" nesta unidade.`,
      );
    }
  }

  private async assertRegistryFree(registry: string): Promise<void> {
    const found = await this.prisma.scoped.professional.findFirst({ where: { registry } });
    if (found) {
      throw new ResourceConflictException(
        `Já existe um profissional com o registro "${registry}" nesta unidade.`,
      );
    }
  }

  private async assertServicesExist(serviceIds: string[]): Promise<void> {
    const unique = Array.from(new Set(serviceIds));
    if (unique.length === 0) return;
    const found = await this.prisma.scoped.service.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const validIds = new Set(found.map((s) => s.id));
    const missing = unique.filter((id) => !validIds.has(id));
    if (missing.length > 0) {
      throw new ResourceConflictException(
        `Serviços não encontrados na unidade: ${missing.join(', ')}`,
      );
    }
  }

  private toResponse(row: {
    id: string;
    unitId: string;
    userId: string | null;
    email: string;
    fullName: string;
    registry: string;
    active: boolean;
    allowedScreens: string[];
    createdAt: Date;
    updatedAt: Date;
    services: { serviceId: string }[];
  }): ProfessionalResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      registry: row.registry,
      active: row.active,
      serviceIds: row.services.map((s) => s.serviceId),
      allowedScreens: row.allowedScreens,
      hasAccess: row.userId !== null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
