import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { ClsService } from 'nestjs-cls';
import type {
  CreateProfessionalRequest,
  ProfessionalResponse,
  UpdateProfessionalRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(data: CreateProfessionalRequest): Promise<ProfessionalResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) {
      throw new Error('Unit context missing — endpoint deve estar autenticado.');
    }

    await this.assertEmailFree(data.email);
    await this.assertRegistryFree(data.registry);
    if (data.serviceIds.length > 0) await this.assertServicesExist(data.serviceIds);

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          fullName: data.fullName,
          role: UserRole.PROFESSIONAL,
          unitId,
        },
      });
      const professional = await tx.professional.create({
        data: {
          unitId,
          userId: user.id,
          fullName: data.fullName,
          registry: data.registry,
          active: data.active,
          services: {
            create: data.serviceIds.map((serviceId) => ({ serviceId })),
          },
        },
        include: { services: true, user: { select: { email: true } } },
      });
      return professional;
    });

    return this.toResponse(result);
  }

  async findMany(includeInactive = false): Promise<ProfessionalResponse[]> {
    const rows = await this.prisma.scoped.professional.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { fullName: 'asc' },
      include: { services: true, user: { select: { email: true } } },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findById(id: string): Promise<ProfessionalResponse> {
    const row = await this.prisma.scoped.professional.findFirst({
      where: { id },
      include: { services: true, user: { select: { email: true } } },
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
      // Sincroniza User.fullName se mudou (mantém consistência com Professional.fullName).
      const userPatch: Prisma.UserUpdateInput = {};
      if (data.fullName !== undefined) userPatch.fullName = data.fullName;
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: existing.userId }, data: userPatch });
      }

      const profPatch: Prisma.ProfessionalUncheckedUpdateInput = {};
      if (data.fullName !== undefined) profPatch.fullName = data.fullName;
      if (data.registry !== undefined) profPatch.registry = data.registry;
      if (data.active !== undefined) profPatch.active = data.active;

      if (data.serviceIds) {
        await tx.professionalService.deleteMany({ where: { professionalId: id } });
        if (data.serviceIds.length > 0) {
          await tx.professionalService.createMany({
            data: data.serviceIds.map((sid) => ({ professionalId: id, serviceId: sid })),
          });
        }
      }

      // Se desativou, revoga tokens.
      if (data.active === false) {
        await tx.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return tx.professional.update({
        where: { id },
        data: profPatch,
        include: { services: true, user: { select: { email: true } } },
      });
    });

    return this.toResponse(result);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.scoped.professional.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Profissional');

    // Cascade do User → Professional remove o vínculo automaticamente.
    try {
      await this.prisma.user.delete({ where: { id: existing.userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceConflictException(
          'Profissional possui vínculos (prontuários, agendamentos) e não pode ser removido. Desative com PATCH active=false.',
        );
      }
      throw err;
    }
  }

  // ---------- helpers ----------

  private async assertEmailFree(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ResourceConflictException(`Já existe um usuário com o email "${email}".`);
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
    userId: string;
    fullName: string;
    registry: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    services: { serviceId: string }[];
    user: { email: string };
  }): ProfessionalResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      userId: row.userId,
      email: row.user.email,
      fullName: row.fullName,
      registry: row.registry,
      active: row.active,
      serviceIds: row.services.map((s) => s.serviceId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
