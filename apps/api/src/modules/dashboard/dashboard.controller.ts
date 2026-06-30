import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, ScreenKey, type DashboardSummary } from '@rpx/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { Screen } from '../auth/decorators/screen.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@Screen(ScreenKey.DASHBOARD)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(UserRole.ADMIN, UserRole.PROFESSIONAL)
  @Get('summary')
  @ApiOperation({ summary: 'Indicadores agregados da unidade para o painel administrativo.' })
  @ApiOkResponse({ description: 'Resumo de indicadores (DashboardSummary).' })
  summary(): Promise<DashboardSummary> {
    return this.dashboard.summary();
  }
}
