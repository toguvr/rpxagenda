import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import { AppConfigModule } from './config/config.module';
import type { Env } from './config/env.schema';
import { buildLoggerOptions } from './common/logger/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UnitsModule } from './modules/units/units.module';
import { ServicesModule } from './modules/services/services.module';
import { EquipmentsModule } from './modules/equipments/equipments.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { PatientsModule } from './modules/patients/patients.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { PlansModule } from './modules/plans/plans.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { IdfaceModule } from './modules/integrations/idface/idface.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { UnitScopeInterceptor } from './modules/auth/interceptors/unit-scope.interceptor';

@Module({
  imports: [
    AppConfigModule,
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    PrismaModule,
    AuthModule,
    UnitsModule,
    ServicesModule,
    EquipmentsModule,
    ProfessionalsModule,
    PatientsModule,
    SchedulesModule,
    PlansModule,
    AppointmentsModule,
    IdfaceModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: UnitScopeInterceptor },
  ],
})
export class AppModule {}
