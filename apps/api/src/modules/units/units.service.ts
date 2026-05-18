import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(unitId: string): Promise<{
    id: string;
    name: string;
    timezone: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, name: true, timezone: true, createdAt: true, updatedAt: true },
    });
    if (!unit) {
      throw new NotFoundException('Unidade não encontrada');
    }
    return unit;
  }
}
