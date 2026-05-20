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
  updateProfessionalRequestSchema,
  UserRole,
  type CreateProfessionalRequest,
  type ProfessionalResponse,
  type UpdateProfessionalRequest,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { ProfessionalsService } from './professionals.service';
import {
  CreateProfessionalDto,
  ProfessionalResponseDto,
  UpdateProfessionalDto,
} from './dto/professional.dto';

@ApiTags('professionals')
@ApiBearerAuth('access-token')
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria um profissional (junto com seu User PROFESSIONAL)' })
  @ApiCreatedResponse({ type: ProfessionalResponseDto })
  create(
    @Body(new ZodValidationPipe(createProfessionalRequestSchema))
    body: CreateProfessionalRequest,
  ): Promise<ProfessionalResponse> {
    return this.professionals.create(body);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Lista profissionais da unidade' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOkResponse({ type: ProfessionalResponseDto, isArray: true })
  list(@Query('includeInactive') includeInactive?: string): Promise<ProfessionalResponse[]> {
    return this.professionals.findMany(includeInactive === 'true');
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um profissional' })
  @ApiOkResponse({ type: ProfessionalResponseDto })
  get(@Param('id') id: string): Promise<ProfessionalResponse> {
    return this.professionals.findById(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza profissional (nome, registro, serviços habilitados, ativo)',
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
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um profissional (junto com seu User)' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.professionals.remove(id);
  }

  static _swaggerHints: [CreateProfessionalDto, UpdateProfessionalDto] = [
    {} as CreateProfessionalDto,
    {} as UpdateProfessionalDto,
  ];
}
