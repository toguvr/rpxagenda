import { Injectable } from '@nestjs/common';
import { Prisma, type IdfaceDevice as IdfaceDeviceRow } from '@prisma/client';
import type {
  CreateIdfaceDeviceRequest,
  IdfaceDeviceResponse,
  UpdateIdfaceDeviceRequest,
} from '@rpx/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../../common/exceptions/app.exception';

/**
 * CRUD admin dos equipamentos iDFace registrados por unidade. O `deviceId` é o
 * identificador que o equipamento envia no Push (configurado na tela do
 * próprio iDFace) e serve para resolver: device → unidade nos webhooks.
 */
@Injectable()
export class IdfaceDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateIdfaceDeviceRequest): Promise<IdfaceDeviceResponse> {
    try {
      const row = await this.prisma.scoped.idfaceDevice.create({
        data: data as unknown as Prisma.IdfaceDeviceUncheckedCreateInput,
      });
      return this.toResponse(row);
    } catch (err) {
      throw this.mapError(err, data.deviceId);
    }
  }

  async list(): Promise<IdfaceDeviceResponse[]> {
    const rows = await this.prisma.scoped.idfaceDevice.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findById(id: string): Promise<IdfaceDeviceResponse> {
    const row = await this.prisma.scoped.idfaceDevice.findFirst({ where: { id } });
    if (!row) throw new ResourceNotFoundException('Equipamento iDFace');
    return this.toResponse(row);
  }

  async update(id: string, data: UpdateIdfaceDeviceRequest): Promise<IdfaceDeviceResponse> {
    await this.findById(id);
    try {
      const row = await this.prisma.scoped.idfaceDevice.update({
        where: { id },
        data: data as Prisma.IdfaceDeviceUncheckedUpdateInput,
      });
      return this.toResponse(row);
    } catch (err) {
      throw this.mapError(err, data.deviceId);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.scoped.idfaceDevice.delete({ where: { id } });
  }

  /**
   * Lookup por deviceId — usado pelos endpoints públicos de webhook iDFace
   * para resolver o device em sua unidade. Não passa por unit-scope (o caller
   * é público, sem CLS de unidade).
   */
  findByDeviceId(deviceId: string): Promise<IdfaceDeviceRow | null> {
    return this.prisma.idfaceDevice.findUnique({ where: { deviceId } });
  }

  /** Atualiza `lastSeenAt` (best-effort — falhas não bloqueiam o poll). */
  async touchLastSeen(id: string): Promise<void> {
    try {
      await this.prisma.idfaceDevice.update({
        where: { id },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      /* noop */
    }
  }

  private toResponse(row: IdfaceDeviceRow): IdfaceDeviceResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      deviceId: row.deviceId,
      name: row.name,
      active: row.active,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapError(err: unknown, deviceId?: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ResourceConflictException(
        `Já existe um equipamento iDFace com deviceId "${deviceId ?? ''}".`,
      );
    }
    return err as Error;
  }
}
