import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types';
import { UnitsService } from './units.service';
import { UnitResponseDto } from './dto/unit-response.dto';

@ApiTags('units')
@ApiBearerAuth('access-token')
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Retorna a unidade do usuário autenticado' })
  @ApiOkResponse({ type: UnitResponseDto })
  getMyUnit(@CurrentUser() user: RequestUser): Promise<UnitResponseDto> {
    return this.units.getById(user.unitId);
  }
}
