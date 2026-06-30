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
  createIdfaceDeviceRequestSchema,
  updateIdfaceDeviceRequestSchema,
  UserRole,
  type CreateIdfaceDeviceRequest,
  type IdfaceDeviceResponse,
  type UpdateIdfaceDeviceRequest,
  ScreenKey,
} from '@rpx/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Screen } from '../../auth/decorators/screen.decorator';
import { ZodValidationPipe } from '../../auth/pipes/zod-validation.pipe';
import { IdfaceDevicesService } from './idface-devices.service';

@ApiTags('integrations/idface')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Screen(ScreenKey.IDFACE)
@Controller('idface-devices')
export class IdfaceDevicesController {
  constructor(private readonly devices: IdfaceDevicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra um equipamento iDFace na unidade.' })
  @ApiCreatedResponse()
  create(
    @Body(new ZodValidationPipe(createIdfaceDeviceRequestSchema)) body: CreateIdfaceDeviceRequest,
  ): Promise<IdfaceDeviceResponse> {
    return this.devices.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Lista equipamentos iDFace da unidade.' })
  @ApiOkResponse()
  list(): Promise<IdfaceDeviceResponse[]> {
    return this.devices.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um equipamento iDFace.' })
  @ApiOkResponse()
  get(@Param('id') id: string): Promise<IdfaceDeviceResponse> {
    return this.devices.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um equipamento iDFace (nome, deviceId, ativo).' })
  @ApiOkResponse()
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIdfaceDeviceRequestSchema)) body: UpdateIdfaceDeviceRequest,
  ): Promise<IdfaceDeviceResponse> {
    return this.devices.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um equipamento iDFace.' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.devices.remove(id);
  }
}
