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
  createServiceRequestSchema,
  updateServiceRequestSchema,
  UserRole,
  type CreateServiceRequest,
  type UpdateServiceRequest,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { ServicesService } from './services.service';
import { CreateServiceDto, ServiceResponseDto, UpdateServiceDto } from './dto/service.dto';

@ApiTags('services')
@ApiBearerAuth('access-token')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria um novo serviço na unidade do usuário autenticado' })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  create(
    @Body(new ZodValidationPipe(createServiceRequestSchema)) body: CreateServiceRequest,
  ): Promise<ServiceResponseDto> {
    return this.services.create(body) as Promise<ServiceResponseDto>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get()
  @ApiOperation({ summary: 'Lista serviços da unidade (ativos por padrão)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOkResponse({ type: ServiceResponseDto, isArray: true })
  list(@Query('includeInactive') includeInactive?: string): Promise<ServiceResponseDto[]> {
    return this.services.findMany(includeInactive === 'true') as Promise<ServiceResponseDto[]>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um serviço' })
  @ApiOkResponse({ type: ServiceResponseDto })
  get(@Param('id') id: string): Promise<ServiceResponseDto> {
    return this.services.findById(id) as Promise<ServiceResponseDto>;
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza campos de um serviço' })
  @ApiOkResponse({ type: ServiceResponseDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceRequestSchema)) body: UpdateServiceRequest,
  ): Promise<ServiceResponseDto> {
    return this.services.update(id, body) as Promise<ServiceResponseDto>;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um serviço (apenas se não tiver vínculos)' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.services.remove(id);
  }

  // CreateServiceDto/UpdateServiceDto exposed para o Swagger gerar exemplos.
  // (Validação real é feita pelo ZodValidationPipe, não pelos DTOs.)
  static _swaggerHints: [CreateServiceDto, UpdateServiceDto] = [
    {} as CreateServiceDto,
    {} as UpdateServiceDto,
  ];
}
