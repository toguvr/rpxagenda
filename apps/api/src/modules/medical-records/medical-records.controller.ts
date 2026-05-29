import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createMedicalRecordRequestSchema,
  updateMedicalRecordRequestSchema,
  UserRole,
  type CreateMedicalRecordRequest,
  type MedicalRecordResponse,
  type UpdateMedicalRecordRequest,
} from '@rpx/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import type { RequestUser } from '../auth/types';
import { MedicalRecordsService } from './medical-records.service';
import {
  CreateMedicalRecordDto,
  MedicalRecordResponseDto,
  UpdateMedicalRecordDto,
} from './dto/medical-record.dto';

@ApiTags('medical-records')
@ApiBearerAuth('access-token')
@Controller()
export class MedicalRecordsController {
  constructor(private readonly records: MedicalRecordsService) {}

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Post('medical-records')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registra evolução clínica (com ou sem ligação a um Appointment). PROFESSIONAL grava como ele mesmo; ADMIN informa o profissional autor (professionalId).',
  })
  @ApiCreatedResponse({ type: MedicalRecordResponseDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createMedicalRecordRequestSchema))
    body: CreateMedicalRecordRequest,
  ): Promise<MedicalRecordResponse> {
    return this.records.create(user.id, body);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Patch('medical-records/:id')
  @ApiOperation({ summary: 'Edita um prontuário (o profissional autor ou um admin).' })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMedicalRecordRequestSchema))
    body: UpdateMedicalRecordRequest,
  ): Promise<MedicalRecordResponse> {
    return this.records.update(id, user.id, user.role === UserRole.ADMIN, body);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Get('medical-records/:id')
  @ApiOperation({ summary: 'Detalhe de um prontuário.' })
  @ApiOkResponse({ type: MedicalRecordResponseDto })
  get(@Param('id') id: string): Promise<MedicalRecordResponse> {
    return this.records.findById(id);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Get('patients/:patientId/medical-records')
  @ApiOperation({ summary: 'Histórico de prontuários do paciente, mais recente primeiro.' })
  @ApiOkResponse({ type: MedicalRecordResponseDto, isArray: true })
  listForPatient(@Param('patientId') patientId: string): Promise<MedicalRecordResponse[]> {
    return this.records.listForPatient(patientId);
  }

  @Roles(UserRole.PATIENT)
  @Get('me/medical-records')
  @ApiOperation({ summary: 'Endpoint do app do paciente: seus próprios prontuários.' })
  @ApiOkResponse({ type: MedicalRecordResponseDto, isArray: true })
  listMine(@CurrentUser() user: RequestUser): Promise<MedicalRecordResponse[]> {
    return this.records.listForCurrentPatientUser(user.id);
  }

  static _swaggerHints: [CreateMedicalRecordDto, UpdateMedicalRecordDto] = [
    {} as CreateMedicalRecordDto,
    {} as UpdateMedicalRecordDto,
  ];
}
