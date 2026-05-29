import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createPatientRequestSchema,
  photoUploadUrlRequestSchema,
  redeemInviteRequestSchema,
  savePatientPhotoRequestSchema,
  updatePatientRequestSchema,
  UserRole,
  type CreatePatientRequest,
  type InviteLookupResponse,
  type InviteResponse,
  type LoginResponse,
  type PatientPhotoUrlResponse,
  type PatientResponse,
  type PhotoUploadUrlRequest,
  type PhotoUploadUrlResponse,
  type RedeemInviteRequest,
  type SavePatientPhotoRequest,
  type UpdatePatientRequest,
} from '@rpx/shared';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  InviteLookupResponseDto,
  InviteResponseDto,
  PatientResponseDto,
  RedeemInviteDto,
  UpdatePatientDto,
} from './dto/patient.dto';

@ApiTags('patients')
@Controller()
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  // ---------- CRUD do paciente (autenticado) ----------

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Post('patients')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um novo paciente na unidade' })
  @ApiCreatedResponse({ type: PatientResponseDto })
  create(
    @Body(new ZodValidationPipe(createPatientRequestSchema)) body: CreatePatientRequest,
  ): Promise<PatientResponse> {
    return this.patients.create(body);
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('patients')
  @ApiOperation({ summary: 'Lista pacientes da unidade' })
  @ApiOkResponse({ type: PatientResponseDto, isArray: true })
  list(): Promise<PatientResponse[]> {
    return this.patients.findMany();
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('patients/:id')
  @ApiOperation({ summary: 'Detalhe de um paciente' })
  @ApiOkResponse({ type: PatientResponseDto })
  get(@Param('id') id: string): Promise<PatientResponse> {
    return this.patients.findById(id);
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Patch('patients/:id')
  @ApiOperation({ summary: 'Atualiza dados do paciente' })
  @ApiOkResponse({ type: PatientResponseDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePatientRequestSchema)) body: UpdatePatientRequest,
  ): Promise<PatientResponse> {
    return this.patients.update(id, body);
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @Delete('patients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o paciente (somente sem vínculos)' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.patients.remove(id);
  }

  // ---------- foto (upload via S3 presigned) ----------

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Post('patients/:id/photo/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera uma URL assinada (PUT) para o cliente subir a foto direto no S3.',
  })
  photoUploadUrl(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(photoUploadUrlRequestSchema)) body: PhotoUploadUrlRequest,
  ): Promise<PhotoUploadUrlResponse> {
    return this.patients.getPhotoUploadUrl(id, body.contentType);
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Put('patients/:id/photo')
  @ApiOperation({ summary: 'Confirma a foto após o upload concluir no S3 (salva a key).' })
  @ApiOkResponse({ type: PatientResponseDto })
  savePhoto(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePatientPhotoRequestSchema)) body: SavePatientPhotoRequest,
  ): Promise<PatientResponse> {
    return this.patients.savePhoto(id, body.key);
  }

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('patients/:id/photo-url')
  @ApiOperation({ summary: 'URL assinada (GET) da foto do paciente, ou null.' })
  photoUrl(@Param('id') id: string): Promise<PatientPhotoUrlResponse> {
    return this.patients.getPhotoUrl(id);
  }

  // ---------- invites (admin gera; redemption é pública) ----------

  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN)
  @Post('patients/:id/invites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gera um convite (token de 7 dias) para o paciente criar a conta de acesso ao app.',
  })
  @ApiCreatedResponse({ type: InviteResponseDto })
  generateInvite(@Param('id') patientId: string): Promise<InviteResponse> {
    return this.patients.generateInvite(patientId);
  }

  @Public()
  @Get('patient-invites/:token')
  @ApiOperation({
    summary:
      'Lookup público de um convite — devolve dados básicos do paciente para pré-preencher a tela de cadastro.',
  })
  @ApiOkResponse({ type: InviteLookupResponseDto })
  lookupInvite(@Param('token') token: string): Promise<InviteLookupResponse> {
    return this.patients.lookupInvite(token);
  }

  @Public()
  @Post('patient-invites/:token/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paciente define senha e o sistema retorna par de tokens (mesmo do login).',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: { type: 'object' },
      },
    },
  })
  redeemInvite(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(redeemInviteRequestSchema)) body: RedeemInviteRequest,
  ): Promise<LoginResponse> {
    return this.patients.redeemInvite(token, body.password);
  }

  static _swaggerHints: [CreatePatientDto, UpdatePatientDto, RedeemInviteDto] = [
    {} as CreatePatientDto,
    {} as UpdatePatientDto,
    {} as RedeemInviteDto,
  ];
}
