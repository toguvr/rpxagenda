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
  createPlanRequestSchema,
  listPlansQuerySchema,
  updatePlanStatusRequestSchema,
  UserRole,
  type CreatePlanRequest,
  type ListPlansQuery,
  type PlanResponse,
  type UpdatePlanStatusRequest,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { PlansService } from './plans.service';
import {
  CreatePackagePlanDto,
  CreateSubscriptionPlanDto,
  PlanResponseDto,
  UpdatePlanStatusDto,
} from './dto/plan.dto';

@ApiTags('plans')
@ApiBearerAuth('access-token')
@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Roles(UserRole.ADMIN)
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Cria um plano (PACKAGE ou SUBSCRIPTION) já em status ACTIVE — Pagar.me entra na Fase 6.',
  })
  @ApiCreatedResponse({ type: PlanResponseDto })
  create(
    @Body(new ZodValidationPipe(createPlanRequestSchema)) body: CreatePlanRequest,
  ): Promise<PlanResponse> {
    return this.plans.create(body);
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('plans')
  @ApiOperation({ summary: 'Lista todos os planos da unidade, com filtros opcionais.' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
  })
  @ApiQuery({ name: 'type', required: false, enum: ['PACKAGE', 'SUBSCRIPTION'] })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiOkResponse({ type: PlanResponseDto, isArray: true })
  list(
    @Query(new ZodValidationPipe(listPlansQuerySchema)) q: ListPlansQuery,
  ): Promise<PlanResponse[]> {
    return this.plans.list(q);
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('patients/:patientId/plans')
  @ApiOperation({ summary: 'Lista os planos de um paciente' })
  @ApiOkResponse({ type: PlanResponseDto, isArray: true })
  listForPatient(@Param('patientId') patientId: string): Promise<PlanResponse[]> {
    return this.plans.listForPatient(patientId);
  }

  @Roles(UserRole.PATIENT)
  @Get('me/plans')
  @ApiOperation({ summary: 'Endpoint do app do paciente: lista os planos do usuário autenticado' })
  @ApiOkResponse({ type: PlanResponseDto, isArray: true })
  listMyPlans(): Promise<PlanResponse[]> {
    return this.plans.listForCurrentPatientUser();
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL, UserRole.PATIENT)
  @Get('plans/:id')
  @ApiOperation({ summary: 'Detalhe de um plano' })
  @ApiOkResponse({ type: PlanResponseDto })
  get(@Param('id') id: string): Promise<PlanResponse> {
    return this.plans.findById(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch('plans/:id/status')
  @ApiOperation({
    summary:
      'Altera o status do plano. Registra mudança em AuditLog. Transições para ACTIVE a partir de estado final (CANCELLED/EXPIRED) são bloqueadas.',
  })
  @ApiOkResponse({ type: PlanResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlanStatusRequestSchema)) body: UpdatePlanStatusRequest,
  ): Promise<PlanResponse> {
    return this.plans.updateStatus(id, body);
  }

  static _swaggerHints: [CreatePackagePlanDto, CreateSubscriptionPlanDto, UpdatePlanStatusDto] = [
    {} as CreatePackagePlanDto,
    {} as CreateSubscriptionPlanDto,
    {} as UpdatePlanStatusDto,
  ];
}
