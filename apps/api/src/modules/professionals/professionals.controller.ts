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
  createProfessionalRequestSchema,
  photoUploadUrlRequestSchema,
  redeemProfessionalInviteRequestSchema,
  savePatientPhotoRequestSchema,
  updateProfessionalRequestSchema,
  ScreenKey,
  UserRole,
  type CreateProfessionalRequest,
  type LoginResponse,
  type PatientPhotoUrlResponse,
  type PhotoUploadUrlRequest,
  type PhotoUploadUrlResponse,
  type SavePatientPhotoRequest,
  type ProfessionalInviteLookupResponse,
  type ProfessionalInviteResponse,
  type ProfessionalResponse,
  type RedeemProfessionalInviteRequest,
  type UpdateProfessionalRequest,
} from '@rpx/shared';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Screen } from '../auth/decorators/screen.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { ProfessionalsService } from './professionals.service';
import {
  CreateProfessionalDto,
  ProfessionalInviteLookupResponseDto,
  ProfessionalInviteResponseDto,
  ProfessionalResponseDto,
  RedeemProfessionalInviteDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';

@ApiTags('professionals')
@ApiBearerAuth('access-token')
@Screen(ScreenKey.PROFESSIONALS)
@Controller()
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Roles(UserRole.ADMIN)
  @Post('professionals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cadastra um profissional e envia o convite de acesso (define a própria senha)',
  })
  @ApiCreatedResponse({ type: ProfessionalResponseDto })
  create(
    @Body(new ZodValidationPipe(createProfessionalRequestSchema))
    body: CreateProfessionalRequest,
  ): Promise<ProfessionalResponse> {
    return this.professionals.create(body);
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('professionals')
  @ApiOperation({ summary: 'Lista profissionais da unidade' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOkResponse({ type: ProfessionalResponseDto, isArray: true })
  list(@Query('includeInactive') includeInactive?: string): Promise<ProfessionalResponse[]> {
    return this.professionals.findMany(includeInactive === 'true');
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('professionals/:id')
  @ApiOperation({ summary: 'Detalhe de um profissional' })
  @ApiOkResponse({ type: ProfessionalResponseDto })
  get(@Param('id') id: string): Promise<ProfessionalResponse> {
    return this.professionals.findById(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch('professionals/:id')
  @ApiOperation({
    summary: 'Atualiza profissional (nome, registro, serviços, telas permitidas, ativo)',
  })
  @ApiOkResponse({ type: ProfessionalResponseDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProfessionalRequestSchema))
    body: UpdateProfessionalRequest,
  ): Promise<ProfessionalResponse> {
    return this.professionals.update(id, body);
  }

  @Roles(UserRole.ADMIN)
  @Delete('professionals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um profissional (e sua conta de acesso, se houver)' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.professionals.remove(id);
  }

  // ---------- foto + biometria iDFace (libera o profissional no totem) ----------
  // Os schemas de foto são os mesmos do paciente (contrato idêntico: contentType / key).

  @Roles(UserRole.ADMIN)
  @Post('professionals/:id/photo/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera uma URL assinada (PUT) para subir a foto do profissional direto no S3.',
  })
  photoUploadUrl(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(photoUploadUrlRequestSchema)) body: PhotoUploadUrlRequest,
  ): Promise<PhotoUploadUrlResponse> {
    return this.professionals.getPhotoUploadUrl(id, body.contentType);
  }

  @Roles(UserRole.ADMIN)
  @Put('professionals/:id/photo')
  @ApiOperation({
    summary:
      'Confirma a foto após o upload e enfileira o cadastro facial no iDFace (acesso pelo totem).',
  })
  @ApiOkResponse({ type: ProfessionalResponseDto })
  savePhoto(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePatientPhotoRequestSchema)) body: SavePatientPhotoRequest,
  ): Promise<ProfessionalResponse> {
    return this.professionals.savePhoto(id, body.key);
  }

  @Roles(UserRole.ADMIN)
  @Get('professionals/:id/photo-url')
  @ApiOperation({ summary: 'URL assinada (GET) da foto do profissional, ou null.' })
  photoUrl(@Param('id') id: string): Promise<PatientPhotoUrlResponse> {
    return this.professionals.getPhotoUrl(id);
  }

  // ---------- convites (admin gera; lookup/redeem são públicos) ----------

  @Roles(UserRole.ADMIN)
  @Post('professionals/:id/invites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gera um novo convite de acesso para o profissional' })
  @ApiCreatedResponse({ type: ProfessionalInviteResponseDto })
  generateInvite(@Param('id') id: string): Promise<ProfessionalInviteResponse> {
    return this.professionals.generateInvite(id);
  }

  @Public()
  @Get('professional-invites/:token')
  @ApiOperation({ summary: 'Consulta um convite de profissional (público)' })
  @ApiOkResponse({ type: ProfessionalInviteLookupResponseDto })
  lookupInvite(@Param('token') token: string): Promise<ProfessionalInviteLookupResponse> {
    return this.professionals.lookupInvite(token);
  }

  @Public()
  @Post('professional-invites/:token/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resgata o convite: cria a senha e autentica (público)' })
  redeemInvite(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(redeemProfessionalInviteRequestSchema))
    body: RedeemProfessionalInviteRequest,
  ): Promise<LoginResponse> {
    return this.professionals.redeemInvite(token, body.password);
  }

  static _swaggerHints: [
    CreateProfessionalDto,
    UpdateProfessionalDto,
    RedeemProfessionalInviteDto,
  ] = [{} as CreateProfessionalDto, {} as UpdateProfessionalDto, {} as RedeemProfessionalInviteDto];
}
