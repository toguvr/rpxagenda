import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  createRecurringAppointmentsRequestSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentRequestSchema,
  UserRole,
  type AppointmentResponse,
  type CancelAppointmentRequest,
  type CreateAppointmentRequest,
  type CreateRecurringAppointmentsRequest,
  type ListAppointmentsQuery,
  type RecurringAppointmentsResponse,
  type RescheduleAppointmentRequest,
  ScreenKey,
} from '@rpx/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Screen } from '../auth/decorators/screen.decorator';
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
@Screen(ScreenKey.APPOINTMENTS)
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

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Post('appointments/recurring')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Agenda os dias fixos de um paciente em um plano (recorrente). PACKAGE: até esgotar as sessões; SUBSCRIPTION: até o fim do plano. Pula conflitos e os reporta em `skipped`.',
  })
  createRecurring(
    @Body(new ZodValidationPipe(createRecurringAppointmentsRequestSchema))
    body: CreateRecurringAppointmentsRequest,
  ): Promise<RecurringAppointmentsResponse> {
    return this.appointments.createRecurring(body);
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

  // ---------- Reschedule (drag-and-drop) ----------

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Patch('appointments/:id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remarca um agendamento (SCHEDULED|CONFIRMED) para outro horário. Revalida a capacidade do §4.3 excluindo o próprio agendamento; não reconsome o plano. `force=true` ignora a violação de capacidade (ação auditada).',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  reschedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rescheduleAppointmentRequestSchema))
    body: RescheduleAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return this.appointments.reschedule(id, body.startsAt, body.force);
  }

  // ---------- Status transitions ----------

  @Roles(UserRole.ADMIN, UserRole.PATIENT)
  @Post('appointments/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paciente confirma presença: SCHEDULED → CONFIRMED.' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  async confirm(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<AppointmentResponse> {
    if (user.role === UserRole.PATIENT) {
      const appt = await this.appointments.findById(id);
      await this.assertPatientIsSelf(user, appt.patientId);
    }
    return this.appointments.confirm(id);
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Post('appointments/:id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check-in manual pelo admin/recepção: SCHEDULED|CONFIRMED → CHECKED_IN. iDFace virá na Fase 4.',
  })
  @ApiOkResponse({ type: AppointmentResponseDto })
  checkIn(@Param('id') id: string): Promise<AppointmentResponse> {
    return this.appointments.checkIn(id);
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Post('appointments/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Profissional finaliza sessão: CHECKED_IN → COMPLETED.' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  complete(@Param('id') id: string): Promise<AppointmentResponse> {
    return this.appointments.complete(id);
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
