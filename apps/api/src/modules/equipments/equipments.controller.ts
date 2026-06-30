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
  createEquipmentRequestSchema,
  setServiceEquipmentsRequestSchema,
  updateEquipmentRequestSchema,
  UserRole,
  type CreateEquipmentRequest,
  type SetServiceEquipmentsRequest,
  type UpdateEquipmentRequest,
  ScreenKey,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { Screen } from '../auth/decorators/screen.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { EquipmentsService } from './equipments.service';
import {
  CreateEquipmentDto,
  EquipmentResponseDto,
  SetServiceEquipmentsDto,
  UpdateEquipmentDto,
} from './dto/equipment.dto';

@ApiTags('equipments')
@ApiBearerAuth('access-token')
@Screen(ScreenKey.EQUIPMENTS)
@Controller()
export class EquipmentsController {
  constructor(private readonly equipments: EquipmentsService) {}

  @Roles(UserRole.ADMIN)
  @Post('equipments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria um equipamento na unidade atual' })
  @ApiCreatedResponse({ type: EquipmentResponseDto })
  create(
    @Body(new ZodValidationPipe(createEquipmentRequestSchema)) body: CreateEquipmentRequest,
  ): Promise<EquipmentResponseDto> {
    return this.equipments.create(body) as Promise<EquipmentResponseDto>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('equipments')
  @ApiOperation({ summary: 'Lista equipamentos da unidade' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOkResponse({ type: EquipmentResponseDto, isArray: true })
  list(@Query('includeInactive') includeInactive?: string): Promise<EquipmentResponseDto[]> {
    return this.equipments.findMany(includeInactive === 'true') as Promise<EquipmentResponseDto[]>;
  }

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('equipments/:id')
  @ApiOperation({ summary: 'Detalhe de um equipamento' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  get(@Param('id') id: string): Promise<EquipmentResponseDto> {
    return this.equipments.findById(id) as Promise<EquipmentResponseDto>;
  }

  @Roles(UserRole.ADMIN)
  @Patch('equipments/:id')
  @ApiOperation({ summary: 'Atualiza um equipamento' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEquipmentRequestSchema))
    body: UpdateEquipmentRequest,
  ): Promise<EquipmentResponseDto> {
    return this.equipments.update(id, body) as Promise<EquipmentResponseDto>;
  }

  @Roles(UserRole.ADMIN)
  @Delete('equipments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um equipamento (apenas se não tiver vínculos)' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.equipments.remove(id);
  }

  // --- vínculo com serviços ---

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('services/:serviceId/equipments')
  @ApiOperation({ summary: 'Lista os equipamentos sugeridos para um serviço' })
  @ApiOkResponse({ type: EquipmentResponseDto, isArray: true })
  listEquipmentsOfService(@Param('serviceId') serviceId: string): Promise<EquipmentResponseDto[]> {
    return this.equipments.getEquipmentsOfService(serviceId) as Promise<EquipmentResponseDto[]>;
  }

  @Roles(UserRole.ADMIN)
  @Put('services/:serviceId/equipments')
  @ApiOperation({ summary: 'Substitui o conjunto de equipamentos sugeridos do serviço' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  async setEquipmentsOfService(
    @Param('serviceId') serviceId: string,
    @Body(new ZodValidationPipe(setServiceEquipmentsRequestSchema))
    body: SetServiceEquipmentsRequest,
  ): Promise<void> {
    await this.equipments.setEquipmentsOfService(serviceId, body.equipmentIds);
  }

  static _swaggerHints: [CreateEquipmentDto, UpdateEquipmentDto, SetServiceEquipmentsDto] = [
    {} as CreateEquipmentDto,
    {} as UpdateEquipmentDto,
    {} as SetServiceEquipmentsDto,
  ];
}
