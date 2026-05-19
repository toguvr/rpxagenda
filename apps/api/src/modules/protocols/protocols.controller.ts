import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  createProtocolRequestSchema,
  updateProtocolRequestSchema,
  UserRole,
  type CreateProtocolRequest,
  type ProtocolResponse,
  type UpdateProtocolRequest,
} from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { ProtocolsService } from './protocols.service';
import { CreateProtocolDto, ProtocolResponseDto, UpdateProtocolDto } from './dto/protocol.dto';

@ApiTags('protocols')
@ApiBearerAuth('access-token')
@Controller()
export class ProtocolsController {
  constructor(private readonly protocols: ProtocolsService) {}

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Post('protocols')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Profissional cria o protocolo clínico na avaliação. Liga-se a um Plano comercial existente. PREMISSA: 1 protocolo ATIVO por plano.',
  })
  @ApiCreatedResponse({ type: ProtocolResponseDto })
  create(
    @Body(new ZodValidationPipe(createProtocolRequestSchema)) body: CreateProtocolRequest,
  ): Promise<ProtocolResponse> {
    return this.protocols.create(body);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Get('protocols/:id')
  @ApiOperation({ summary: 'Detalhe de um protocolo' })
  @ApiOkResponse({ type: ProtocolResponseDto })
  get(@Param('id') id: string): Promise<ProtocolResponse> {
    return this.protocols.findById(id);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Patch('protocols/:id')
  @ApiOperation({
    summary: 'Atualiza campos do protocolo (sessions/diagnosis/observations/active/equipmentIds).',
  })
  @ApiOkResponse({ type: ProtocolResponseDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProtocolRequestSchema)) body: UpdateProtocolRequest,
  ): Promise<ProtocolResponse> {
    return this.protocols.update(id, body);
  }

  @Roles(UserRole.PROFESSIONAL, UserRole.ADMIN)
  @Get('patients/:patientId/protocols')
  @ApiOperation({ summary: 'Lista os protocolos do paciente (ordenado por active+createdAt).' })
  @ApiOkResponse({ type: ProtocolResponseDto, isArray: true })
  listForPatient(@Param('patientId') patientId: string): Promise<ProtocolResponse[]> {
    return this.protocols.listForPatient(patientId);
  }

  static _swaggerHints: [CreateProtocolDto, UpdateProtocolDto] = [
    {} as CreateProtocolDto,
    {} as UpdateProtocolDto,
  ];
}
