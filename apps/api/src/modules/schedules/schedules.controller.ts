import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  createBusinessHoursRequestSchema,
  createScheduleExceptionRequestSchema,
  UserRole,
  type BusinessHoursResponse,
  type CreateBusinessHoursRequest,
  type CreateScheduleExceptionRequest,
  type ScheduleExceptionResponse,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { SchedulesService } from './schedules.service';
import {
  BusinessHoursResponseDto,
  CreateBusinessHoursDto,
  CreateScheduleExceptionDto,
  ScheduleExceptionResponseDto,
  SlotsResponseDto,
} from './dto/schedule.dto';

@ApiTags('schedules')
@ApiBearerAuth('access-token')
@Controller()
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  // ---------- BusinessHours (por serviço) ----------

  @Roles(UserRole.ADMIN)
  @Post('services/:serviceId/business-hours')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma janela de funcionamento para um serviço específico' })
  @ApiCreatedResponse({ type: BusinessHoursResponseDto })
  createBusinessHours(
    @Param('serviceId') serviceId: string,
    @Body(new ZodValidationPipe(createBusinessHoursRequestSchema))
    body: CreateBusinessHoursRequest,
  ): Promise<BusinessHoursResponse> {
    return this.schedules.createBusinessHours(serviceId, body) as Promise<BusinessHoursResponse>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Get('services/:serviceId/business-hours')
  @ApiOperation({ summary: 'Lista as janelas de funcionamento de um serviço' })
  @ApiOkResponse({ type: BusinessHoursResponseDto, isArray: true })
  listBusinessHoursForService(
    @Param('serviceId') serviceId: string,
  ): Promise<BusinessHoursResponse[]> {
    return this.schedules.listBusinessHoursForService(serviceId) as Promise<
      BusinessHoursResponse[]
    >;
  }

  @Roles(UserRole.ADMIN)
  @Delete('business-hours/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma janela de funcionamento' })
  @ApiNoContentResponse()
  removeBusinessHours(@Param('id') id: string): Promise<void> {
    return this.schedules.removeBusinessHours(id);
  }

  // ---------- ScheduleException (por unidade) ----------

  @Roles(UserRole.ADMIN)
  @Post('schedules/exceptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria uma exceção pontual de calendário (CLOSED ou CUSTOM)' })
  @ApiCreatedResponse({ type: ScheduleExceptionResponseDto })
  createException(
    @Body(new ZodValidationPipe(createScheduleExceptionRequestSchema))
    body: CreateScheduleExceptionRequest,
  ): Promise<ScheduleExceptionResponse> {
    return this.schedules.createException(body) as Promise<ScheduleExceptionResponse>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('schedules/exceptions')
  @ApiOperation({ summary: 'Lista exceções de calendário da unidade' })
  @ApiOkResponse({ type: ScheduleExceptionResponseDto, isArray: true })
  listExceptions(): Promise<ScheduleExceptionResponse[]> {
    return this.schedules.listExceptions() as Promise<ScheduleExceptionResponse[]>;
  }

  @Roles(UserRole.ADMIN)
  @Delete('schedules/exceptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma exceção de calendário' })
  @ApiNoContentResponse()
  removeException(@Param('id') id: string): Promise<void> {
    return this.schedules.removeException(id);
  }

  // ---------- slots ----------

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Get('schedules/slots')
  @ApiOperation({
    summary:
      'Gera dinamicamente os slots disponíveis para um serviço numa data (BusinessHours do serviço + ScheduleException da unidade).',
  })
  @ApiQuery({ name: 'serviceId', required: true })
  @ApiQuery({ name: 'date', required: true, type: String, example: '2026-05-19' })
  @ApiOkResponse({ type: SlotsResponseDto })
  async getSlots(
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
  ): Promise<SlotsResponseDto> {
    return this.schedules.getSlots(serviceId, date) as Promise<SlotsResponseDto>;
  }

  static _swaggerHints: [CreateBusinessHoursDto, CreateScheduleExceptionDto] = [
    {} as CreateBusinessHoursDto,
    {} as CreateScheduleExceptionDto,
  ];
}
