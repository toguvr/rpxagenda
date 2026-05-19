import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Service as ServiceRow } from '@prisma/client';
import type { CreateServiceRequest, UpdateServiceRequest } from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateServiceRequest): Promise<ServiceRow> {
    try {
      // unitId é injetado pela extensão de unit-scope via CLS — não passamos manualmente.
      return await this.prisma.scoped.service.create({
        data: data as unknown as Prisma.ServiceUncheckedCreateInput,
      });
    } catch (err) {
      throw this.mapPrismaError(err, data.name);
    }
  }

  findMany(includeInactive = false): Promise<ServiceRow[]> {
    return this.prisma.scoped.service.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<ServiceRow> {
    const found = await this.prisma.scoped.service.findFirst({ where: { id } });
    if (!found) {
      throw new ResourceNotFoundException('Serviço');
    }
    return found;
  }

  async update(id: string, data: UpdateServiceRequest): Promise<ServiceRow> {
    await this.findById(id);
    try {
      return await this.prisma.scoped.service.update({
        where: { id },
        data: data as Prisma.ServiceUncheckedUpdateInput,
      });
    } catch (err) {
      throw this.mapPrismaError(err, data.name);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    try {
      await this.prisma.scoped.service.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceConflictException(
          'Serviço possui vínculos (profissionais, equipamentos ou agendamentos) e não pode ser removido. Desative-o em vez de excluir.',
        );
      }
      throw err;
    }
  }

  private mapPrismaError(err: unknown, name?: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ResourceConflictException(
        `Já existe um serviço com o nome "${name ?? ''}" nesta unidade.`,
      );
    }
    return err as Error;
  }
}
