import { Injectable } from '@nestjs/common';
import { Prisma, type Equipment as EquipmentRow } from '@prisma/client';
import type { CreateEquipmentRequest, UpdateEquipmentRequest } from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';

@Injectable()
export class EquipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEquipmentRequest): Promise<EquipmentRow> {
    try {
      return await this.prisma.scoped.equipment.create({
        data: data as unknown as Prisma.EquipmentUncheckedCreateInput,
      });
    } catch (err) {
      throw this.mapError(err, data.name);
    }
  }

  findMany(includeInactive = false): Promise<EquipmentRow[]> {
    return this.prisma.scoped.equipment.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string): Promise<EquipmentRow> {
    const found = await this.prisma.scoped.equipment.findFirst({ where: { id } });
    if (!found) throw new ResourceNotFoundException('Equipamento');
    return found;
  }

  async update(id: string, data: UpdateEquipmentRequest): Promise<EquipmentRow> {
    await this.findById(id);
    try {
      return await this.prisma.scoped.equipment.update({
        where: { id },
        data: data as Prisma.EquipmentUncheckedUpdateInput,
      });
    } catch (err) {
      throw this.mapError(err, data.name);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    try {
      await this.prisma.scoped.equipment.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ResourceConflictException(
          'Equipamento está vinculado a serviços ou agendamentos. Desative-o em vez de excluir.',
        );
      }
      throw err;
    }
  }

  // --- gestão dos equipamentos sugeridos por serviço ---

  async setEquipmentsOfService(serviceId: string, equipmentIds: string[]): Promise<void> {
    // Garante que serviço pertence à unidade do caller (escopo via extension).
    const svc = await this.prisma.scoped.service.findFirst({ where: { id: serviceId } });
    if (!svc) throw new ResourceNotFoundException('Serviço');

    if (equipmentIds.length > 0) {
      const validEquipments = await this.prisma.scoped.equipment.findMany({
        where: { id: { in: equipmentIds } },
        select: { id: true },
      });
      const validIds = new Set(validEquipments.map((e) => e.id));
      const invalidIds = equipmentIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new ResourceConflictException(
          `Equipamentos não encontrados na unidade: ${invalidIds.join(', ')}`,
        );
      }
    }

    // Operação atômica: reseta os vínculos do serviço.
    await this.prisma.$transaction([
      this.prisma.serviceEquipment.deleteMany({ where: { serviceId } }),
      this.prisma.serviceEquipment.createMany({
        data: equipmentIds.map((equipmentId) => ({ serviceId, equipmentId })),
      }),
    ]);
  }

  async getEquipmentsOfService(serviceId: string): Promise<EquipmentRow[]> {
    const svc = await this.prisma.scoped.service.findFirst({ where: { id: serviceId } });
    if (!svc) throw new ResourceNotFoundException('Serviço');
    const links = await this.prisma.serviceEquipment.findMany({
      where: { serviceId },
      include: { equipment: true },
    });
    return links.map((l) => l.equipment);
  }

  private mapError(err: unknown, name?: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ResourceConflictException(
        `Já existe um equipamento com o nome "${name ?? ''}" nesta unidade.`,
      );
    }
    return err as Error;
  }
}
