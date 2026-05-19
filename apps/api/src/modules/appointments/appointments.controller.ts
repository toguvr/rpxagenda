import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  cancelAppointmentRequestSchema,
  createAppointmentRequestSchema,
  listAppointmentsQuerySchema,
  UserRole,
  type AppointmentResponse,
  type CancelAppointmentRequest,
  type CreateAppointmentRequest,
  type ListAppointmentsQuery,
} from '@rpx/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import type { RequestUser } from '../auth/types';
import { ResourceNotFoundException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentResponseDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
} from './dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth('access-token')
@Controller()
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- Create ----------

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Post('appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Cria um agendamento. PATIENT só pode criar para si; ADMIN/PROF para qualquer paciente da unidade. Valida os 6 limites do §4.3 do CLAUDE.md em transação SERIALIZABLE.',
  })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema))
    body: CreateAppointmentRequest,
  ): Promise<AppointmentResponse> {
    if (user.role === UserRole.PATIENT) {
      await this.assertPatientIsSelf(user, body.patientId);
    }
    return this.appointments.create(body);
  }

  // ---------- List / Get ----------

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('appointments')
  @ApiOperation({ summary: 'Lista agendamentos da unidade com filtros opcionais.' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'fromDate', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'toDate', required: false, type: String, format: 'date-time' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  })
  @ApiOkResponse({ type: AppointmentResponseDto, isArray: true })
  list(
    @Query(new ZodValidationPipe(listAppointmentsQuerySchema)) q: ListAppointmentsQuery,
  ): Promise<AppointmentResponse[]> {
    return this.appointments.list(q);
  }

  @Roles(UserRole.PATIENT)
  @Get('me/appointments')
  @ApiOperation({ summary: 'Endpoint do app: lista os agendamentos do paciente autenticado.' })
  @ApiOkResponse({ type: AppointmentResponseDto, isArray: true })
  listMine(): Promise<AppointmentResponse[]> {
    return this.appointments.listMyAppointments();
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Get('appointments/:id')
  @ApiOperation({ summary: 'Detalhe de um agendamento.' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<AppointmentResponse> {
    const appt = await this.appointments.findById(id);
    if (user.role === UserRole.PATIENT) {
      await this.assertPatientIsSelf(user, appt.patientId);
    }
    return appt;
  }

  // ---------- Cancel ----------

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancela um agendamento. Dentro do cancellationLeadMinutes devolve a sessão ao plano; fora, mantém o desconto (admin pode reverter).',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelAppointmentRequestSchema))
    body: CancelAppointmentRequest,
  ): Promise<AppointmentResponse> {
    if (user.role === UserRole.PATIENT) {
      const appt = await this.appointments.findById(id);
      await this.assertPatientIsSelf(user, appt.patientId);
    }
    return this.appointments.cancel(id, body.reason);
  }

  // ---------- Reverter consumo (admin) ----------

  @Roles(UserRole.ADMIN)
  @Post('appointments/:id/revert-consumption')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Admin reverte um agendamento em CANCELLED (fora do prazo) ou NO_SHOW, devolvendo a sessão ao plano. Audita a ação.',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  revertConsumption(@Param('id') id: string): Promise<AppointmentResponse> {
    return this.appointments.revertConsumption(id);
  }

  // ---------- helpers ----------

  private async assertPatientIsSelf(user: RequestUser, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { userId: true },
    });
    if (!patient || patient.userId !== user.id) {
      throw new ResourceNotFoundException('Agendamento');
    }
  }

  static _swaggerHints: [CreateAppointmentDto, CancelAppointmentDto] = [
    {} as CreateAppointmentDto,
    {} as CancelAppointmentDto,
  ];
}
