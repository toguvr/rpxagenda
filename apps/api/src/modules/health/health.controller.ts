import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Status do sistema e do banco' })
  async check(): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();
    let db: HealthResponse['db'] = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      timestamp,
    };
  }
}
