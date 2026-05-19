import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { buildUnitScopeExtension } from './unit-scope.extension';

export type ScopedPrismaClient = ReturnType<PrismaClient['$extends']>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Cliente Prisma com a extensão de unit-scope aplicada. Toda query de domínio
   * (entidades com `unitId`) deve passar por `this.prisma.scoped` para herdar o
   * filtro automático por unidade do usuário autenticado (via CLS).
   *
   * Para queries que precisam atravessar unidades (raras: jobs administrativos,
   * health-check, auth pré-login) use os acessores diretos (`this.prisma.user`, etc.)
   * — eles continuam apontando para o cliente raw deste service.
   */
  readonly scoped: ScopedPrismaClient;

  constructor(private readonly cls: ClsService) {
    super();
    this.scoped = this.$extends(buildUnitScopeExtension(cls));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma conectado ao banco');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
